# Schedule & Payroll Calculator

A lightweight, single-file payroll app that turns weekly schedules and clock-in/out images into a clean payroll report. Runs entirely in your browser — no backend, no database, no vendor lock-in. Multi-entity by design.

## Live app

Once GitHub Pages is enabled on this repo, the app is served at:

`https://<your-username>.github.io/<repo-name>/`

For this repo, replace with your own username + repo name after you enable Pages.

## What it does

- **Schedules tab** — upload or build a weekly schedule per entity. Roster for the week comes from this schedule.
- **Actuals Intake tab** — drop photos of physical timecards and/or EasyClocking screenshots. Gemini OCR extracts every punch pair. You review each row before it hits payroll.
- **Payroll tab** — set wages per employee (hourly or flat), set mandatory break minutes per entity, export a payroll report. Employees with no wage are left blank rather than guessed.

No data is saved on any server. Everything lives in your browser's `localStorage`. That means:
- You can close the tab and come back, your API key is still there.
- Clearing your browser data wipes the app state.
- Nothing about your employees or hours ever leaves your machine except the OCR images you send to Google Gemini.

## Getting started

1. **Get a Gemini API key.** Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey), create a key. Recommended: set a $5-10/month budget cap at [console.cloud.google.com/billing](https://console.cloud.google.com/billing).
2. **Paste it into the app.** Click the Settings button, paste the key, click Save. The badge turns green (`Saved · AIza…xxxx`) when it sticks.
3. **Upload a schedule.** Schedules tab → pick an entity → drop the week's `.xlsx` (format below). The roster is whatever's on the schedule.
4. **Upload your punch data.** Actuals Intake tab → drop images for that entity → click Run OCR. Each image shows queued → running → done/err.
5. **Review.** Each extracted row shows any flags (missing punches, names not on the schedule, etc.). Approve rows manually.
6. **Set wages + break minutes.** Payroll tab. Wages can be hourly or flat per employee.
7. **Export** the payroll report as an `.xlsx`.

## Schedule file format

Sheet 1. Columns A–H:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| `Name` | `Sunday` | `Monday` | `Tuesday` | `Wednesday` | `Thursday` | `Friday` | `Saturday` |
| (blank) | 4/12/2026 | 4/13/2026 | 4/14/2026 | 4/15/2026 | 4/16/2026 | 4/17/2026 | 4/18/2026 |
| Emily | OFF | 6:45AM - 2:15PM | 6:45AM - 2:15PM | 6:45AM - 2:15PM | 6:45AM - 2:15PM | 6:45AM - 2:15PM | OFF |

Shift cells are either `H:MMAM - H:MMPM` or the literal word `OFF`. Overnight shifts like `10:00PM - 6:00AM` work — the app knows an earlier end means it crosses midnight.

## Punch image formats

- **Physical timecards** — TOPS 1256 or similar. The app reads the green machine-stamped punches in the REGULAR TIME column. Attributes each shift to the clock-in date.
- **EasyClocking screenshots** — clean table rows. Each row = one punch pair.

Drop them into the Timecard or EasyClocking drop zone. The app routes each to the right Gemini model (Pro for handwriting, Flash for screenshots).

## Gemini cost

Typical weekly batch costs cents, not dollars. Flash ≈ $0.15 input / $0.60 output per 1M tokens. Pro ≈ $1.25 / $10 per 1M. Images are small. A full week of 10-employee timecards runs well under a penny per week.

## Enabling GitHub Pages

1. Upload `index.html` to the repo root (commit it on `main`).
2. Repo → **Settings** → **Pages**.
3. **Source** = "Deploy from a branch".
4. **Branch** = `main`, **Folder** = `/ (root)`. Save.
5. Wait about 60 seconds, refresh the Pages screen. Your URL appears at the top.

## Files in this repo

- `index.html` — the entire app. Single HTML file, no build step, no dependencies.
- `README.md` — this file.
- `FORMATS.md` — detailed spec of the input file formats.

## License

Use it. Modify it. No warranty.
