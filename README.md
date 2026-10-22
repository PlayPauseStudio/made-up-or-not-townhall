# Made Up or Not — frontend only (no server)

A separate copy of quiz-show-live with the tic-tac-toe taken out: two teams of
two, one grid of category tiles (built for ~40 questions, up to 60), and the
question screen with its options. Changes here never touch quiz-show-live.

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

## The format (not final — kept data-driven)

- **Board:** one grid of every question, in order (1–60 tiles; 40 lay out 8 × 5).
  Each tile is a category hiding one question with **2 to 4 options**, one
  correct. A played tile turns the colour of the team that answered it.
- **Turns:** the team whose turn it is picks a tile. Turns alternate after each
  revealed tile (switchable).
- **Scoring:** the tile's points to the answering team if right; optional penalty
  if wrong (Teams & rules tab). Scores can be nudged or set by hand.

## Running a tile (operator → Run show)

Every step is one click and shows on the display. The gold button is always the
next step; **↶ Step back** undoes the last one. The six step chips across the top are also
buttons: click a done step to go back to it (undoing everything after it, points
included), or a later step to run the steps in between. Steps after **Lock
answer** need the team's answer locked first.

1. **Select tile** — click a tile on the left. The display stays on the board with
   that tile lit up with its points (the rest dim); the question is still secret.
   Clicking another tile moves the highlight.
2. **Reveal question** — the display flips to the question, options hidden.
3. **Show options** — one at a time (**Show next option**) or **Show all options**.
4. **Lock answer** — click it on the option the team says; it shows in their colour.
5. **Show if right** — right: the option turns green ✓ and the tile is done.
   Wrong: the team's option turns red.
6. **Reveal correct answer** — only needed after a wrong answer.

Then **Back to board**. A tile cancelled before step 5 goes back unplayed. If the
team gives no answer, **No answer — reveal** shows the answer with no points.

Mistake in the sheet? Edit the question in the Questions tab — if that tile was
already played, it is re-scored automatically. A played tile can be put back on
the board with its **reset** link (its points come off).

**Coin toss** (before the first tile): Show tab → **Show toss screen** puts the
toss up on the display (a gold Heads/Tails coin), pick which team calls
**Heads** (the other gets Tails), then **Flip the coin** — it spins for ~3 s and
the team whose side lands picks first (or **Land it on** Heads/Tails if the toss
was done on stage) — then **Go to the board**. Changing the call clears the flip;
re-flipping is allowed until a tile is opened.

Big-screen controls (right rail): Lobby · Toss · Board · Question · Scores · Final, and
the red **✕ Big X** toggle: a pulsing red wash over the whole display, with the
buzzer, until switched off.

**Sound effects** play on the display: tile picked, question up, answer locked,
right / wrong, correct answer shown, coin toss (drum roll + landing), final
screen and Big X. They are synthesised for
this show by `web/scripts/make-sfx.cjs` (no third-party samples) into
`web/public/sfx/`; edit a cue there and run `node scripts/make-sfx.cjs` in `web/`
to regenerate, or drop in your own .wav with the same name. Turn them off with
Teams & rules → Sound effects. Sounds play
only after someone has clicked the display page once (browsers block sound until then).

**Title artwork:** Teams & rules → Title image takes a wide PNG (transparent
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
- `points` is optional; blank uses Teams & rules → **Points for a right answer** (default 10). Changing that setting moves every unplayed question to the new value; played questions keep what they scored. `note` is for the host only — it shows on the operator
  panel, never on the big screen.

## Show log

Every operator action is recorded: tile selected, question revealed, each option
shown, answer locked, right/wrong (with points), correct answer revealed, step
backs, cancelled tiles, manual score changes, display changes, question edits and
resets — each with the time, team, category, question and both scores after it.

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
