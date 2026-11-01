// Search actual simulation states for a valid run. No scores or traces are fabricated.
import { initial, world, step, FLOOR, PLAYER } from '../../public/engine.js';

export function play(snapshot = initial(), dash = false, finish = world(snapshot.seed, snapshot.version).finish) {
  const map = world(snapshot.seed, snapshot.version);
  let candidates = [{ state: { ...snapshot }, previous: null }];
  for (let frame = 0; frame < 2000 && candidates.length; frame++) {
    const next = new Map();
    for (const candidate of candidates) {
      const s = candidate.state;
      const canJump = s.y === FLOOR - PLAYER.h && !s.jumpHeld;
      for (const jump of canJump ? [0, 1] : [0]) {
        const input = jump | (dash ? 2 : 0), state = step(s, input, map, finish);
        if (state.status === 'crashed') continue;
        const node = { state, input, previous: candidate };
        if (state.status === 'finished') {
          const states = [], inputs = [];
          for (let n = node; n; n = n.previous) {
            states.push(n.state);
            if (n.previous) inputs.push(n.input);
          }
          return { state, states: states.reverse(), inputs: inputs.reverse() };
        }
        const key = `${state.x}:${state.y}:${state.vy}:${state.energy}:${state.jumpHeld}`;
        if (!next.has(key)) next.set(key, node);
      }
    }
    candidates = [...next.values()];
  }
  throw new Error(`No valid route found for seed ${snapshot.seed}, version ${snapshot.version}, dash ${dash}`);
}
