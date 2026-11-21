// Sokoban solver — make.fun sokoban-solver-01-run-20261121.
//
// The levels are a hallway with rooms off it, each room holding 3 or 4 boxes
// and as many goals, and a box pushed out of a room can never come back, so
// the rooms are independent problems: a level's push-optimal count is the
// sum of its rooms'. This entry solves each room on its own with a
// breadth-first search over pushes — the first solved state it meets is
// push-optimal — then walks the player from room to room and concatenates
// the moves. A level that is no set of rooms falls back to the same search
// over the whole level.
//
// The search prunes two dead ends a box can never leave: a square no push
// can ever carry a box from onto a goal (a dead square, found by pulling
// boxes back from the goals), and a frozen 2 x 2 block of walls and boxes
// with a box off its goal. Neither prunes a solvable state, so the optimum
// stands.
//
// Everything is budgeted by work, never by the wall clock: a search stops
// after a fixed number of states, the tie-breaking is fixed, and no clock
// or environment value is read, so two runs write byte-identical answers.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The most states one room's search keeps before it gives up. */
const MAX_STATES_PER_ROOM = 400_000;
/** The most states the whole-level fallback keeps before it gives up. */
const MAX_STATES_WHOLE = 600_000;

/** The four steps: [dx, dy, walk letter, push letter]. */
const DIRS = [
  [0, -1, 'u', 'U'],
  [0, 1, 'd', 'D'],
  [-1, 0, 'l', 'L'],
  [1, 0, 'r', 'R'],
] as const;

interface Level {
  w: number;
  h: number;
  wall: Uint8Array;
  goals: number[];
  boxes: number[];
  player: number;
}

/** A level in XSB text (# wall, space floor, . goal, $ box, * box on a goal, @ player, + player on a goal). */
function parseLevel(text: string): Level {
  const rows = text.split('\n').filter((r) => r.length > 0);
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const wall = new Uint8Array(w * h).fill(1);
  const goals: number[] = [];
  const boxes: number[] = [];
  let player = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      const i = y * w + x;
      if (ch === '#') continue;
      wall[i] = 0;
      if (ch === '.' || ch === '*' || ch === '+') goals.push(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  // The outermost frame is wall whatever it shows: nothing leaves the board.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wall[y * w + x] = 1;
    }
  }
  return { w, h, wall, goals, boxes: boxes.sort((a, b) => a - b), player };
}

/** The squares a box alone can be pushed from onto some goal, pulled back from the goals over open floor. */
function liveSquares(level: Level): Uint8Array {
  const live = new Uint8Array(level.w * level.h);
  const queue: number[] = [];
  for (const g of level.goals) {
    live[g] = 1;
    queue.push(g);
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const x = queue[qi]!;
    for (const [dx, dy] of DIRS) {
      const d = dy * level.w + dx;
      const y = x - d;
      // A box on y pushed along d lands on x; the player must stand on y - d.
      if (!level.wall[y] && !level.wall[y - d] && !live[y]) {
        live[y] = 1;
        queue.push(y);
      }
    }
  }
  return live;
}

/** The squares the player reaches from `from` with `occupied` in the way, marked in `seen` with `stamp`; the lowest. */
function reach(level: Level, occupied: Uint8Array, from: number, seen: Int32Array, stamp: number, stack: Int32Array): number {
  let low = from;
  let n = 0;
  stack[n++] = from;
  seen[from] = stamp;
  while (n > 0) {
    const p = stack[--n]!;
    if (p < low) low = p;
    for (let k = 0; k < 4; k++) {
      const q = k === 0 ? p - level.w : k === 1 ? p + level.w : k === 2 ? p - 1 : p + 1;
      if (!level.wall[q] && !occupied[q] && seen[q] !== stamp) {
        seen[q] = stamp;
        stack[n++] = q;
      }
    }
  }
  return low;
}

/** Whether the box just pushed to `t` sits in a frozen 2 x 2 block of walls and boxes with a box off its goal. */
function frozenBlock(level: Level, occupied: Uint8Array, goal: Uint8Array, t: number): boolean {
  const w = level.w;
  for (const a of [t, t - 1, t - w, t - w - 1]) {
    const b = a + 1;
    const c = a + w;
    const d = c + 1;
    if (!(level.wall[a] || occupied[a]) || !(level.wall[b] || occupied[b])) continue;
    if (!(level.wall[c] || occupied[c]) || !(level.wall[d] || occupied[d])) continue;
    if ((occupied[a] && !goal[a]) || (occupied[b] && !goal[b]) || (occupied[c] && !goal[c]) || (occupied[d] && !goal[d])) return true;
  }
  return false;
}

/** The shortest walk from `from` to `to` around walls and boxes, in lower LURD letters (u first on ties). */
function walkTo(level: Level, occupied: Uint8Array, from: number, to: number): string {
  if (from === to) return '';
  const prev = new Int32Array(level.w * level.h).fill(-1);
  const how: string[] = new Array(level.w * level.h);
  const queue = [from];
  prev[from] = from;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi]!;
    if (p === to) break;
    for (const [dx, dy, letter] of DIRS) {
      const q = p + dy * level.w + dx;
      if (level.wall[q] || occupied[q] || prev[q] !== -1) continue;
      prev[q] = p;
      how[q] = letter;
      queue.push(q);
    }
  }
  if (prev[to] === -1) throw new Error('walkTo: the push square is out of reach');
  let s = '';
  for (let p = to; p !== from; p = prev[p]!) s = how[p]! + s;
  return s;
}

/** The square the player stands on after `moves` (LURD, case aside) from `from` on a board `w` wide. */
function endOf(w: number, from: number, moves: string): number {
  let p = from;
  for (const ch of moves.toLowerCase()) p += ch === 'u' ? -w : ch === 'd' ? w : ch === 'l' ? -1 : 1;
  return p;
}

/**
 * The push-optimal solution of `level`, searching at most `maxStates` states: {pushes, moves} (moves in LURD: a
 * lower letter a step, an upper one a push), or null when the search gives up (or the level has no solution).
 *
 * A state is the boxes' squares and the player's reachable region, named by its lowest square; the search expands
 * states in order of pushes made, so the first solved state it meets is push-optimal. Two states with the same
 * boxes and the same region are one state: the region's lowest square names it, so the player square stored is only
 * the square the last push left it on.
 */
function solvePushes(level: Level, maxStates: number): { pushes: number; moves: string } | null {
  const size = level.w * level.h;
  const goal = new Uint8Array(size);
  for (const g of level.goals) goal[g] = 1;
  const live = liveSquares(level);
  if (level.boxes.some((b) => !live[b])) return null;

  const occupied = new Uint8Array(size);
  // `seen` marks the region of the state being expanded; `mark` marks the region of each state a push makes.
  const seen = new Int32Array(size);
  const mark = new Int32Array(size);
  const stack = new Int32Array(size);
  let stamp = 0;

  const solved = (boxes: number[]): boolean => boxes.every((b) => goal[b]);

  // A state's key: the region's lowest square and the boxes' squares. As digits in base `size` while the boxes
  // are few (a room holds at most four); as text when there are more, so the key never overflows.
  const numericKey = level.boxes.length <= 4;
  const keyOf = (boxes: number[], low: number): number | string => {
    if (!numericKey) return low + ':' + boxes.join(',');
    let k = low;
    for (const b of boxes) k = k * size + b;
    return k;
  };

  // The states in the order found: their boxes, the player's square, the push that made them from their parent.
  const stateBoxes: number[][] = [level.boxes.slice()];
  const statePlayer: number[] = [level.player];
  const parent: number[] = [-1];
  const pushFrom: number[] = [-1];
  const pushTo: number[] = [-1];
  const index = new Map<number | string, number>();
  for (const b of level.boxes) occupied[b] = 1;
  index.set(keyOf(level.boxes, reach(level, occupied, level.player, seen, ++stamp, stack)), 0);
  for (const b of level.boxes) occupied[b] = 0;

  let found = solved(level.boxes) ? 0 : -1;
  for (let head = 0; found < 0 && head < stateBoxes.length; head++) {
    const boxes = stateBoxes[head]!;
    for (const b of boxes) occupied[b] = 1;
    reach(level, occupied, statePlayer[head]!, seen, ++stamp, stack);
    const here = stamp;
    for (let bi = 0; bi < boxes.length && found < 0; bi++) {
      const b = boxes[bi]!;
      for (let k = 0; k < 4; k++) {
        const [dx, dy] = DIRS[k]!;
        const d = dy * level.w + dx;
        const t = b + d;
        // The player must reach the square behind the box, and the box must land on floor, on a live square.
        if (seen[b - d] !== here || level.wall[t] || occupied[t] || !live[t]) continue;
        occupied[b] = 0;
        occupied[t] = 1;
        const frozen = frozenBlock(level, occupied, goal, t);
        let key: number | string = '';
        let next: number[] | null = null;
        if (!frozen) {
          next = boxes.slice();
          next[bi] = t;
          next.sort((x, y) => x - y);
          key = keyOf(next, reach(level, occupied, b, mark, ++stamp, stack));
        }
        occupied[t] = 0;
        occupied[b] = 1;
        if (frozen || index.has(key)) continue;
        if (stateBoxes.length >= maxStates) {
          for (const x of boxes) occupied[x] = 0;
          return null;
        }
        index.set(key, stateBoxes.length);
        stateBoxes.push(next!);
        statePlayer.push(b);
        parent.push(head);
        pushFrom.push(b);
        pushTo.push(t);
        if (solved(next!)) {
          found = stateBoxes.length - 1;
          break;
        }
      }
    }
    for (const x of boxes) occupied[x] = 0;
  }
  if (found < 0) return null;

  // The path of states, then the moves: walk to each push's square, then push.
  const path: number[] = [];
  for (let s = found; s > 0; s = parent[s]!) path.push(s);
  path.reverse();
  let moves = '';
  let player = level.player;
  let boxes = level.boxes.slice();
  for (const s of path) {
    const nextBoxes = stateBoxes[s]!;
    const from = pushFrom[s]!;
    const to = pushTo[s]!;
    const d = to - from;
    const dir = DIRS.find(([dx, dy]) => dy * level.w + dx === d)!;
    for (const b of boxes) occupied[b] = 1;
    moves += walkTo(level, occupied, player, from - d);
    for (const b of boxes) occupied[b] = 0;
    moves += dir[3];
    player = from;
    boxes = nextBoxes;
  }
  return { pushes: path.length, moves };
}

interface Room {
  squares: number[];
  boxes: number[];
  goals: number[];
  done?: boolean;
}

/**
 * The level's rooms: cut the dead squares of the player's row (the hallway: a box there reaches no goal) out of
 * the floor, and each part left that holds a box is a room, its squares, boxes and goals. Null when some part
 * holds more or fewer boxes than goals, a goal lies in the cut, or a box starts in the hallway: then the level is
 * no set of rooms.
 */
function roomsOf(level: Level): Room[] | null {
  const live = liveSquares(level);
  const row = Math.floor(level.player / level.w);
  const cut = new Uint8Array(level.w * level.h);
  for (let i = row * level.w; i < (row + 1) * level.w; i++) {
    if (!level.wall[i] && !live[i]) cut[i] = 1;
  }
  if (level.boxes.some((b) => cut[b])) return null;
  const part = new Int32Array(level.w * level.h).fill(-1);
  const rooms: Room[] = [];
  for (let s = 0; s < level.w * level.h; s++) {
    if (level.wall[s] || cut[s] || part[s] >= 0) continue;
    const squares = [s];
    part[s] = rooms.length;
    for (let i = 0; i < squares.length; i++) {
      for (const [dx, dy] of DIRS) {
        const q = squares[i]! + dy * level.w + dx;
        if (!level.wall[q] && !cut[q] && part[q] < 0) {
          part[q] = rooms.length;
          squares.push(q);
        }
      }
    }
    rooms.push({ squares, boxes: [], goals: [] });
  }
  for (const b of level.boxes) rooms[part[b]!]!.boxes.push(b);
  for (const g of level.goals) {
    if (part[g]! < 0) return null;
    rooms[part[g]!]!.goals.push(g);
  }
  if (rooms.some((r) => r.boxes.length !== r.goals.length)) return null;
  return rooms.filter((r) => r.boxes.length > 0);
}

/**
 * The level solved room by room: each room's push-optimal solution in turn, the other rooms' boxes standing as
 * walls (on their goals once their room is done), the player walking on from where the last room left it. A box
 * never leaves its room, so the rooms' optima add up to the level's. Null (an empty answer) when a room's search
 * gives up, or the level is no set of rooms and the search over the whole level gives up.
 */
function solveLevel(text: string): string {
  const level = parseLevel(text);
  const rooms = roomsOf(level);
  if (rooms !== null) {
    let player = level.player;
    let moves = '';
    let ok = true;
    for (const room of rooms) {
      const wall = level.wall.slice();
      for (const other of rooms) {
        if (other === room) continue;
        for (const b of other.done ? other.goals : other.boxes) wall[b] = 1;
      }
      const sub: Level = {
        w: level.w,
        h: level.h,
        wall,
        goals: room.goals.slice().sort((a, b) => a - b),
        boxes: room.boxes.slice().sort((a, b) => a - b),
        player,
      };
      const solved = solvePushes(sub, MAX_STATES_PER_ROOM);
      if (solved === null) {
        ok = false;
        break;
      }
      moves += solved.moves;
      player = endOf(level.w, player, solved.moves);
      room.done = true;
    }
    if (ok) return moves;
  }
  const whole = solvePushes(level, MAX_STATES_WHOLE);
  return whole === null ? '' : whole.moves;
}

for (const id of readdirSync(INPUT_DIR).sort()) {
  const moves = solveLevel(readFileSync(join(INPUT_DIR, id, 'level.txt'), 'utf8'));
  mkdirSync(join(OUTPUT_DIR, id), { recursive: true });
  writeFileSync(join(OUTPUT_DIR, id, 'solution.txt'), `${moves}\n`);
}
