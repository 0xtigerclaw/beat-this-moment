// Records what a signed-out viewer sees: the Twitch channel page, then a run from a !join link.
// Controlled by files in demo/footage/control: `leader` submits the solved run, `viewer` holds the
// !join URL, and `stop` ends the recording. Frames become video later, in demo/footage/<name>-frames.
// Run: PLAYWRIGHT_DIR=<dir holding node_modules/playwright> [TAKE=<suffix>] node demo/record_live.mjs
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { play } from '../test/support/solver.mjs';

const { chromium } = createRequire(`${process.env.PLAYWRIGHT_DIR}/`)('playwright');
const BASE = 'https://beat-the-moment-35-211-225-40.sslip.io',
  CHANNEL = process.env.TWITCH_PAGE || 'https://www.twitch.tv/0xtigerclaw',
  OUT = 'demo/footage',
  CONTROL = `${OUT}/control`;
mkdirSync(CONTROL, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line) => {
  console.log(line);
  appendFileSync(`${OUT}/live-log.txt`, `${Date.now() / 1000} ${line}\n`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
async function capture(name, url) {
  // Chat gets a smaller viewport at a higher scale, so its text fills the frame while staying sharp.
  const [width, height, deviceScaleFactor] = name === 'chat' ? [960, 540, 2560 / 960] : [1280, 720, 2];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor });
  const page = await context.newPage();
  const dir = `${OUT}/${name}${process.env.TAKE ?? ''}-frames`;
  mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    writeFileSync(`${dir}/${metadata.timestamp.toFixed(3)}.jpg`, Buffer.from(data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 2560, maxHeight: 1440 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}
const take = (name) => {
  const file = `${CONTROL}/${name}`;
  if (!existsSync(file)) return null;
  const value = readFileSync(file, 'utf8').trim();
  rmSync(file);
  return value;
};
const post = (url, body) =>
  fetch(`${BASE}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

const twitch = await capture(process.env.CAPTURE || 'twitch', CHANNEL);
log('twitch page open');
await sleep(6000);
// Decline optional cookies if Twitch asks, and get past any start-watching gate.
for (const label of ['Reject', 'Start Watching']) await twitch.getByRole('button', { name: label }).first().click({ timeout: 800 }).catch(() => {});
await twitch.screenshot({ path: `${OUT}/twitch-check.png` });
log('twitch checked');

for (;;) {
  if (take('stop') !== null) break;
  if (take('leader') !== null) {
    const { challenge } = await fetch(`${BASE}/api/state`).then((r) => r.json());
    const solved = play(challenge.snapshot, false, challenge.finish);
    const { ticket } = await post('/api/runs/start', { challengeId: challenge.id, name: 'Demo run' });
    await sleep((solved.inputs.length / 60) * 1000 + 300);
    const result = await post('/api/runs', { ticket, inputs: solved.inputs });
    log(`leader ${JSON.stringify({ id: result.run?.id, seconds: result.run?.seconds, error: result.error })}`);
    writeFileSync(`${CONTROL}/leader-id`, `${challenge.id} ${result.run?.id}`);
  }
  const url = take('viewer');
  if (url) {
    const { challenge } = await fetch(`${BASE}/api/state`).then((r) => r.json());
    const route = play(challenge.snapshot, false, challenge.finish);
    const jumps = route.inputs.flatMap((input, i) => (input & 1 ? [route.states[i].x - challenge.snapshot.x - 25] : []));
    const viewer = await capture('viewer', `${url}&broadcast=1`);
    await viewer.waitForLoadState('load');
    await sleep(3000);
    log(`viewer ready as ${await viewer.inputValue('#player-name').catch(() => '?')}`);
    await viewer.evaluate((plan) => {
      const shown = () => parseInt(document.getElementById('distance').textContent, 10);
      let next = 0;
      const tick = () => {
        // Stop at the end of the run, so a later replay doesn't press jump and start another run.
        if (!document.getElementById('game-screen').hidden && next > 0) return;
        if (next < plan.length && shown() >= plan[next]) {
          next++;
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
          requestAnimationFrame(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })));
        }
        requestAnimationFrame(tick);
      };
      tick();
    }, jumps);
    await viewer.click('#join-race');
    log('viewer run started');
    await sleep(1600);
    await viewer.waitForFunction(() => document.getElementById('game-screen').hidden === false, undefined, { timeout: 60000 });
    await viewer.waitForFunction(() => /VERIFIED/.test(document.getElementById('screen-hint').textContent), undefined, { timeout: 10000 }).catch(() => log('no verified text'));
    log(`viewer finished: ${await viewer.textContent('#screen-hint')}`);
    await sleep(4000);
    await viewer.locator('.replay-button').first().click();
    log('viewer replay started');
    await sleep(11000);
    await viewer.evaluate(() => window.scrollTo(0, 0));
    await sleep(1000);
    await viewer.close();
    log('viewer closed');
  }
  await sleep(200);
}
await browser.close();
log('stopped');
