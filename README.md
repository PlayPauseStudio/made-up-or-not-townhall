# Made Up or Not — live (server-backed)

A separate copy of quiz-show-live with the tic-tac-toe taken out: two teams of
two, one grid of category tiles (built for ~40 questions, up to 60), and the
question screen with its options. Changes here never touch quiz-show-live.

```
made-up-or-not-live/
  server/   Express + Socket.IO — the authority for game state (Railway)
  web/      Next.js static export — /operator, /display (Railway, served by `serve`)
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
question and final screens. The file is kept on the server (and in
Redis), not in game state, so it is not re-sent on every click.

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
Full reset (and server restarts, via Redis); only **Clear log** empties it. The
panel only holds the log's size and latest line — the full log is fetched when you
export, so it never slows down the clicks during the show.

## What each screen is allowed to see

The correct answer exists only on the server and the operator panel until the
reveal. The display gets the prompt and the options that are up — never `correct`
before the reveal, never an unrevealed option, never the host's notes.

## Running locally

```bash
cd server && cp .env.example .env && npm install && npm run dev   # :8080, password letmein
cd web && npm install && npm run dev                              # :3000
```

Verify the server: `cd server && npm run smoke` (needs `npm run dev` running;
talks to 127.0.0.1 — set `SMOKE_URL` for another port).

## Deploying (both on Railway: two services in one project)

**Server** — service with root directory `server` (Dockerfile build, health check `/healthz`):

| variable | value |
|---|---|
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | the web service's URL, no trailing slash |
| `JWT_SECRET` | a long random string |
| `OPERATOR_PASSWORD_HASH` | `npm run hash -- 'the password'` |
| `REDIS_URL` | optional — without it a restart mid-show loses state |

**Web** — service with root directory `web` (`web/railway.json`: `npm run build`, then
`npm start` serves the static export on `$PORT`):

| variable | value |
|---|---|
| `NEXT_PUBLIC_WS_URL` | the server service's URL (https) |

`NEXT_PUBLIC_*` are inlined at **build** time: after changing it, redeploy the web
service.
