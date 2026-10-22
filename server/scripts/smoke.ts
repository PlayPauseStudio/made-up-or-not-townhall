/**
 * End-to-end smoke test against a running dev server (`npm run dev`).
 *
 *   npm run smoke
 *
 * Talks to 127.0.0.1 (the server binds IPv4; Node's fetch prefers ::1 for
 * "localhost"). Needs guests allowed, which is the dev default.
 */
import { io, type Socket } from 'socket.io-client';

const URL = process.env.SMOKE_URL ?? 'http://127.0.0.1:8080';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'letmein';

let failures = 0;
let passes = 0;
function check(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    passes++;
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`, detail ?? '');
  }
}

type AnyState = Record<string, any>;

function connect(role: string, token?: string): Promise<{ s: Socket; state: () => AnyState }> {
  return new Promise((resolve, reject) => {
    let latest: AnyState = {};
    const s = io(URL, { transports: ['websocket'], auth: { role, token }, reconnection: false });
    s.on('state:full', (m: { state: AnyState }) => (latest = m.state));
    s.on('state:patch', (m: { changed: AnyState }) => (latest = { ...latest, ...m.changed }));
    s.on('connect', () => setTimeout(() => resolve({ s, state: () => latest }), 150));
    s.on('connect_error', reject);
  });
}

function emit(s: Socket, event: string, payload: unknown = {}): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s.timeout(4000).emit(event, payload, (err: unknown, ack: any) => resolve(err ? { ok: false, error: 'timeout' } : ack)));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const login = await fetch(`${URL}/auth/operator/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  });
  const { token } = (await login.json()) as { token: string };
  check('operator login issues a token', !!token);
  const bad = await fetch(`${URL}/auth/operator/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'nope' }),
  });
  check('wrong password refused', bad.status === 401);

  const op = await connect('operator', token);
  const disp = await connect('display');
  const getLog = async () => ((await emit(op.s, 'op:getLog')) as any).log as any[];

  let rejected = false;
  await connect('operator', 'forged').catch(() => (rejected = true));
  check('forged operator token rejected', rejected);

  check('fresh full reset', (await emit(op.s, 'op:fullReset')).ok);
  // The log survives resets by design; start this run with an empty one.
  await emit(op.s, 'op:clearLog');
  await wait(100);
  // Full reset keeps the question board, so undo anything an earlier run left behind.
  for (const q of (op.state().questions as any[])) {
    if (!/^q[1-9]$/.test(q.id)) await emit(op.s, 'op:deleteQuestion', { questionId: q.id });
  }
  const q2start = (op.state().questions as any[]).find((q) => q.id === 'q2');
  if (q2start && q2start.correct !== 1) await emit(op.s, 'op:upsertQuestion', { question: { ...q2start, correct: 1 } });
  await wait(100);

  check('display cannot drive the show', (await emit(disp.s, 'op:newGame')).error === 'forbidden');

  // Board
  const board = disp.state().board as any[];
  check('display gets a board', Array.isArray(board) && board.length === 9);
  check('display board has no answers', !JSON.stringify(board).includes('"correct"') && !JSON.stringify(disp.state()).includes('Bunty'));

  // Play-along registration
  await wait(500);

  // Answer before any tile is live

  // MCQ tile q1 (correct = 0), Team A — walked one step at a time
  // Step 1: select — board highlights the tile, question stays secret
  check('select tile', (await emit(op.s, 'op:openTile', { questionId: 'q1' })).ok);
  await wait(100);
  check('display stays on board', disp.state().phase === 'board');
  check('tile highlighted', disp.state().board.find((t: any) => t.id === 'q1').selected === true);
  check('question not public yet', disp.state().round === null && !JSON.stringify(disp.state()).includes('Kajra'));
  check('options refused before question', (await emit(op.s, 'op:revealOption')).error === 'question_not_shown');
  check('re-select moves highlight', (await emit(op.s, 'op:openTile', { questionId: 'q3' })).ok);
  await wait(100);
  check('highlight on new tile', disp.state().board.find((t: any) => t.id === 'q3').selected && !disp.state().board.find((t: any) => t.id === 'q1').selected);
  await emit(op.s, 'op:openTile', { questionId: 'q1' });

  // Step 2: reveal question
  check('show question', (await emit(op.s, 'op:showQuestion')).ok);
  await wait(100);
  let r = disp.state().round;
  check('display on question', disp.state().phase === 'question' && r?.prompt?.includes('Kajra'));
  check('options hidden until revealed', r?.options.every((o: unknown) => o === null));
  check('cannot re-select once question shown', (await emit(op.s, 'op:openTile', { questionId: 'q3' })).error === 'round_in_progress');
  check('cannot lock a hidden option', (await emit(op.s, 'op:lockAnswer', { choice: 0 })).error === 'option_not_shown');

  // Step 3: options
  await emit(op.s, 'op:revealOption');
  await wait(100);
  r = disp.state().round;
  check('first option revealed only', r.options[0] === 'Bunty Aur Babli' && r.options[1] === null);
  await emit(op.s, 'op:revealAllOptions');
  await wait(100);
  r = disp.state().round;
  check('display sees all options', r.options.every((o: unknown) => typeof o === 'string'));
  check('correct still hidden', r.correct === null);

  await wait(100);
  await wait(500);

  // Step 4: lock
  check('verdict needs a lock', (await emit(op.s, 'op:showVerdict')).error === 'no_locked_answer');
  check('team locks A', (await emit(op.s, 'op:lockAnswer', { choice: 0 })).ok);
  await wait(100);
  r = disp.state().round;
  check('lock shown, no verdict yet', r.teamAnswer === 0 && r.verdictShown === false && r.correct === null && r.awarded === null);

  // Step 5: verdict — right, so the answer comes with it
  check('show verdict', (await emit(op.s, 'op:showVerdict')).ok);
  await wait(100);
  r = disp.state().round;
  check('right verdict also reveals answer', r.verdictShown && r.answerRevealed && r.correct === 0);
  check('team A scored 10', disp.state().teams[0].score === 10);

  check('undo takes the verdict and points back', (await emit(op.s, 'op:unrevealAnswer')).ok);
  await wait(100);
  check('score back to 0', disp.state().teams[0].score === 0 && disp.state().round.verdictShown === false);
  await emit(op.s, 'op:showVerdict');
  check('close round', (await emit(op.s, 'op:closeRound')).ok);
  await wait(100);
  check('turn passes to B', disp.state().turn === 'B');
  check('tile marked played', disp.state().board.find((t: any) => t.id === 'q1').played?.teamId === 'A');
  check('played tile cannot reopen', (await emit(op.s, 'op:openTile', { questionId: 'q1' })).error === 'already_played');

  // FoF tile q2 (correct = 1 Fiction), Team B answers wrong
  await emit(op.s, 'op:setSettings', { settings: { wrongPenalty: 5 } });
  check('select fof tile', (await emit(op.s, 'op:openTile', { questionId: 'q2' })).ok);
  await emit(op.s, 'op:showQuestion');
  await wait(100);
  r = disp.state().round;
  check('fof options hidden until shown', r.options[0] === null && r.options[1] === null && r.teamId === 'B');
  await emit(op.s, 'op:revealAllOptions');
  await wait(100);
  r = disp.state().round;
  check('fof shows Fact/Fiction', r.options[0] === 'Fact' && r.options[1] === 'Fiction');
  await emit(op.s, 'op:lockAnswer', { choice: 0 });
  check('reveal before verdict refused', (await emit(op.s, 'op:revealAnswer')).error === 'verdict_first');
  await emit(op.s, 'op:showVerdict');
  await wait(100);
  r = disp.state().round;
  check('wrong verdict keeps correct hidden', r.verdictShown && !r.answerRevealed && r.correct === null);
  check('wrong answer applies penalty', disp.state().teams[1].score === -5);
  check('reveal correct answer', (await emit(op.s, 'op:revealAnswer')).ok);
  await wait(100);
  r = disp.state().round;
  check('correct now shown', r.answerRevealed && r.correct === 1);
  check('note never on the display', r.note === undefined && !JSON.stringify(disp.state()).includes('captained India in 25'));
  check('undo hides answer only', (await emit(op.s, 'op:unrevealAnswer')).ok);
  await wait(100);
  check('verdict and penalty kept', disp.state().round.verdictShown && !disp.state().round.answerRevealed && disp.state().teams[1].score === -5);
  await emit(op.s, 'op:revealAnswer');

  // Correcting the sheet re-scores a played tile
  const q2 = (op.state().questions as any[]).find((q) => q.id === 'q2');
  check('edit correct answer re-scores', (await emit(op.s, 'op:upsertQuestion', { question: { ...q2, correct: 0 } })).ok);
  await wait(100);
  check('team B now +10', disp.state().teams[1].score === 10);
  await emit(op.s, 'op:closeRound');

  // A tile cancelled before any verdict goes back unplayed
  await emit(op.s, 'op:openTile', { questionId: 'q4' });
  await emit(op.s, 'op:showQuestion');
  await emit(op.s, 'op:closeRound');
  await wait(100);
  check('unjudged tile goes back unplayed', disp.state().board.find((t: any) => t.id === 'q4').played === null);

  // No lock at all: revealing the answer closes the tile out with no points
  await emit(op.s, 'op:openTile', { questionId: 'q5' });
  await emit(op.s, 'op:showQuestion');
  check('reveal with no lock', (await emit(op.s, 'op:revealAnswer')).ok);
  await wait(100);
  check('no-lock tile spent, no points', disp.state().round.answerRevealed && disp.state().board.find((t: any) => t.id === 'q5').played?.points === 0);
  await emit(op.s, 'op:closeRound');

  // Stepper jumps: forward runs the steps in between, backward undoes them
  await emit(op.s, 'op:openTile', { questionId: 'q7' });
  check('jump ahead to Lock answer', (await emit(op.s, 'op:goToStep', { step: 3 })).ok);
  await wait(100);
  r = disp.state().round;
  check('jump revealed question and all options', disp.state().phase === 'question' && r.options.every((o: unknown) => typeof o === 'string'));
  check('cannot jump past a missing lock', (await emit(op.s, 'op:goToStep', { step: 6 })).error === 'no_locked_answer');
  await wait(100);
  check('failed jump changed nothing', disp.state().round.verdictShown === false);
  const teamB0 = disp.state().teams[1].score;
  const teamA0 = disp.state().teams[0].score;
  await emit(op.s, 'op:lockAnswer', { choice: 0 });
  check('jump to the end', (await emit(op.s, 'op:goToStep', { step: 6 })).ok);
  await wait(100);
  r = disp.state().round;
  const scored = disp.state().teams.map((t: any) => t.score);
  check('jump judged and revealed', r.verdictShown && r.answerRevealed && r.correct === 1);
  check('jump scored the wrong answer', scored[0] + scored[1] === teamA0 + teamB0 - 5);
  check('jump back to Lock answer', (await emit(op.s, 'op:goToStep', { step: 3 })).ok);
  await wait(100);
  r = disp.state().round;
  check('back: verdict, lock and points undone', !r.verdictShown && r.teamAnswer === null && disp.state().teams[0].score === teamA0 && disp.state().teams[1].score === teamB0);
  check('back: options still up', r.options.every((o: unknown) => typeof o === 'string'));
  check('back: tile no longer played', disp.state().board.find((t: any) => t.id === 'q7').played === null);
  check('jump back to Show options', (await emit(op.s, 'op:goToStep', { step: 2 })).ok);
  await wait(100);
  check('options hidden again', disp.state().round.options.every((o: unknown) => o === null));
  check('jump back to Reveal question', (await emit(op.s, 'op:goToStep', { step: 1 })).ok);
  await wait(100);
  check('question hidden, board highlights tile', disp.state().phase === 'board' && disp.state().round === null && disp.state().board.find((t: any) => t.id === 'q7').selected);
  check('jump back to Select tile', (await emit(op.s, 'op:goToStep', { step: 0 })).ok);
  await wait(100);
  check('tile back on the board unplayed', op.state().round === null && !disp.state().board.some((t: any) => t.selected));
  check('jumps logged', (await getLog()).some((e) => e.event === 'Jumped back a step' && /pts reversed/.test(e.detail)));

  // Show log: operator only, plain-English, in order
  const log = await getLog();
  check('operator state carries the log size, not the log', op.state().log === undefined && op.state().logCount === log.length);
  const events = log.map((e) => e.event);
  const q1 = events.indexOf('Tile selected');
  check('log has the q1 steps in order', q1 >= 0 && ['Question revealed', 'Option shown', 'All options shown', 'Answer locked', 'Answer right'].every((e, i, arr) => events.indexOf(e, q1) > (i ? events.indexOf(arr[i - 1], q1) : q1 - 1)));
  const right = log.find((e) => e.event === 'Answer right');
  check('verdict line has team, category, points and scores', right?.team === 'Team X' && right?.category === 'Bollywood' && right?.detail.includes("+10 pts") && right?.scoreA === 10);
  check('wrong verdict logged with penalty', log.some((e) => e.event === 'Answer wrong' && /-5 pts/.test(e.detail)));
  check('step back logged', events.includes('Verdict undone (step back)') && events.includes('Correct answer hidden (step back)'));
  check('cancelled tile logged', events.includes('Tile cancelled (not played)'));
  check('re-score logged', log.some((e) => e.event === 'Question edited' && /re-scored/.test(e.detail)));
  check('display never gets the log', disp.state().log === undefined);

  // Backup status reaches the operator only
  check('operator sees backup status', op.state().backup?.mode === 'disabled');
  check('display has no backup status', disp.state().backup === undefined);
  const health = (await (await fetch(`${URL}/healthz`)).json()) as { backup?: { mode: string } };
  check('healthz reports backup', health.backup?.mode === 'disabled');

  // CSV-style replace
  check('one-option question refused', (await emit(op.s, 'op:upsertQuestion', { question: { category: 'X', prompt: 'p', options: ['a'], correct: 0 } })).error === 'bad_payload');
  check('blank option refused', (await emit(op.s, 'op:upsertQuestion', { question: { category: 'X', prompt: 'p', options: ['a', ' '], correct: 0 } })).error === 'bad_options');
  check('three-option question accepted', (await emit(op.s, 'op:upsertQuestion', { question: { category: 'Three', prompt: 'Pick one', options: ['x', 'y', 'z'], correct: 2 } })).ok);

  // Big X: flashes by itself on a wrong verdict; the operator's button is a toggle
  check('wrong verdict does not trigger the red screen', disp.state().bigXOn === false);
  check('toggle starts off', disp.state().bigXOn === false);
  check('Big X on', (await emit(op.s, 'op:setBigX', { value: true })).ok);
  await wait(100);
  check('display sees Big X on', disp.state().bigXOn === true);
  check('Big X off', (await emit(op.s, 'op:setBigX', { value: false })).ok);
  await wait(100);
  check('display sees Big X off', disp.state().bigXOn === false);
  check('Big X toggle logged', (await getLog()).filter((e) => /^Big X (on|off)$/.test(e.event)).length === 2);

  // Title image: PNG only, served over HTTP, never inside state
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  check('non-PNG refused', (await emit(op.s, 'op:setTitleImage', { dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' })).error === 'bad_image');
  check('PNG title uploaded', (await emit(op.s, 'op:setTitleImage', { dataUrl: PNG })).ok);
  await wait(100);
  const ti = disp.state().titleImage;
  check('display gets image id and size only', ti?.width === 1 && ti?.height === 1 && !JSON.stringify(disp.state()).includes('base64'));
  const img = await fetch(`${URL}/title-image/${ti?.id}.png`);
  check('image served as PNG', img.status === 200 && img.headers.get('content-type') === 'image/png');
  check('stale image id 404s', (await fetch(`${URL}/title-image/nope.png`)).status === 404);
  check('remove title image', (await emit(op.s, 'op:setTitleImage', { dataUrl: null })).ok);
  await wait(100);
  check('display back to text title', disp.state().titleImage === null);

  const lenBefore = (await getLog()).length;
  await emit(op.s, 'op:fullReset');
  await wait(100);
  const afterReset = await getLog();
  check('log survives a full reset', afterReset.length === lenBefore + 1 && afterReset.at(-1).event === 'Full reset');
  check('clear log', (await emit(op.s, 'op:clearLog')).ok);
  await wait(100);
  check('log empty after clear', (await getLog()).length === 0 && op.state().logCount === 0);
  for (const c of [op, disp]) c.s.disconnect();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
