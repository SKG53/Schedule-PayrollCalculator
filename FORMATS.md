# Payroll v26 — Data File Formats

Two kinds of files go into the app: a **Schedule** (the planned roster) and **Actuals** (what actually happened). Below is the exact structure each one needs. Sample files (`Entity1_Schedule.xlsx`, `Entity1_ActualTime.xlsx`, etc.) are in this folder and in your downloads — open them in Excel to see real working examples.

---

## 1. Schedule file (one per entity, per week)

**Filename:** anything — the app asks which entity each upload belongs to.

**Sheet name:** `Schedule` (the first sheet is used regardless of name, but keep it simple).

**Layout:**

| Column A | Column B | Column C | Column D | Column E | Column F | Column G | Column H |
|---|---|---|---|---|---|---|---|
| `Name` | `Sunday` | `Monday` | `Tuesday` | `Wednesday` | `Thursday` | `Friday` | `Saturday` |
| (blank) | 4/12/2026 | 4/13/2026 | 4/14/2026 | 4/15/2026 | 4/16/2026 | 4/17/2026 | 4/18/2026 |
| Emily | OFF | 6:45AM - 2:15PM | 6:45AM - 2:15PM | 6:45AM - 2:15PM | 6:45AM - 2:15PM | 6:45AM - 2:15PM | OFF |
| Marcus | OFF | 7:00AM - 3:00PM | 7:00AM - 3:00PM | OFF | 7:00AM - 3:00PM | 7:00AM - 3:00PM | OFF |

### Rules

- **Row 1** — headers: `Name`, then the seven day names starting with Sunday.
- **Row 2** — the dates for that week (Sunday first). These drive which week is being processed.
- **Rows 3+** — one employee per row.
- **Shift cells** — either a time range like `6:45AM - 2:15PM` or the literal word `OFF`.
  - AM/PM is required.
  - A space-hyphen-space between start and end is the cleanest separator, but `6:45AM-2:15PM` also works.
  - **Overnight shifts** — just write them normally, e.g. `10:00PM - 6:00AM` or `11PM - 7AM`. The app knows an end earlier than the start means the shift crosses midnight.
- **Everyone on the schedule is the roster.** There is no separate employees list. If an employee isn't on the schedule that week, they won't appear in actuals.

---

## 2. Actuals intake file (combined-format xlsx)

The app supports two kinds of actuals input:
1. **Images** — physical timecards or EasyClocking screenshots, run through OCR inside the app.
2. **A combined xlsx** — when you already have clock data from somewhere else.

This section is for the xlsx path.

**Sheet name:** `Employee Time Clock Data` (first sheet is used).

**Columns (row 1 is the header row):**

| Col | Header | Example | Notes |
|---|---|---|---|
| A | `Entity` | `DOWNTOWN STORE` | Free-text label. Doesn't have to match the entity tab name; the app uses whatever tab you uploaded the file into. |
| B | `Employee Name` | `Emily` | Must match the scheduled name (fuzzy match tolerates minor typos). |
| C | `Date` | `4/13/2026` | Excel date. The work date is the clock-in date. |
| D | `Day of the Week` | `Monday` | Optional label, ignored by the app but useful for humans. |
| E | `Clock In 1` | `6:47 AM` | Excel time. |
| F | `Clock Out 1` | `2:16 PM` | Excel time. |
| G | `Clock In 2` | `12:30 PM` | Leave blank if no second punch. |
| H | `Clock Out 2` | `2:15 PM` | |
| I | `Clock In 3` | (blank) | For employees with three punch pairs. |
| J | `Clock Out 3` | (blank) | |

### Rules

- **One row per employee per workday**, even if there are multiple punch pairs. Use columns E–J to express the pairs, not multiple rows.
- **Overnight shifts** — put the clock-in date as the date. For example, a shift that starts `10:00 PM` on 4/14 and ends `6:01 AM` on 4/15 goes on the **4/14** row with `Clock In 1 = 22:00` and `Clock Out 1 = 06:01`.
- **Missing punches** — leave cells blank. The app flags them in the review step.
- **Wage** is NOT in this file — it's set per employee inside the app.

---

## 3. Optional: image intake instead of xlsx

If you don't have a combined xlsx, you can upload:

- **Physical timecard photos** (TOPS 1256 or similar) — handwriting-friendly model (Gemini Pro) reads each stamp row.
- **EasyClocking screenshots** — screenshot-friendly model (Gemini Flash) reads the table rows.

No naming convention required — the app asks which entity each image belongs to, and you review every extracted punch before it hits the payroll sheet.

---

## Quick checklist before uploading

- [ ] Schedule file has Sunday in column B and dates in row 2.
- [ ] Shift cells either say `OFF` or `H:MMAM - H:MMPM`.
- [ ] Actuals xlsx has all 10 headers in row 1 in the exact order above.
- [ ] Overnight shift actuals are dated by clock-in date, not clock-out date.
- [ ] Break minutes required are set per entity (default 0) before you export.
