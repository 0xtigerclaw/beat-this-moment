import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, world, step, replay, compareRuns, FLOOR, PLAYER } from '../public/engine.js';
import { play } from './support/solver.mjs';

test('the same seed produces the same course', () => {
  assert.deepEqual(world(41), world(41)); assert.notDeepEqual(world(41), world(42));
});
test('hard courses add tall walls, wide barriers and double stacks and remain completable', () => {
  const hard = world(41), classic = world(41, 1);
  assert.ok(hard.obstacles.length > classic.obstacles.length);
  assert.ok(hard.obstacles.some(o => o.h >= 62));
  assert.ok(hard.obstacles.some(o => o.w >= 64));
  assert.ok(hard.obstacles.some((o,i) => i && o.x - hard.obstacles[i-1].x < 55));
  for (const seed of [1, 17, 41, 42, 99, 4294967295]) {
    for (const dash of [false, true]) {
      const run = play(initial(seed), dash);
      assert.ok(replay(initial(seed), run.inputs).completed);
    }
  }
});
test('version-one snapshots retain their original course and recorded result', () => {
  assert.deepEqual(world(41, 1).obstacles[0], {x:360,w:30,h:49});
  const result = replay(initial(41, 1), Array(59).fill(0));
  assert.equal(result.completed, false);
  assert.equal(result.ticks, 59);
  assert.ok(Math.abs(result.distance - 247.8) < 0.000001);
  const completed = play(initial(41, 1), true);
  assert.deepEqual(replay(initial(41, 1), completed.inputs).state, completed.state);
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
  assert.deepEqual(result.trace[0], { x: full.states[index].x, y: full.states[index].y, energy: full.states[index].energy });
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
test('the hard course opens with its easiest hazard and keeps early walls smaller', () => {
  const { obstacles } = world(41);
  assert.deepEqual(obstacles[0], { x: 340, w: 28, h: 30 });
  for (const o of obstacles.filter(o => o.x < 1000)) assert.ok(o.h <= 62, `hazard at ${o.x} is ${o.h} tall`);
  assert.ok(obstacles.some(o => o.h > 62), 'full-size walls still appear later');
});
test('hazards past the finish cannot end a run, except on version-one replays', () => {
  const hidden = { seed: 41, finish: 3600, obstacles: [{ x: 1020, w: 25, h: 30 }] };
  const nearFinish = version => ({ ...initial(41, version), x: 996 });
  assert.equal(step(nearFinish(2), 0, hidden, 1010).status, 'running');
  assert.equal(step(nearFinish(1), 0, hidden, 1010).status, 'crashed');
  assert.equal(step(nearFinish(2), 0, hidden, 1100).status, 'crashed');
  const crossing = { ...nearFinish(2), x: 1006 };
  assert.equal(step(crossing, 0, hidden, 1010).status, 'finished');
});
