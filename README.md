# Made Up or Not — frontend only (no server)

A separate copy of quiz-show-live with the tic-tac-toe and the teams taken out:
one set of questions (built for ~40, up to 60) shown one by one, no teams or
scores. Changes here never touch quiz-show-live.

**There is no server.** The game runs in the browser: the same rules code the
quiz show's server uses (`web/src/engine/`) applies every click, saves the whole
game in the browser (localStorage; the title image in IndexedDB) and tells the
other windows to re-read (BroadcastChannel).

> **The operator and the display must be two windows of the same browser on the
> same laptop**: the operator on the laptop's screen, the display full-screen on
> the second screen / HDMI out (e.g. into the Cam Link). Two different computers
> cannot talk to each other in this version.

- A refresh of either window is safe: the game is saved after every click.
- Clearing the browser's site data, a private window or a different browser
  starts a fresh show (export the show log first if you need it).
- The operator password is checked in the browser (a SHA-256 hash in
  `web/src/lib/realtime.ts`): it keeps a passer-by out; it is not a real lock.

```
made-up-or-not-live/
  web/   Next.js static export — /operator, /display (Vercel)
```

## The format

- **No teams, no scores.** The questions roll one by one, in the order they are
  in the Questions tab (1–60; built for ~40).
- Each question has a category and **2 to 4 options**, one correct.
- The **Board** screen shows every question as a category tile, done ones ticked
  off — useful as an overview between questions; it is optional.

## Running the show (operator → Run show)

The gold button is always the next step; **↶ Step back** undoes the last one.

1. **Show question N on display** — the next question goes straight up, with its
   category and "Question N of M" on top, options hidden.
2. **Show options** — one at a time (**Show next option**) or **Show all options**.
3. **Reveal the answer** — the correct option turns green ✓, the rest fade.
   (**Reveal answer now** skips straight there.)
4. **Next question (N) →** — the next question not yet done goes up.

Click any question in the list on the left to put that one up instead. A done
question can be made "not done" again with its **reset** link. After the last
question the button becomes **All done — final screen**.

Big-screen controls (right rail): Lobby · Board · Question · Final, and the red
**✕ Big X** toggle: a pulsing red wash over the whole display, with the buzzer,
until switched off.

**Sound effects** play on the display: question up, answer revealed, final
screen and Big X. They are synthesised for this show by
`web/scripts/make-sfx.cjs` (no third-party samples) into `web/public/sfx/`. Turn
them off in Settings → Sound effects. Sounds play only after someone has clicked
the display page once (browsers block sound until then).

**Title artwork:** Settings → Title image takes a wide PNG (transparent
background, cropped tight, ≤ 5 MB). It replaces the title text on the lobby,
question and final screens. It is kept in this browser (IndexedDB), so upload it
on the show laptop.

## Loading questions

Questions tab → **Import CSV** (replaces the board). Download **CSV template** for
the exact shape:

```csv
category,question,option_a,option_b,option_c,option_d,answer,points,note
Geography,What is the capital of Australia?,Sydney,Melbourne,Canberra,Perth,C,10,
Space,Which planet has a day longer than its year?,Mars,Venus,Jupiter,,B,10,
Animals,Octopuses have three hearts.,True,False,,,A,10,Two pump blood to the gills.
```

- Fill **2 to 4 options**, starting at option_a with no gaps. There is no type
  column (an old one is ignored). Rows that break this are rejected with the row
  number, and nothing is imported until the sheet is fixed.
- `answer`: a letter (A–D), a number (1–4), or the option's text.
- `points` is still accepted (the template is unchanged) but not used — there is no
  scoring. `note` is for the host only: it shows on the operator panel, never on
  the big screen.

## Show log

Every operator action is recorded: tile selected, question revealed, each option
shown, answer revealed, step backs, display changes, question edits and resets —
each with the time, category and question.

**Run show → Show log → Export CSV** downloads it. The log survives New game and
Full reset and refreshes; only **Clear log** empties it.

## What each screen is allowed to see

The display page is only given what it should show: until the reveal it gets the
prompt and the options that are up, never the correct answer, an unrevealed
option or the host's notes. (Everything is in the same browser, so this keeps the
screen honest rather than secret.)

## Running locally

```bash
cd web && npm install && npm run dev     # http://localhost:3000 — /operator and /display
```

## Deploying (Vercel)

Vercel → **Add New → Project** → import `PlayPauseStudio/made-up-or-not-townhall`
→ **Root Directory** `web` (framework Next.js, detected) → **Deploy**. No
environment variables. Every push to `main` redeploys.

On show day open `<vercel-url>/operator` and `<vercel-url>/display` in the same
browser on the show laptop; drag the display window to the second screen and
press F11. Click the display once so the browser lets it play sound.
