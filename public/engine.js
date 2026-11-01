export const VERSION = 2;
export const FLOOR = 380;
export const PLAYER = { w: 26, h: 32 };
export const MAX_TICKS = 7200;

export function world(seed = 41, version = VERSION) {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const obstacles = [];
  let x = version === 1 ? 360 : 340;
  while (x < 3400) {
    if (version === 1) {
      // Preserve the original layout exactly for saved challenges and replays.
      obstacles.push({ x, w: 27 + Math.floor(rnd() * 12), h: 32 + Math.floor(rnd() * 18) });
      x += 205 + Math.floor(rnd() * 70);
      continue;
    }
    const kind = Math.floor(rnd() * 3);
    if (kind === 0) {
      obstacles.push({ x, w: 32 + Math.floor(rnd() * 9), h: 62 + Math.floor(rnd() * 12) });
    } else if (kind === 1) {
      const width = 23 + Math.floor(rnd() * 5), gap = 15 + Math.floor(rnd() * 7);
      obstacles.push({ x, w: width, h: 25 + Math.floor(rnd() * 7) });
      obstacles.push({ x: x + width + gap, w: 23 + Math.floor(rnd() * 5), h: 25 + Math.floor(rnd() * 7) });
    } else {
      obstacles.push({ x, w: 64 + Math.floor(rnd() * 10), h: 31 + Math.floor(rnd() * 7) });
    }
    x += 196 + Math.floor(rnd() * 49);
  }
  return { seed, obstacles, finish: 3600 };
}

export function initial(seed = 41, version = VERSION) {
  return { version, seed, x: 90, y: FLOOR - PLAYER.h, vy: 0, frame: 0, energy: 100, jumps: 0, jumpHeld: false, status: 'running' };
}

export function validSnapshot(s) {
  return [1, VERSION].includes(s?.version) && Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 4294967295
    && Number.isInteger(s.frame) && s.frame >= 0 && s.frame <= MAX_TICKS
    && ['x','y','vy','energy','jumps'].every(k => Number.isFinite(s[k]))
    && s.x >= 0 && s.x < 3600 && s.y >= 0 && s.y <= FLOOR - PLAYER.h
    && Math.abs(s.vy) < 30 && s.energy >= 0 && s.energy <= 100
    && Number.isInteger(s.jumps) && s.jumps >= 0 && typeof s.jumpHeld === 'boolean' && s.status === 'running';
}

export function step(s, input, map = world(s.seed, s.version), finish = map.finish) {
  if (s.status !== 'running') return s;
  const jump = !!(input & 1), dash = !!(input & 2);
  const grounded = s.y >= FLOOR - PLAYER.h - 0.01;
  let vy = s.vy, jumps = s.jumps;
  if (jump && !s.jumpHeld && grounded) { vy = -11.5; jumps++; }
  const boosting = dash && s.energy >= 1.8;
  const x = s.x + (boosting ? 6.2 : 4.2);
  let y = s.y + vy;
  vy += 0.68;
  if (y >= FLOOR - PLAYER.h) { y = FLOOR - PLAYER.h; vy = 0; }
  const energy = Math.max(0, Math.min(100, s.energy + (boosting ? -1.8 : 0.65)));
  let status = x >= finish ? 'finished' : 'running';
  if (map.obstacles.some(o => x + PLAYER.w > o.x && x < o.x + o.w && y + PLAYER.h > FLOOR - o.h && y < FLOOR)) status = 'crashed';
  return { ...s, x, y, vy, energy, frame: s.frame + 1, jumps, jumpHeld: jump, status };
}

export function replay(snapshot, inputs, finish = world(snapshot.seed, snapshot.version).finish) {
  if (!validSnapshot(snapshot) || !Array.isArray(inputs) || !inputs.length || inputs.length > MAX_TICKS
    || inputs.some(n => !Number.isInteger(n) || n < 0 || n > 3)) throw new Error('Invalid run data.');
  const map = world(snapshot.seed, snapshot.version);
  let state = { ...snapshot };
  const trace = [{ x: state.x, y: state.y }];
  for (let i = 0; i < inputs.length; i++) {
    if (state.status !== 'running') throw new Error('Run continues after its finish.');
    state = step(state, inputs[i], map, finish);
    trace.push({ x: state.x, y: state.y });
  }
  if (state.status === 'running') throw new Error('Finish or crash before submitting.');
  return { state, trace, ticks: inputs.length, seconds: inputs.length / 60, distance: Math.min(finish - snapshot.x, state.x - snapshot.x), completed: state.status === 'finished', jumps: state.jumps - snapshot.jumps };
}

export function compareRuns(a, b) {
  return Number(b.completed) - Number(a.completed) || (a.completed ? a.ticks - b.ticks : b.distance - a.distance) || a.jumps - b.jumps || a.createdAt - b.createdAt;
}
