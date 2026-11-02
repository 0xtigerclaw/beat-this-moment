import { FLOOR, PLAYER, initial, world, step, MAX_TICKS } from './engine.js';

const $ = (id) => document.getElementById(id);
const viewerId = location.pathname.startsWith('/c/') ? location.pathname.split('/')[2] : null;
const overlayMode = location.pathname === '/overlay';
const broadcastMode = new URLSearchParams(location.search).get('broadcast') === '1';
document.body.classList.toggle('viewer', !!viewerId);
document.body.classList.toggle('overlay-mode', overlayMode);
document.body.classList.toggle('broadcast-mode', broadcastMode);
if (overlayMode) $('overlay').hidden = false;
let info,
  challenge,
  isHost = false,
  mode = viewerId ? 'challenge' : 'practice';
let sim = initial(),
  map = world(sim.seed, sim.version),
  finish = map.finish,
  startState = { ...sim };
let running = false,
  starting = false,
  raceTicket,
  inputs = [],
  history = [],
  savedMoment = null;
let keys = { jump: false, dash: false },
  ghost = null,
  ghostName = '',
  ghostRunId = null;
let replayOnly = false,
  replayFrame = 0,
  replayTrace = null,
  replayName = '';
let attempts = 0,
  toastTimer,
  connectionLost = false,
  refreshSequence = 0,
  playerSession;
let joinToken = new URLSearchParams(location.search).get('join');
let currentRunName = '';
const canvas = $('game'),
  ctx = canvas.getContext('2d');
function guestId() {
  try {
    let value = localStorage.getItem('btm-guest-id');
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem('btm-guest-id', value);
    }
    return value;
  } catch {
    return undefined;
  }
}

async function api(url, data) {
  const response = await fetch(
    url,
    data === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => ($('toast').hidden = true), 5500);
}
function formatTime(seconds) {
  return seconds.toFixed(2).padStart(5, '0');
}
function text(tag, value, className) {
  const el = document.createElement(tag);
  el.textContent = value;
  if (className) el.className = className;
  return el;
}
function screen(kicker, title, description, button = 'Try again', hint = 'SPACE TO RETRY') {
  $('screen-kicker').textContent = kicker;
  $('screen-title').textContent = title;
  $('screen-description').textContent = description;
  $('start').replaceChildren(text('span', button), text('span', '↗'));
  $('screen-hint').textContent = hint;
  $('game-screen').hidden = false;
}
function setMode(next) {
  if (running || starting) return toast('Finish this run before switching.');
  mode = next;
  replayOnly = false;
  $('game-mode').textContent = mode === 'practice' ? 'PRACTICE' : 'CHALLENGE';
  const hard = mode === 'practice' || challenge.snapshot.version >= 2;
  $('difficulty').textContent = hard ? 'HARD / NIGHT SHIFT' : 'CLASSIC / V1';
  $('course-subtitle').textContent = hard
    ? 'Double stacks. Tight windows. No second chances.'
    : 'The original course. Make the jump.';
  $('round-label').textContent =
    mode === 'practice' ? 'PRACTICE / NO SCORE SUBMITTED' : 'SAME START / EVERY RACER';
  $('switch-mode').textContent = mode === 'practice' ? 'Race the active challenge ↗' : 'Back to practice ↗';
  sim = mode === 'practice' ? initial() : { ...challenge.snapshot };
  startState = { ...sim };
  map = world(sim.seed, sim.version);
  finish = mode === 'practice' ? map.finish : challenge.finish;
  screen(
    mode === 'practice' ? 'A LITTLE LESS TALK.' : 'EXACT SAME START.',
    mode === 'practice' ? 'Make your move.' : 'Your turn, chat.',
    mode === 'practice'
      ? 'Clear the freight. Dash for a faster time.'
      : `You have ${Math.round(finish - sim.x).toLocaleString()}m to prove it.`,
    'Launch run',
    'SPACE TO START · JUMP / DASH',
  );
  updateHud();
}
function updateHud() {
  const frame = replayOnly && replayTrace ? Math.min(replayFrame, replayTrace.length - 1) : null;
  const seconds = frame === null ? (sim.frame - startState.frame) / 60 : frame / 60;
  const distance = frame === null ? sim.x - startState.x : replayTrace[frame].x - replayTrace[0].x;
  const energy = frame === null ? sim.energy : replayTrace[frame].energy;
  $('time').replaceChildren(document.createTextNode(formatTime(seconds)), text('span', 's'));
  $('distance').replaceChildren(
    document.createTextNode(String(Math.max(0, Math.round(distance))).padStart(4, '0')),
    text('span', 'm'),
  );
  $('energy-value').textContent = `${Math.round(energy)}%`;
  $('energy-fill').style.width = `${energy}%`;
}
// Phones stack the game above the entry form, so a run could otherwise start off-screen.
function showGame() {
  const arena = document.querySelector('.arena'),
    controls = document.querySelector('.touch-controls');
  const top = arena.getBoundingClientRect().top;
  const bottom = (controls.offsetParent ? controls : arena).getBoundingClientRect().bottom;
  if (top >= 0 && bottom <= window.innerHeight) return;
  arena.scrollIntoView({
    block: 'start',
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}
function runResult(run) {
  return run.completed ? `${formatTime(run.seconds)}s` : `${Math.floor(run.distance)}m`;
}
function showGhostLabel() {
  const top = challenge?.leaderboard[0];
  $('ghost-label').textContent = !top
    ? 'Ghost replay available after the first submitted run'
    : ghostRunId === top.id
      ? `Ghost to beat: ${ghostName} · ${runResult(top)}`
      : 'Ghost unavailable. Scores are still saved.';
}
function endReplay() {
  replayOnly = false;
  replayTrace = null;
  replayName = '';
  setMode('challenge');
  showGhostLabel();
}
function renderScores(c) {
  const list = $('scores');
  list.replaceChildren();
  $('empty-board').hidden = c.leaderboard.length > 0;
  c.leaderboard.forEach((run, i) => {
    const row = document.createElement('li');
    row.append(text('span', String(i + 1).padStart(2, '0'), `rank ${i === 0 ? 'first' : ''}`));
    const racer = text('span', run.name, 'racer');
    racer.append(text('small', run.identity === 'twitch' ? 'TWITCH CHAT ENTRY' : 'GUEST'));
    const result = text(
      'span',
      run.completed ? `${formatTime(run.seconds)}s` : `${Math.floor(run.distance)}m`,
      'result',
    );
    result.append(text('small', run.completed ? `${run.jumps} JUMPS · FINISHED` : 'CRASHED'));
    const watch = text('button', '▷', 'replay-button');
    watch.setAttribute('aria-label', `Watch ${run.name}'s replay`);
    watch.addEventListener('click', () => watchReplay(c.id, run.id).catch((e) => toast(e.message)));
    row.append(racer, result, watch);
    if (isHost) {
      const remove = text('button', '×', 'replay-button remove-button');
      remove.setAttribute('aria-label', `Remove ${run.name} from the board`);
      remove.addEventListener('click', () => removeRun(c.id, run).catch((e) => toast(e.message)));
      row.append(remove);
    }
    list.append(row);
  });
}
function renderOverlay(c) {
  $('overlay-title').textContent = c.title;
  $('overlay-count').textContent = `${c.attempts} ATTEMPTS`;
  const list = $('overlay-scores');
  list.replaceChildren();
  if (!c.leaderboard.length) {
    list.append(text('li', 'Be first. Take the challenge.'));
    return;
  }
  c.leaderboard.slice(0, 5).forEach((run, i) => {
    const li = document.createElement('li');
    const name = text('span', run.name);
    name.prepend(text('span', `${i + 1}.`, 'rank'));
    li.append(
      name,
      text('span', run.completed ? `${formatTime(run.seconds)}s` : `${Math.floor(run.distance)}m`),
    );
    list.append(li);
  });
}
async function loadGhost(c) {
  const top = c.leaderboard[0];
  ghost = null;
  ghostName = '';
  ghostRunId = null;
  if (top) {
    try {
      const data = await api(`/api/replays/${c.id}/${top.id}`);
      if (challenge?.id !== c.id) return;
      ghost = data.trace;
      ghostName = data.name;
      ghostRunId = top.id;
    } catch {}
  }
  if (!replayOnly) showGhostLabel();
}
async function refresh(data) {
  info = data;
  const sequence = ++refreshSequence;
  const status = data.twitch;
  $('connection').classList.toggle('connected', status.connected);
  $('connection').replaceChildren(
    text('i', ''),
    document.createTextNode(
      connectionLost
        ? 'Reconnecting to server'
        : status.connected
          ? `twitch.tv/${status.channel}`
          : status.connecting
            ? 'Connecting Twitch…'
            : 'Local session',
    ),
  );
  $('redirect-url').textContent = `${data.publicUrl}/auth/callback`;
  $('setup-status').textContent =
    status.error ||
    (status.connected
      ? `Connected to ${status.channel}. Chat commands are listening.`
      : status.configured
        ? `Ready to connect ${status.ownerChannel || 'your channel'}. Twitch will ask permission to read and send chat messages.`
        : 'Twitch is not connected. Add your application credentials to enable authorization.');
  $('connect-twitch').disabled = !status.configured || (!isHost && !status.ownerLogin);
  $('host-unlock').hidden = isHost || (status.configured && status.ownerLogin);
  document.querySelector('.setup-steps').hidden = status.configured;
  document.querySelector('.setup-footnote').hidden = status.configured;
  $('disconnect-twitch').hidden = !status.connected;
  const oldId = challenge?.id;
  let c = data.challenge;
  if (viewerId && c.id !== viewerId) {
    try {
      c = await api(`/api/challenges/${viewerId}`);
    } catch (e) {
      screen('CHALLENGE UNAVAILABLE', 'Wrong turn.', e.message, 'Unavailable');
      $('start').disabled = true;
      $('join-race').disabled = true;
      $('copy-link').disabled = true;
      return;
    }
  }
  if (sequence !== refreshSequence) return;
  if (running || starting || replayOnly) {
    if (challenge?.id === c.id) {
      challenge = c;
      renderScores(c);
    }
    return;
  }
  challenge = c;
  $('challenge-title').textContent = c.title;
  $('challenge-number').textContent =
    `ROUND ${String(Math.max(1, data.history.length - data.history.findIndex((x) => x.id === c.id))).padStart(2, '0')}`;
  $('challenge-distance').textContent = `${Math.round(c.finish - c.snapshot.x).toLocaleString()}m course`;
  $('attempts').textContent = `${c.attempts} ${c.attempts === 1 ? 'attempt' : 'attempts'}`;
  if (data.publicUrl.includes('localhost') || data.publicUrl.includes('127.0.0.1'))
    $('share-note').textContent =
      'Local links work on this computer. Set a public URL to invite remote viewers.';
  else $('share-note').textContent = 'Share this link with your viewers. They can play in their browser.';
  renderScores(c);
  renderOverlay(c);
  if (oldId !== c.id && mode === 'challenge') setMode('challenge');
  if (oldId !== c.id || ghostRunId !== (c.leaderboard[0]?.id ?? null)) await loadGhost(c);
}

async function startRun() {
  if (!challenge || running || starting) return;
  if (replayOnly) {
    endReplay();
    await refresh(info);
  }
  starting = true;
  $('start').disabled = true;
  try {
    if (mode === 'challenge') {
      const data = await api('/api/runs/start', {
        challengeId: challenge.id,
        name: $('player-name').value,
        guestId: guestId(),
        joinToken,
        playerSession,
      });
      raceTicket = data.ticket;
      currentRunName = data.name;
      playerSession = data.playerSession || playerSession;
      if (joinToken) {
        joinToken = null;
        window.history.replaceState({}, '', location.pathname);
      }
      $('player-name').value = data.name;
      $('identity-note').textContent =
        data.identity === 'twitch'
          ? `Playing as ${data.name} · Twitch chat entry`
          : 'Guest entry. Your name is not a verified Twitch identity.';
      challenge = data.challenge;
      sim = { ...challenge.snapshot };
      finish = challenge.finish;
    } else {
      sim = initial();
      finish = world(sim.seed, sim.version).finish;
      raceTicket = null;
    }
    try {
      localStorage.setItem('btm-name', $('player-name').value);
    } catch {}
    map = world(sim.seed, sim.version);
    startState = { ...sim };
    inputs = [];
    history = [{ ...sim }];
    keys = { jump: false, dash: false };
    savedMoment = null;
    $('publish').disabled = true;
    $('game-screen').hidden = true;
    $('countdown').hidden = false;
    showGame();
    for (const value of ['3', '2', '1']) {
      $('countdown').textContent = value;
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    $('countdown').hidden = true;
    starting = false;
    running = true;
    attempts++;
    lastTime = performance.now();
    accumulator = 0;
    canvas.focus({ preventScroll: true });
  } catch (e) {
    toast(e.message);
    $('game-screen').hidden = false;
  } finally {
    starting = false;
    $('start').disabled = false;
  }
}
async function endRun() {
  running = false;
  keys = { jump: false, dash: false };
  const target = sim.frame - 100;
  savedMoment =
    [...history]
      .reverse()
      .find((s) => s.frame <= target && s.y === FLOOR - PLAYER.h && s.status === 'running') || history[0];
  if (world(savedMoment.seed, savedMoment.version).finish - savedMoment.x < 400) savedMoment = history[0];
  $('publish').disabled = !isHost;
  $('moment-title').textContent =
    sim.status === 'finished' ? 'A run worth chasing.' : 'Big talk. Small landing.';
  $('moment-description').textContent =
    `Challenge starts at ${Math.round(savedMoment.x)}m, ${formatTime(Math.max(0, sim.frame - savedMoment.frame) / 60)}s before this moment.`;
  const seconds = (sim.frame - startState.frame) / 60;
  screen(
    sim.status === 'finished' ? 'THE RUN DID THE TALKING.' : 'THE FREIGHT WINS THIS ONE.',
    sim.status === 'finished' ? 'Clean delivery.' : 'That looked easier.',
    `${formatTime(seconds)}s · ${Math.round(sim.x - startState.x)}m · ${sim.jumps - startState.jumps} jumps`,
    'Run it back',
  );
  if (raceTicket) {
    $('screen-hint').textContent = 'VERIFYING YOUR RUN…';
    try {
      const result = await api('/api/runs', { ticket: raceTicket, inputs });
      $('screen-hint').textContent =
        `RUN VERIFIED · ${currentRunName.toUpperCase()} · YOUR BEST IS #${result.rank} OF ${result.players}`;
      raceTicket = null;
      await refresh(await api('/api/state'));
    } catch (e) {
      $('screen-hint').textContent = 'SCORE NOT SAVED';
      toast(e.message);
    }
  }
}
async function publishMoment() {
  if (!savedMoment || running || starting) return;
  $('publish').disabled = true;
  try {
    const title = `Freight check / ${String(attempts).padStart(2, '0')}`;
    const c = await api('/api/challenges', { snapshot: savedMoment, title });
    await refresh(await api('/api/state'));
    toast('Challenge is live. Copy the viewer link to invite chat.');
    await copy(c.shareUrl, 'Challenge is live — viewer link copied.');
  } catch (e) {
    toast(e.message);
  } finally {
    $('publish').disabled = !isHost;
  }
}
async function copy(value, message) {
  try {
    await navigator.clipboard.writeText(value);
    toast(message);
  } catch {
    toast(`Copy this URL: ${value}`);
  }
}
async function watchReplay(cid, rid) {
  if (running || starting) return toast('Finish your run before watching a replay.');
  const data = await api(`/api/replays/${cid}/${rid}`);
  if (challenge.id !== cid) return;
  mode = 'challenge';
  setMode('challenge');
  replayTrace = data.trace;
  replayName = data.name;
  replayOnly = true;
  replayFrame = 0;
  accumulator = 0;
  $('game-screen').hidden = true;
  $('game-mode').textContent = 'GHOST REPLAY';
  $('ghost-label').textContent = `Watching ${data.name}'s recorded run`;
  updateHud();
  showGame();
  canvas.focus({ preventScroll: true });
}
async function removeRun(cid, run) {
  if (!window.confirm(`Remove ${run.name} and all of their runs from this board?`)) return;
  await api('/api/runs/remove', { challengeId: cid, runId: run.id });
  await refresh(await api('/api/state'));
  toast(`${run.name} was removed from the board.`);
}

function draw() {
  const W = 1000,
    H = 460;
  ctx.clearRect(0, 0, W, H);
  const camera = Math.max(
    0,
    (replayOnly && replayTrace ? replayTrace[Math.min(replayFrame, replayTrace.length - 1)].x : sim.x) - 180,
  );
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, '#17221e');
  gradient.addColorStop(1, '#233329');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  // Warehouse skyline, parallax gantries, and a perspective floor.
  ctx.strokeStyle = '#9ab8840b';
  ctx.lineWidth = 1;
  for (let x = (-camera * 0.18) % 90; x < W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, FLOOR);
    ctx.stroke();
  }
  for (let y = 30; y < FLOOR; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#0e191733';
  for (let n = -1; n < 8; n++) {
    const x = n * 200 - ((camera * 0.25) % 200);
    ctx.fillRect(x, 185, 135, 170);
    ctx.fillRect(x + 12, 165, 24, 20);
    ctx.fillRect(x + 65, 145, 45, 40);
  }
  ctx.strokeStyle = '#90ac7115';
  for (let n = -1; n < 8; n++) {
    const x = n * 210 - ((camera * 0.4) % 210);
    ctx.strokeRect(x, 90, 175, 250);
    ctx.beginPath();
    ctx.moveTo(x, 90);
    ctx.lineTo(x + 175, 230);
    ctx.stroke();
  }
  ctx.fillStyle = '#a1be8322';
  ctx.font = '10px monospace';
  ctx.fillText('NF / FREIGHT TERMINAL', 25 - ((camera * 0.08) % 400), 45);
  ctx.fillStyle = '#d6ff7e06';
  ctx.beginPath();
  ctx.moveTo(790, 0);
  ctx.lineTo(610, FLOOR);
  ctx.lineTo(970, FLOOR);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#101b15';
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.strokeStyle = '#66834a';
  ctx.beginPath();
  ctx.moveTo(0, FLOOR + 0.5);
  ctx.lineTo(W, FLOOR + 0.5);
  ctx.stroke();
  ctx.strokeStyle = '#a6c18612';
  for (let x = -camera % 75; x < W; x += 75) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR);
    ctx.lineTo(x - 50, H);
    ctx.stroke();
  }
  for (let y of [395, 420, 455]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // Course distance markers.
  for (let x = Math.ceil(camera / 200) * 200; x < camera + W; x += 200) {
    ctx.fillStyle = '#758869';
    ctx.font = '9px monospace';
    ctx.fillText(`${x}m`, x - camera, FLOOR + 23);
    ctx.fillStyle = '#3e5432';
    ctx.fillRect(x - camera, FLOOR, 1, 7);
  }
  map.obstacles.forEach((o, index) => {
    const x = o.x - camera;
    if (x < -100 || x > W + 50 || o.x > finish) return;
    ctx.shadowColor = '#ff613b';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff613b';
    ctx.fillRect(x, FLOOR - o.h, o.w, o.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c74427';
    ctx.fillRect(x + o.w - 7, FLOOR - o.h, 7, o.h);
    ctx.fillStyle = '#ffb899';
    ctx.fillRect(x, FLOOR - o.h, o.w, 3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 2, FLOOR - o.h + 7, o.w - 11, o.h - 10);
    ctx.clip();
    ctx.strokeStyle = '#512b1e88';
    ctx.lineWidth = 5;
    for (let n = -30; n < 80; n += 15) {
      ctx.beginPath();
      ctx.moveTo(x + n, FLOOR);
      ctx.lineTo(x + n + 30, FLOOR - o.h);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#8a9a78';
    ctx.font = '8px monospace';
    ctx.fillText(String(index + 1).padStart(2, '0'), x + 7, FLOOR - o.h - 11);
  });
  const fx = finish - camera;
  if (fx < W && fx > -50) {
    ctx.fillStyle = '#d6ff7e';
    ctx.fillRect(fx, 150, 3, FLOOR - 150);
    ctx.fillRect(fx, 150, 70, 25);
    ctx.fillStyle = '#243522';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('FINISH', fx + 12, 167);
  }
  const drawPlayer = (p, isGhost = false) => {
    const x = p.x - camera,
      y = p.y;
    ctx.save();
    ctx.globalAlpha = isGhost ? 0.35 : 1;
    ctx.fillStyle = isGhost ? '#acd2ff' : '#d6ff7e';
    if (!isGhost && keys.dash && running && sim.energy > 2) {
      ctx.globalAlpha = 0.1;
      ctx.fillRect(x - 35, y + 4, PLAYER.w, PLAYER.h - 6);
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x - 18, y + 2, PLAYER.w, PLAYER.h - 3);
      ctx.globalAlpha = 1;
    }
    ctx.shadowColor = isGhost ? '#acd2ff' : '#d6ff7e';
    ctx.shadowBlur = isGhost ? 8 : 16;
    ctx.fillRect(x, y, PLAYER.w, PLAYER.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = isGhost ? '#3d7597' : '#3f572c';
    ctx.fillRect(x + 15, y + 8, 8, 5);
    ctx.fillRect(x + 3, y + PLAYER.h - 6, 8, 6);
    if (!isGhost) {
      ctx.fillStyle = '#16251b';
      ctx.fillRect(x + 17, y + 9, 4, 3);
    }
    ctx.restore();
  };
  const shownGhost = replayOnly ? replayTrace : mode === 'challenge' ? ghost : null;
  if (shownGhost) {
    const frame = replayOnly ? replayFrame : Math.max(0, sim.frame - startState.frame);
    if (frame < shownGhost.length) {
      const p = shownGhost[frame];
      drawPlayer(p, true);
      ctx.fillStyle = '#9fc1d99c';
      ctx.font = '9px monospace';
      ctx.fillText(replayOnly ? replayName : 'GHOST', p.x - camera - 2, p.y - 12);
    }
  }
  if (!replayOnly) drawPlayer(sim);
  if (sim.status === 'crashed' && !replayOnly) {
    ctx.strokeStyle = '#ff7955';
    ctx.lineWidth = 2;
    for (let n = 0; n < 8; n++) {
      const a = (n * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(sim.x - camera + 13 + Math.cos(a) * 28, sim.y + 16 + Math.sin(a) * 28);
      ctx.lineTo(sim.x - camera + 13 + Math.cos(a) * 37, sim.y + 16 + Math.sin(a) * 37);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#b6c6a36b';
  ctx.font = '8px monospace';
  ctx.fillText('SECTOR 01 / KEEP MOVING →', W - 210, H - 14);
}
let lastTime = performance.now(),
  accumulator = 0,
  lastPaint = 0;
function loop(now) {
  const dt = Math.min(100, now - lastTime);
  lastTime = now;
  if (running) {
    accumulator += dt;
    while (accumulator >= 1000 / 60 && running) {
      const input = (keys.jump ? 1 : 0) | (keys.dash ? 2 : 0);
      inputs.push(input);
      sim = step(sim, input, map, finish);
      if (sim.status === 'running') {
        history.push({ ...sim });
        if (history.length > 240) history.shift();
      }
      accumulator -= 1000 / 60;
      if (sim.status !== 'running') endRun();
      else if (inputs.length >= MAX_TICKS) {
        running = false;
        toast('Run limit reached. Start again.');
        screen('TIME OUT', 'Fresh start?', 'This run exceeded the time limit.');
      }
    }
    updateHud();
  }
  if (replayOnly) {
    accumulator += dt;
    while (replayOnly && accumulator >= 1000 / 60) {
      replayFrame++;
      accumulator -= 1000 / 60;
      if (replayFrame >= replayTrace.length) {
        const name = replayName;
        endReplay();
        screen('GHOST REPLAY COMPLETE', 'Your move.', `That was ${name}’s run. Now chase it.`);
        refresh(info);
      }
    }
    if (replayOnly) updateHud();
  }
  if (!overlayMode && (running || replayOnly || now - lastPaint > 100)) {
    draw();
    lastPaint = now;
  }
  requestAnimationFrame(loop);
}

const boardTabs = [...document.querySelectorAll('[role=tab]')];
function selectBoardTab(tab) {
  for (const button of boardTabs) {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    $(button.getAttribute('aria-controls')).hidden = !selected;
  }
}
for (const [index, tab] of boardTabs.entries()) {
  tab.addEventListener('click', () => selectBoardTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? boardTabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + boardTabs.length) % boardTabs.length;
    selectBoardTab(boardTabs[next]);
    boardTabs[next].focus();
  });
}

$('start').addEventListener('click', () => startRun());
$('join-race').addEventListener('click', () => {
  if (running || starting) return toast('Finish this run first.');
  setMode('challenge');
  startRun();
});
$('switch-mode').addEventListener('click', () => setMode(mode === 'practice' ? 'challenge' : 'practice'));
$('publish').addEventListener('click', publishMoment);
$('copy-link').addEventListener('click', () => challenge && copy(challenge.shareUrl, 'Viewer link copied.'));
$('copy-overlay').addEventListener(
  'click',
  () => info && copy(`${info.publicUrl}/overlay`, 'OBS URL copied. Add it as a browser source (420 × 430).'),
);
$('setup-open').addEventListener('click', () => $('setup').showModal());
$('setup-close').addEventListener('click', () => $('setup').close());
$('unlock').addEventListener('click', async () => {
  try {
    await api('/api/host-session', { key: $('host-key').value });
    isHost = true;
    $('host-key').value = '';
    $('host-unlock').hidden = true;
    $('publish').disabled = !savedMoment;
    await refresh(await api('/api/state'));
    toast('Host desk unlocked.');
  } catch (e) {
    toast(e.message);
  }
});
$('connect-twitch').addEventListener('click', () => location.assign('/auth/twitch'));
$('disconnect-twitch').addEventListener('click', async () => {
  try {
    await api('/api/twitch/disconnect', {});
    await refresh(await api('/api/state'));
  } catch (e) {
    toast(e.message);
  }
});
window.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) || $('setup').open) return;
  if (['Space', 'ArrowUp', 'KeyW', 'ShiftLeft', 'ShiftRight'].includes(event.code)) event.preventDefault();
  if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) {
    if (!running && !starting && !event.repeat) startRun();
    else keys.jump = true;
  }
  if (event.code.startsWith('Shift')) keys.dash = true;
});
window.addEventListener('keyup', (event) => {
  if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) keys.jump = false;
  if (event.code.startsWith('Shift')) keys.dash = false;
});
window.addEventListener('blur', () => {
  keys = { jump: false, dash: false };
});
document.addEventListener('visibilitychange', () => {
  lastTime = performance.now();
  accumulator = 0;
  keys = { jump: false, dash: false };
});
for (const [button, key] of [
  [$('touch-jump'), 'jump'],
  [$('touch-dash'), 'dash'],
]) {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if (!running && !starting && key === 'jump') startRun();
    else keys[key] = true;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    button.addEventListener(name, () => (keys[key] = false));
}
try {
  $('player-name').value =
    localStorage.getItem('btm-name') || `Guest-${Math.floor(Math.random() * 900 + 100)}`;
} catch {
  $('player-name').value = 'Guest';
}
if (viewerId) {
  $('desk-label').textContent = 'THE CHALLENGE';
  document
    .querySelector('h1')
    .replaceChildren(
      document.createTextNode('Big talk?'),
      document.createElement('br'),
      text('span', 'Back it up.'),
    );
  document.querySelector('.intro p').textContent = 'The streamer set the moment. You set the time.';
}
if (joinToken) {
  $('identity-note').textContent = 'Your Twitch entry link is ready. Launch a run to claim it.';
  $('player-name').disabled = true;
}
async function boot() {
  try {
    if (!viewerId && !overlayMode) {
      const me = await api('/api/me');
      isHost = me.host;
      if (!isHost && !me.keyRequired) {
        try {
          await api('/api/host-session', {});
          isHost = true;
        } catch {}
      }
      $('host-unlock').hidden = isHost;
    }
    await refresh(await api('/api/state'));
    if (!challenge) return;
    if (!overlayMode) setMode(mode);
    if (info.updates === 'poll') {
      // Quick Tunnels do not support SSE. Poll without overlapping requests.
      const poll = async () => {
        try {
          const next = await api('/api/state');
          connectionLost = false;
          await refresh(next);
        } catch {
          connectionLost = true;
          $('connection').replaceChildren(text('i', ''), document.createTextNode('Reconnecting to server'));
        } finally {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 2000);
    } else {
      const stream = new EventSource('/events');
      stream.onmessage = (e) => {
        connectionLost = false;
        refresh(JSON.parse(e.data)).catch(() => toast('Could not refresh the live board.'));
      };
      stream.onerror = () => {
        connectionLost = true;
        $('connection').replaceChildren(text('i', ''), document.createTextNode('Reconnecting to server'));
      };
    }
  } catch (e) {
    toast(e.message);
    screen(
      'SERVER UNAVAILABLE',
      'Hold that thought.',
      'Could not load the challenge. Restart the app and refresh.',
      'Refresh',
    );
    $('start').disabled = true;
  }
}
requestAnimationFrame(loop);
boot();
