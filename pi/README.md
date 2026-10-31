# FrostPure Pi — step-by-step setup

The Raspberry Pi reads the tank sensors every minute and sends the readings to Supabase, where the
FrostPure Lab page shows them live. The Pi signs in as its **own "pi" user**, which can only *add*
readings — it cannot read or change anything else. Its password lives only on the Pi.

You can do **Part A and Part B now**, before the parts arrive, and test everything with fake
sensors (`--simulate`). Part C is for when the parts are in hand.

---

## Part A — accounts (once, on the laptop, ~5 min)

1. **Run the database setup** (if not done yet): Supabase dashboard → *SQL Editor* → *New query* →
   paste `supabase/migrations/20261101090000_frostpure.sql` → *Run*.
2. **Create the pi user**: Supabase dashboard → *Authentication* → *Users* → *Add user* →
   *Create new user*.
   - Email: any address you control, e.g. `yourname+pi@icloud.com` (iCloud delivers `+` addresses to you).
   - Password: a long random one (e.g. from Passwords on the Mac). **Write it down for step B6 — it goes only on the Pi.**
   - Tick **Auto Confirm User** → *Create user*.
3. **Link the pi user to your account**: *SQL Editor* → *New query* → paste this, replace the two
   e-mails, *Run*. You should see "Success. 1 row".

   ```sql
   insert into public.telemetry_devices (device_user, owner, device_id)
   select pi.id, me.id, 'ayaz-pi-01'
   from auth.users pi, auth.users me
   where pi.email = 'PI_EMAIL' and me.email = 'YOUR_EMAIL'
   on conflict (device_user) do update set owner = excluded.owner, device_id = excluded.device_id;
   ```

## Part B — the Pi's software (~30 min)

1. **Flash the SD card** on the laptop with *Raspberry Pi Imager* (raspberrypi.com/software):
   - Device: your Pi model (3B+, 4, 5 or Zero 2 W all work). OS: **Raspberry Pi OS Lite (64-bit)**.
   - Click the gear / *Edit settings*: hostname `frostpure`, **username `pi`** and a password,
     your Wi-Fi name and password, Wi-Fi country **KZ**, time zone **Asia/Almaty**. On *Services*, enable **SSH**.
   - Write, put the card in the Pi, power it on, wait 2 minutes.
2. **Connect** from the Mac's Terminal: `ssh pi@frostpure.local` (type `yes`, then the Pi's password).
3. **Turn on I²C and 1-Wire**: `sudo raspi-config` → *Interface Options* → *I2C* → *Yes*;
   *Interface Options* → *1-Wire* → *Yes* (it uses GPIO4) → *Finish* → `sudo reboot`, then ssh in again.
4. **Get the code**:

   ```bash
   sudo apt update && sudo apt install -y git python3-venv python3-lgpio
   git clone https://github.com/dossymzhanrashat/dosym-os.git ~/dosym-os
   mkdir -p ~/frostpure && cp ~/dosym-os/pi/* ~/frostpure/
   cd ~/frostpure
   python3 -m venv --system-site-packages venv
   ./venv/bin/pip install -r requirements.txt
   ```

5. **Config**: in the app open **FrostPure › Build › Pi setup**, type the pi user's e-mail under
   *config.json for the Pi*, tap **Copy config.json**. On the Pi:

   ```bash
   sudo mkdir -p /etc/frostpure
   sudo nano /etc/frostpure/config.json     # paste (⌘V), then Ctrl+O, Enter, Ctrl+X
   ```

6. **Password** (only on the Pi, never in the app or the repo):

   ```bash
   sudo nano /etc/frostpure/password        # type the pi user's password, Ctrl+O, Enter, Ctrl+X
   sudo chown root:pi /etc/frostpure/password && sudo chmod 640 /etc/frostpure/password
   ```

7. **Test with fake sensors** (works without any parts):

   ```bash
   ./venv/bin/python frostpure_sender.py --simulate --state-dir /tmp/fp
   ```

   After a minute it prints "Sent 1 reading(s)". In the app, start a run in **Lab** first; its
   *Live telemetry* card shows the fake tank cooling and freezing. Stop with Ctrl+C.
   If you see `not linked to a telemetry device`, redo step A3.

8. **Run it as a service** (starts on boot, restarts on errors):

   ```bash
   sudo cp frostpure.service /etc/systemd/system/
   sudo systemctl enable --now frostpure
   journalctl -u frostpure -f               # live log; Ctrl+C to leave
   ```

   (Keep `"simulate": true` in the config until the sensors are wired, or the readings will be empty.)

## Part C — when the parts arrive (Build guide steps 1–9)

| What | Pins (BCM numbers) | Check |
| --- | --- | --- |
| Power | 12 V battery → **5 A fuse** → buck 5.1 V (Pi USB-C / 5V pin) and buck 6 V (servo rail). **All grounds joined.** | Multimeter: 5.1 V and 6 V before connecting the Pi |
| DS18B20 × 6 | data → GPIO4, 3.3 V, GND; **4.7 kΩ between data and 3.3 V** | `python3 frostpure_sender.py --read-raw` lists six `28-…` IDs |
| ADS1115 | SDA → GPIO2, SCL → GPIO3, 3.3 V, GND; EC1 board → A0, EC2 → A1 | `--read-raw` shows volts on A0/A1 |
| JSN-SR04T | TRIG → GPIO23; ECHO → GPIO24 **through a divider (e.g. 1 kΩ + 2 kΩ)**; 5 V, GND | `--read-raw` shows a distance |
| Servos V2 / V3 | signal → GPIO18 / GPIO19; power from the 6 V rail, ground shared with the Pi | `--test-valves` moves both |
| Solenoid V1 | MOSFET module input → GPIO17; 1N4007 across the solenoid | — |

Then, in the app's **Pi setup** page:

1. Put the six probe IDs next to T1–T5 and air, with each depth (5, 10, 15, 20, 25 cm).
2. Calibrate EC: mix 3 salt solutions (e.g. 2, 4, 6 g/L), measure each with the handheld meter, and
   run `--read-raw` for the volts. Enter the pairs, then tap **Fit the line**.
3. Level: run `--read-raw` with the tank empty and full and enter both distances; set the water depth.
4. Servo angles: find each valve's open and closed angle (start at 0° and 90°), and test with `--test-valves`.
5. **Copy config.json** again, paste it over `/etc/frostpure/config.json` with `"simulate": false`,
   then `sudo systemctl restart frostpure`.

**Automatic drain** stays off until you tick *Let the Pi open the drain* in Pi setup and copy the
config again. With it on, the Pi opens V2 (and turns V3 to brine) when ice reaches the target %
(or EC1 reaches its limit), and closes it when the tank is empty or after 30 minutes.

## Useful commands

```bash
python3 frostpure_sender.py --set-run <run id>   # tag readings with a run (id from the run's address in the app)
python3 frostpure_sender.py --set-phase freeze   # freeze | drain | sweat | harvest | idle
python3 frostpure_sender.py --once               # one reading, printed, not sent
sudo systemctl restart frostpure                 # after changing config.json
journalctl -u frostpure -n 50                    # last 50 log lines
```

Readings are kept in `/var/lib/frostpure/buffer.jsonl` while Wi-Fi is down and sent later.
Readings older than 180 days are removed from the database automatically.

## Safety

- Keep 12 V wiring and the Pi away from water: IP65 box, fuse, cable glands.
- Never charge a lithium battery below 0 °C.
- Ice expands about 9%: never freeze a sealed container.
- Ice-melt water is **not drinking water** until a lab has tested it.
