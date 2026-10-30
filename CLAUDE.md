# Dosym OS — rules for Claude

- Build the web app described in SPEC.md, one phase per session, following the **Build plan** section. The **WEB EDITION** section of SPEC.md overrides everything else in it.
- Tick acceptance criteria (`- [x]`) in SPEC.md as you complete them. Anything marked **[TO CONFIRM]** must be asked, not guessed.
- Ask before adding any library that is not in the **Tech stack** table. Never commit secrets (Supabase service key, VAPID private key, the Pi's password); the browser only ever gets the public anon key.
- The user is new to web development: explain each step in simple words, and say exactly what to click or type whenever you need them to do something.

## Project facts

- Live site: https://dossymzhanrashat.github.io/dosym-os/ (GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`).
- Repo: `dossymzhanrashat/dosym-os` (public). A daily Claude scheduled task writes `public/data/opportunities.json` into it — keep that path and the repo name stable.
- The site lives under the `/dosym-os/` sub-path: use `import.meta.env.BASE_URL` for fetches and assets, never a bare `/`.
- Commands: `npm run dev` (local preview), `npm run build` (type-check + build), `npm test` (Vitest).
