# Dosym OS design system — "Deep Blue" (FrostPure logo style)

This file replaces the Design system section of SPEC.md (the earlier light "ice and amber" brand board is retired). The look comes from the FrostPure logo, Lean Canvas, "One cold night" and "Impact & fit" boards: deep navy space, glassy rounded cards, an iridescent cyan → violet gradient, and the glossy droplet mascot.

## Mood in one line
Night sky over the steppe: dark, calm, glassy, with light glowing in from two corners and one iridescent accent.

## Colour tokens (dark is the default theme)

| Token | Value | Use |
| --- | --- | --- |
| `--bg-deep` | `#050a16` | Darkest base |
| `--bg` | `linear-gradient(160deg, #0d1834 0%, #081022 55%, #050a16 100%)` | Page background |
| `--glow-tl` | `radial-gradient(55% 70% at 0% 0%, rgba(70,110,255,0.6), rgba(70,110,255,0) 62%)` | Blue glow, top-left corner of page |
| `--glow-br` | `radial-gradient(50% 65% at 100% 100%, rgba(0,180,255,0.42), rgba(0,180,255,0) 62%)` | Cyan glow, bottom-right corner |
| `--card` | `linear-gradient(180deg, rgba(30,42,74,0.72) 0%, rgba(14,22,44,0.8) 100%)` | Glass card fill |
| `--card-border` | `rgba(143,200,255,0.18)` | 1 px card border |
| `--card-border-soft` | `rgba(143,200,255,0.10)` | Inner dividers, chips |
| `--card-shadow` | `0 18px 40px rgba(0,0,0,0.45)` | Card shadow |
| `--chip` | `rgba(143,200,255,0.08)` | Pills, tags, inputs |
| `--text` | `#ffffff` | Headings, key numbers |
| `--text-2` | `rgba(222,233,255,0.74)` | Body text |
| `--text-3` | `rgba(170,200,255,0.78)` | Labels, eyebrow text, axis labels |
| `--ice` | `#8ff1ff` | Cyan: clean water, primary accent, focus rings |
| `--sky` | `#5fb8ff` | Blue: links, lines, secondary series |
| `--periwinkle` | `#7f88ff` | Mid-gradient, selected tab |
| `--violet` | `#c27bff` | Salty water / brine, highlights, "Pure" end of gradient |
| `--pure-gradient` | `linear-gradient(100deg, #8ff1ff 0%, #5fb8ff 30%, #7f88ff 62%, #c27bff 100%)` | Wordmark "Pure", hero words, progress fills, primary button |
| `--warm` | `#ffb36b` | Warnings, deadlines within 7 days, sun/sweat phase |
| `--good` | `#7dffb0` | Done, safe-to-drink, success |
| `--danger` | `#ff7a9a` | Errors (use sparingly) |

Light theme (optional, secondary): page `#eef3ff`, cards `#ffffff` with border `rgba(60,90,180,0.14)`, text `#0b1430`, body `#33466e`; keep the same accent hues but darken `--ice` to `#0e8fb0` and `--violet` to `#8a3fd6` for 4.5:1 contrast. Default to dark; follow `prefers-color-scheme` only if the user switches "Auto" in Settings.

Contrast rule: `--text-2` on `--card` passes 4.5:1. Gradient text is only for 28 px+ display words, never body text.

## Type

| Role | Font | Settings |
| --- | --- | --- |
| Display, headings, big numbers, wordmark | **Archivo** (variable, self-host via @fontsource-variable/archivo with width axis) | weight 800, `font-stretch: 125%` (extended), letter-spacing −0.02em on 40 px+; numbers use `font-variant-numeric: tabular-nums` |
| Eyebrow labels ("FROSTPURE · HOW IT WORKS") | Archivo | weight 600–700, 11–12 px, uppercase, letter-spacing 0.14em, colour `--text-3` |
| Body, UI | **Manrope** (self-host via @fontsource) | 400 / 500 / 600 / 700, 15–16 px body, line-height 1.5; covers Cyrillic for Kazakh/Russian (verify ә, ғ, қ, ң, ө, ұ, ү, һ, і render; fall back to system font for any missing glyph) |
| Data, timers, sensor readings | Manrope or Archivo with `tabular-nums` | No separate mono font |

Wordmark: "Frost" white + "Pure" filled with `--pure-gradient` (background-clip: text), Archivo 800 at 125% width.

## Shapes and surfaces

- Cards: `--card` fill, 1 px `--card-border`, radius **26 px** (large), **18 px** (medium), **10 px** (small/chips); `--card-shadow`; optional `backdrop-filter: blur(12px)` where supported.
- Numbered step badge: small rounded square (radius 8–9 px), `--chip` fill, Archivo 700 number ("01").
- Pills/buttons: fully rounded. Primary = `--pure-gradient` fill with `#050a16` text, weight 700. Secondary = `--chip` fill + `--card-border` + white text. Min height 44 px.
- Icon buttons: round, `--chip` fill, thin line icons in `--text-3`.
- Dividers: `--card-border-soft`.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48.

## Motifs

- **Corner glows** on every page background (`--glow-tl`, `--glow-br` layered over `--bg`).
- **The tank / freeze front:** ice at top (pale `#e4ecff` → `--ice` lines), a glowing cyan freeze line, salty water below in violet (`--violet` → `#9a6bff`), small dark salt dots sinking. Used for progress bars (`FreezeFrontBar`), loaders, empty states and section headers. Ice on top, salt below — never flip.
- **Droplet mascot** (`brand/droplet.svg`): glossy iridescent drop with two dark eyes. Use as app icon base, loading/empty-state character, and celebration moments (streak milestones, submitted application, successful experiment). A small subtle bounce on celebrations; respect `prefers-reduced-motion`.
- **Droplet row meter** (from "60% of groundwater" card): a row of small droplets, filled violet = salty, filled cyan = drinkable — reuse for ratios.
- **Charts:** dark plot area, thin grid `--card-border-soft`, series in `--ice`, `--violet`, `--sky`, `--warm`; dashed reference lines; labels in `--text-3`.

## Components to (re)build

`AppBackground`, `GlassCard`, `StepBadge`, `Eyebrow`, `GradientText`, `PillButton` (primary/secondary), `Chip`, `FreezeFrontBar`, `SaltDotsLoader`, `DropletMeter`, `Mascot` (wraps droplet.svg with moods: idle, happy, sleepy), `StatTile` (big Archivo number + label + small chart slot), `TabBar` (phone) / `SideNav` (laptop) with the selected item showing a gradient underline/glow.

## Don'ts

- No flat light-blue/amber look from the old brand board.
- No stock photos, no emoji.
- Gradient only as the one accent (wordmark, primary button, progress, hero words) — not on every card.
- Body text never in gradient or in pure cyan/violet.
