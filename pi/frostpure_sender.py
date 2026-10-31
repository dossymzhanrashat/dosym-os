#!/usr/bin/env python3
"""FrostPure sender: reads the tank sensors on the Raspberry Pi and posts them to Supabase.

Runs as a systemd service (see README.md). Every reading goes to an offline buffer first
(state_dir/buffer.jsonl) and is uploaded in batches of up to 200, so nothing is lost when
Wi-Fi drops. The Pi signs in as its own "pi" user, which may only INSERT into `telemetry`.
The drain control runs here, on the Pi, so the tank stays safe when the phone is offline.

Usage:
  python3 frostpure_sender.py                     # normal service loop
  python3 frostpure_sender.py --simulate          # fake sensors: test the whole path without parts
  python3 frostpure_sender.py --read-raw          # print probe IDs, temps, ADS1115 volts, distance
  python3 frostpure_sender.py --once              # one reading, printed, not sent
  python3 frostpure_sender.py --test-valves       # move V2 and V3 to each position (control off is fine)
  python3 frostpure_sender.py --set-run <run id>  # tag readings with a run (copy the id from the app)
  python3 frostpure_sender.py --set-phase drain   # freeze | drain | sweat | harvest | idle
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

FW = "0.1.0"
ALMATY = timezone(timedelta(hours=5))
PHASES = {"idle", "freeze", "drain", "sweat", "harvest"}


def log(*args):
    print(datetime.now(ALMATY).strftime("%H:%M:%S"), *args, flush=True)


# ---------------------------------------------------------------- config and state


def load_config(path: str) -> dict:
    with open(path) as f:
        cfg = json.load(f)
    for key in ("supabase_url", "anon_key", "email", "device_id"):
        if not cfg.get(key):
            sys.exit(f"config.json: '{key}' is missing")
    return cfg


class State:
    """seq counter, run id and phase, kept across restarts."""

    def __init__(self, folder: Path):
        self.folder = folder
        folder.mkdir(parents=True, exist_ok=True)
        self.file = folder / "state.json"
        self.data = {"seq": 0, "run_id": None, "phase": "freeze", "drain_started": None}
        if self.file.exists():
            self.data.update(json.loads(self.file.read_text()))

    def reload(self):
        """Pick up --set-run / --set-phase written by another process."""
        if self.file.exists():
            self.data.update(json.loads(self.file.read_text()))

    def save(self):
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data))
        tmp.replace(self.file)

    def next_seq(self) -> int:
        self.data["seq"] += 1
        self.save()
        return self.data["seq"]


# ---------------------------------------------------------------- sensors


def read_ds18b20(dev_id: str):
    """Temperature in °C from /sys/bus/w1/devices/<id>/w1_slave, or None."""
    try:
        lines = Path(f"/sys/bus/w1/devices/{dev_id}/w1_slave").read_text().splitlines()
        if not lines[0].strip().endswith("YES"):
            return None  # CRC failed
        t = int(lines[1].split("t=")[1]) / 1000
        return None if t == 85.0 else round(t, 2)  # 85 °C = power-on reset value
    except (OSError, IndexError, ValueError):
        return None


def list_ds18b20():
    return sorted(Path(p).name for p in glob.glob("/sys/bus/w1/devices/28-*"))


class Ads:
    """ADS1115 on I²C (adafruit-circuitpython-ads1x15). Missing hardware → None readings."""

    def __init__(self):
        self.ok = False
        try:
            import board  # type: ignore
            import busio  # type: ignore
            import adafruit_ads1x15.ads1115 as ADS  # type: ignore
            from adafruit_ads1x15.analog_in import AnalogIn  # type: ignore

            ads = ADS.ADS1115(busio.I2C(board.SCL, board.SDA))
            pins = [getattr(ADS, f"P{i}", i) for i in range(4)]
            self.channels = [AnalogIn(ads, p) for p in pins]
            self.ok = True
        except Exception as e:  # noqa: BLE001 — no board, no library, no I²C
            log("ADS1115 not available:", e)

    def volts(self, ch: int):
        if not self.ok:
            return None
        try:
            return round(self.channels[ch].voltage, 4)
        except Exception:  # noqa: BLE001
            return None


class Level:
    """JSN-SR04T distance in cm via gpiozero (echo through a 5 V → 3.3 V divider)."""

    def __init__(self, cfg: dict):
        self.sensor = None
        try:
            from gpiozero import DistanceSensor  # type: ignore

            self.sensor = DistanceSensor(echo=cfg["echo_gpio"], trigger=cfg["trig_gpio"], max_distance=4)
        except Exception as e:  # noqa: BLE001
            log("Level sensor not available:", e)

    def distance_cm(self):
        if not self.sensor:
            return None
        try:
            return round(self.sensor.distance * 100, 1)
        except Exception:  # noqa: BLE001
            return None


class Valves:
    """V2 drain and V3 diverter on servos; V1 fill on a MOSFET. Servos detach after each move."""

    def __init__(self, cfg: dict, simulate: bool):
        self.cfg = cfg
        self.simulate = simulate
        self.state = {"V1": "closed", "V2": "closed", "V3": "clean"}
        self.servos = {}
        if simulate:
            return
        try:
            from gpiozero import AngularServo  # type: ignore

            for key, s in cfg.get("servos", {}).items():
                self.servos[key] = AngularServo(s["gpio"], min_angle=0, max_angle=180, min_pulse_width=0.0005, max_pulse_width=0.0025)
        except Exception as e:  # noqa: BLE001
            log("Servos not available:", e)

    def move(self, key: str, position: str):
        s = self.cfg.get("servos", {}).get(key)
        if s is None:
            return
        angle = s["open_deg"] if position in ("open", "brine") else s["closed_deg"]
        servo = self.servos.get(key)
        if servo is not None:
            servo.angle = angle
            time.sleep(1.0)
            servo.detach()  # stop jitter and save power
        self.state[key] = position
        log(f"{key} → {position} ({angle}°)")


# ---------------------------------------------------------------- reading


def ice_depth(temps: dict, probes: dict, threshold: float):
    depth, measured = None, False
    for key, p in probes.items():
        t = temps.get(key)
        if key == "air" or t is None or p.get("depth_cm") is None:
            continue
        measured = True
        if t <= threshold and (depth is None or p["depth_cm"] > depth):
            depth = p["depth_cm"]
    return depth if depth is not None else (0 if measured else None)


def ec25(ec, temp):
    return None if ec is None else (ec if temp is None else round(ec / (1 + 0.02 * (temp - 25)), 3))


class Sim:
    """Plausible fake readings: the tank cools, ice grows from the top, brine gets saltier."""

    def __init__(self):
        self.t0 = time.time()

    def read(self, cfg):
        h = (time.time() - self.t0) / 3600 * 6  # 6× speed: a night in ~2 hours
        depth = min(25.0, 2.2 * h)
        temps = {}
        for key, p in cfg["probes"].items():
            if key == "air":
                temps[key] = round(-14 + 2 * math.sin(h) + random.uniform(-0.3, 0.3), 2)
            else:
                d = p.get("depth_cm") or 0
                temps[key] = round((-3 if d <= depth else 1.5 - 0.2 * h) + random.uniform(-0.2, 0.2), 2)
        frac = depth / (cfg.get("water_depth_cm") or 30)
        ec1 = round(6.25 / max(0.2, 1 - frac) + random.uniform(-0.05, 0.05), 2)
        return temps, {"EC1": ec1, "EC2": None}, round(max(0.0, 30 - depth * 0.1), 1)


def build_payload(cfg, state, ads, level, valves, sim):
    probes = cfg.get("probes", {})
    if sim:
        temps, ec, distance = sim.read(cfg)
        ec_temp = {"EC1": temps.get("T5")}
    else:
        temps = {key: (read_ds18b20(p["id"]) if p.get("id") else None) for key, p in probes.items()}
        liquid = [temps[k] for k in sorted(probes) if k != "air" and temps.get(k) is not None]
        t_liquid = liquid[-1] if liquid else None  # deepest probe ≈ the water around EC1
        ec, ec_temp = {}, {}
        for key, e in cfg.get("ec", {}).items():
            v = ads.volts(e["channel"])
            ec[key] = None if v is None else ec25(round(e["slope"] * v + e["offset"], 3), t_liquid)
            ec_temp[key] = t_liquid
        distance = level.distance_cm()
    lv = cfg.get("level", {})
    level_cm = round(lv["empty_cm"] - distance, 1) if distance is not None and lv.get("empty_cm") is not None else None
    depth = ice_depth(temps, probes, cfg.get("ice_threshold_c", -0.3))
    return {
        "device_id": cfg["device_id"],
        "run_id": state.data.get("run_id"),
        "ts": datetime.now(ALMATY).isoformat(timespec="seconds"),
        "seq": state.next_seq(),
        "phase": state.data.get("phase", "freeze"),
        "temps_c": temps,
        "ec_ms_cm": ec,
        "ec_temp_c": ec_temp,
        "level_cm": level_cm,
        "level_distance_cm": distance,
        "ice_depth_cm": depth,
        "valves": dict(valves.state),
        "power": {"battery_v": None, "load_w": None},
        "fw": FW,
        "simulated": bool(sim),
    }


# ---------------------------------------------------------------- control (runs on the Pi)


def control_step(cfg, state, valves, payload):
    """Drain when ice ≥ target % (or EC1 ≥ limit); close after the tank empties or 30 min."""
    c = cfg.get("control", {})
    if not c.get("enabled"):
        return
    phase = state.data.get("phase")
    water = cfg.get("water_depth_cm")
    depth = payload.get("ice_depth_cm")
    ice_pct = depth / water * 100 if depth is not None and water else None
    ec1 = (payload.get("ec_ms_cm") or {}).get("EC1")
    if phase == "freeze":
        hit_ice = ice_pct is not None and ice_pct >= c.get("target_ice_pct", 65)
        hit_ec = c.get("ec1_limit_ms") is not None and ec1 is not None and ec1 >= c["ec1_limit_ms"]
        if hit_ice or hit_ec:
            log("Drain rule met:", "ice" if hit_ice else "EC1", ice_pct, ec1)
            valves.move("V3", "brine")
            valves.move("V2", "open")
            state.data.update(phase="drain", drain_started=time.time())
            state.save()
    elif phase == "drain":
        started = state.data.get("drain_started") or time.time()
        empty = payload.get("level_cm") is not None and payload["level_cm"] <= 1
        if empty or time.time() - started > c.get("drain_max_min", 30) * 60:
            valves.move("V2", "closed")
            valves.move("V3", "clean")
            state.data.update(phase="harvest", drain_started=None)
            state.save()


# ---------------------------------------------------------------- Supabase


class Supabase:
    def __init__(self, cfg):
        self.url = cfg["supabase_url"].rstrip("/")
        self.key = cfg["anon_key"]
        self.email = cfg["email"]
        self.password = Path(cfg.get("password_file", "/etc/frostpure/password")).read_text().strip()
        self.token, self.refresh, self.expires = None, None, 0.0

    def _auth(self, body: dict, grant: str):
        r = requests.post(f"{self.url}/auth/v1/token?grant_type={grant}", json=body, headers={"apikey": self.key}, timeout=15)
        r.raise_for_status()
        j = r.json()
        self.token, self.refresh = j["access_token"], j["refresh_token"]
        self.expires = time.time() + j.get("expires_in", 3600) - 120

    def ensure_token(self):
        if self.token and time.time() < self.expires:
            return
        try:
            if self.refresh:
                return self._auth({"refresh_token": self.refresh}, "refresh_token")
        except requests.RequestException:
            pass
        self._auth({"email": self.email, "password": self.password}, "password")
        log("Signed in as", self.email)

    def insert(self, rows: list[dict]):
        self.ensure_token()
        r = requests.post(
            f"{self.url}/rest/v1/telemetry?on_conflict=device_user,device_id,seq",
            json=rows,
            headers={
                "apikey": self.key,
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "Prefer": "resolution=ignore-duplicates,return=minimal",
            },
            timeout=20,
        )
        if r.status_code == 401:
            self.token = None
        if not r.ok:
            raise requests.HTTPError(f"{r.status_code} {r.text[:200]}")


def to_row(p: dict) -> dict:
    return {"device_id": p["device_id"], "run_id": p.get("run_id"), "seq": p["seq"], "ts": p["ts"], "phase": p.get("phase"), "payload": p}


def flush(buffer: Path, db: Supabase):
    """Send buffered readings, 200 at a time, oldest first; keep whatever fails."""
    if not buffer.exists():
        return
    lines = [ln for ln in buffer.read_text().splitlines() if ln.strip()]
    while lines:
        batch = lines[:200]
        db.insert([to_row(json.loads(ln)) for ln in batch])
        lines = lines[200:]
        tmp = buffer.with_suffix(".tmp")
        tmp.write_text("".join(ln + "\n" for ln in lines))
        tmp.replace(buffer)
        log(f"Sent {len(batch)} reading(s), {len(lines)} left")


# ---------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default="/etc/frostpure/config.json")
    ap.add_argument("--state-dir", default=None, help="default: /var/lib/frostpure (or ./frostpure-state if that is not writable)")
    ap.add_argument("--simulate", action="store_true")
    ap.add_argument("--read-raw", action="store_true")
    ap.add_argument("--once", action="store_true")
    ap.add_argument("--test-valves", action="store_true")
    ap.add_argument("--set-run", metavar="RUN_ID")
    ap.add_argument("--set-phase", choices=sorted(PHASES))
    a = ap.parse_args()

    cfg = load_config(a.config)
    simulate = a.simulate or cfg.get("simulate", False)
    folder = Path(a.state_dir) if a.state_dir else Path("/var/lib/frostpure")
    if not a.state_dir and not os.access(folder.parent if not folder.exists() else folder, os.W_OK):
        folder = Path("frostpure-state")
    state = State(folder)

    if a.set_run is not None or a.set_phase:
        if a.set_run is not None:
            state.data["run_id"] = a.set_run or None
        if a.set_phase:
            state.data["phase"] = a.set_phase
        state.save()
        print("run:", state.data["run_id"], "phase:", state.data["phase"], "(the service picks this up within one interval)")
        return

    if a.read_raw:
        print("DS18B20 probes:")
        for dev in list_ds18b20() or ["(none found — is 1-Wire on and the 4.7 kΩ pull-up in place?)"]:
            print(f"  {dev}: {read_ds18b20(dev) if dev.startswith('28-') else ''}")
        ads = Ads()
        for ch in range(4):
            print(f"ADS1115 A{ch}: {ads.volts(ch)} V")
        print("Level distance:", Level(cfg.get("level", {})).distance_cm(), "cm")
        return

    valves = Valves(cfg, simulate)
    if a.test_valves:
        for key, positions in (("V2", ("open", "closed")), ("V3", ("brine", "clean"))):
            for p in positions:
                valves.move(key, p)
                time.sleep(1)
        return

    sim = Sim() if simulate else None
    ads = None if simulate else Ads()
    level = None if simulate else Level(cfg.get("level", {}))

    if a.once:
        print(json.dumps(build_payload(cfg, state, ads, level, valves, sim), indent=2))
        return

    db = Supabase(cfg)
    buffer = folder / "buffer.jsonl"
    log(f"FrostPure sender {FW} · {cfg['device_id']} · {'SIMULATED' if simulate else 'sensors'} · state in {folder}")
    while True:
        started = time.time()
        try:
            state.reload()
            payload = build_payload(cfg, state, ads, level, valves, sim)
            control_step(cfg, state, valves, payload)
            with buffer.open("a") as f:
                f.write(json.dumps(payload) + "\n")
            flush(buffer, db)
        except requests.RequestException as e:
            log("Offline, keeping readings for later:", e)
        except Exception as e:  # noqa: BLE001 — keep the loop alive; systemd also restarts on exit
            log("Error:", repr(e))
        interval = cfg.get("interval_s", {}).get("drain" if state.data.get("phase") == "drain" else "freeze", 60)
        time.sleep(max(1, interval - (time.time() - started)))


if __name__ == "__main__":
    main()
