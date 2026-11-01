import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, world, step, replay, compareRuns, FLOOR, PLAYER } from '../public/engine.js';

export function play(snapshot = initial(), dash = false, finish = world(snapshot.seed).finish) {
  let s = { ...snapshot }; const map = world(s.seed), inputs = [], states = [{ ...s }];
  while (s.status === 'running' && inputs.length < 3000) {
    const next = map.obstacles.find(o => o.x + o.w > s.x);
    const jump = next && next.x - s.x < (dash && s.energy > 2 ? 90 : 65) && s.y === FLOOR - PLAYER.h && !s.jumpHeld;
    const input = (jump ? 1 : 0) | (dash ? 2 : 0);
    inputs.push(input); s = step(s, input, map, finish); states.push({ ...s });
  }
  return { inputs, states, state: s };
}

test('the same seed produces the same course', () => {
  assert.deepEqual(world(41), world(41)); assert.notDeepEqual(world(41), world(42));
});
test('jump and dash can finish the course, and replay is exact', () => {
  for (const dash of [false, true]) {
    const run = play(initial(), dash); assert.equal(run.state.status, 'finished');
    assert.deepEqual(replay(initial(), run.inputs).state, run.state);
  }
});
test('a snapshot taken mid-jump reproduces every later state', () => {
  const full = play(initial(), true); const index = full.states.findIndex(s => s.y < FLOOR - PLAYER.h && s.frame > 100);
  assert.ok(index > 0);
  const result = replay(full.states[index], full.inputs.slice(index));
  assert.deepEqual(result.state, full.state);
  assert.deepEqual(result.trace[0], { x: full.states[index].x, y: full.states[index].y });
});
test('crashes are terminal; invalid inputs and incomplete runs are rejected', () => {
  let s = initial(); const inputs=[]; while(s.status==='running'){inputs.push(0);s=step(s,0);}
  assert.equal(replay(initial(), inputs).completed, false);
  assert.throws(() => replay(initial(), [...inputs, 0]), /continues/);
  assert.throws(() => replay(initial(), [4]), /Invalid/);
  assert.throws(() => replay(initial(), [0]), /Finish or crash/);
  assert.throws(() => replay({ ...initial(), x: NaN }, [0]), /Invalid/);
});
test('finishers outrank crashes; faster runs win; crashes rank by distance', () => {
  const crash={completed:false,distance:900,ticks:100,jumps:1,createdAt:1};
  const finish={completed:true,distance:1600,ticks:400,jumps:5,createdAt:2};
  assert.ok(compareRuns(finish, crash)<0);
  assert.ok(compareRuns({...finish,ticks:390},finish)<0);
  assert.ok(compareRuns({...crash,distance:1000},crash)<0);
});
