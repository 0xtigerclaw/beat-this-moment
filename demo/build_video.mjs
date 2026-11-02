// Builds the five themed demo videos from the recorded footage, the narration in demo/voice, and burned-in captions.
// Run: PLAYWRIGHT_DIR=<dir holding node_modules/playwright> node demo/build_video.mjs [--shots-only] [theme ids]
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(`${process.env.PLAYWRIGHT_DIR}/`)('playwright');
const FOOTAGE = 'demo/footage',
  WORK = 'demo/shots/story1440b',
  OUT = 'demo/final',
  HOST = `${FOOTAGE}/2026-11-02 14-19-14.mp4`,
  VIEWER = `${FOOTAGE}/viewer3.mp4`,
  CHAT = `${FOOTAGE}/chat3.mp4`,
  TWITCH = `${FOOTAGE}/twitch.mp4`,
  TWITCH_BOARD = `${FOOTAGE}/twitch2.mp4`,
  GAP = 0.7,
  TAIL = 2.5;
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args]);
const args = process.argv.slice(2);

// The Twitch page without its sidebar of other streamers' channels.
const PAGE = 'crop=1560:878:360:0,scale=2560:1440:flags=lanczos';
// The host page's board, zoomed in.
const BOARD = 'crop=1707:960:853:480,scale=2560:1440:flags=lanczos';
// The final board, zoomed in.
const FINAL_BOARD = 'crop=1400:788:0:400,scale=2560:1440:flags=lanczos';
// `share` is a shot's part of its section, set in seconds to land on the narration's words.
// `scripted` shots carry the on-screen note about test runs. `card` shots are statements drawn in each theme's colors.
const big = (text) => ({ text, size: 104 });
const hit = (text) => ({ text, size: 104, accent: true });
const sub = (text) => ({ text, size: 52, dim: true });
const sections = [
  {
    label: 'The question',
    shots: [
      { id: 'live-page', src: TWITCH, from: 62, share: 1.6, scripted: true, vf: PAGE },
      { id: 'crash', src: HOST, from: 20.2, share: 2.6, scripted: true },
      { id: 'easy', card: [big('"Easy."'), big('"I\'d have made that."')], share: 1.8 },
      { id: 'could', card: [hit('So, could they?')], share: 1.91 },
    ],
  },
  {
    label: 'Beat This Moment',
    shots: [
      { id: 'title', card: [{ text: 'Beat This Moment', size: 128 }, sub('Swayam')], share: 2.9 },
      { id: 'talk', card: [big('Chat can talk.'), big("It can't play your run.")], share: 2.5 },
      { id: 'now', card: [hit('Now it can.')], share: 1.61 },
    ],
  },
  {
    label: 'Your crash',
    shots: [
      { id: 'sign-in', src: HOST, from: 6.2, share: 1 },
      { id: 'consent', src: HOST, from: 10, share: 1.3 },
      { id: 'connected', src: HOST, from: 15, share: 1.3 },
      { id: 'gameplay', src: HOST, from: 17, share: 3.9, scripted: true },
      { id: 'publish', src: HOST, from: 33.2, share: 3.5 },
      { id: 'publish-post', src: CHAT, from: 58.2, share: 2.78 },
    ],
  },
  {
    label: "Chat's turn",
    shots: [
      { id: 'turn', card: [hit("Chat's turn.")], share: 1.4 },
      { id: 'challenge', src: CHAT, from: 60.7, share: 3.5 },
      { id: 'join', src: CHAT, from: 74.2, share: 5.99 },
    ],
  },
  {
    label: 'Same moment',
    shots: [
      { id: 'viewer-run', src: VIEWER, from: 2, share: 5.3, scripted: true },
      { id: 'same', card: [big('Same moment.'), hit('Different player.')], share: 2.8 },
      // A run arrives with no reload: first on the host's page, then on the stream beside chat.
      { id: 'page-board', src: HOST, from: 72, share: 2.6, scripted: true, vf: BOARD },
      { id: 'stream-board', src: TWITCH_BOARD, from: 44.03, share: 4.7, scripted: true, vf: PAGE },
    ],
  },
  {
    label: 'The rematch',
    shots: [
      { id: 'ghost', src: VIEWER, from: 7.3, share: 5.6, scripted: true },
      { id: 'replay', src: HOST, from: 122.5, share: 1.7, scripted: true },
      { id: 'remove', src: HOST, from: 134.5, share: 1.9 },
      { id: 'lead-post', src: CHAT, from: 95.8, share: 5.72 },
    ],
  },
  {
    label: "So let's push",
    shots: [
      { id: 'push', card: [hit("So let's push.")], share: 1.3 },
      { id: 'fake', still: `${WORK}/fake.png`, share: 1.75 },
      { id: 'fake-stamp', still: `${WORK}/fake-stamp.png`, share: 1 },
      { id: 'fast', still: `${WORK}/fast.png`, share: 3 },
      { id: 'fast-stamp', still: `${WORK}/fast-stamp.png`, share: 1 },
      { id: 'replays', card: [big('The server replays every input.'), sub('And works out the score itself.')], share: 3.55 },
      { id: 'bots', card: [big('Bots can still play.'), hit("A made-up time won't count.")], share: 4.26 },
    ],
  },
  {
    label: 'Built with Codex',
    shots: [
      { id: 'codex', card: [big('Built with Codex.')], share: 1.85 },
      { id: 'source', still: `${WORK}/source.png`, share: 6.85 },
      { id: 'twitch-parts', card: [big('The Twitch connection.'), sub('Sign-in. Live chat events. Chat posts.')], share: 5.55 },
      { id: 'tests', still: `${WORK}/tests.png`, share: 4.17 },
    ],
  },
  {
    label: 'The answer',
    // The closing card says these words itself, so it carries no captions.
    captionsUntil: 13,
    shots: [
      { id: 'small', card: [big('AI is making small games far easier to build.')], share: 4 },
      { id: 'link', src: VIEWER, from: 3, share: 2.9, scripted: true },
      { id: 'titles', card: [hit("Twitch doesn't have to be only big titles.")], share: 2.2 },
      { id: 'asked', card: [big('So, could chat have done better?')], share: 2.1 },
      { id: 'board', src: HOST, from: 136, share: 1.8, scripted: true, vf: FINAL_BOARD },
      { id: 'close-0', close: 0, card: [], share: 1.6 },
      { id: 'close-1', close: 1, card: [], share: 0.9 },
      { id: 'close-2', close: 2, card: [], share: 1 },
      { id: 'close-3', close: 3, card: [], share: 3.89 },
    ],
  },
];

const inset = (x, y, w, h, radius) => ({ x, y, w, h, radius });
const FULL = inset(0, 0, 1920, 1080, 0);
const themes = [
  {
    id: 'paper',
    box: inset(224, 44, 1472, 828, 18),
    background: '#f2f0e8',
    chip: 'left:224px;top:888px;color:#ff5c35;font:700 20px Menlo,monospace;letter-spacing:.12em;text-transform:uppercase',
    caption: 'left:224px;right:224px;top:928px;color:#171d18;font:500 44px/1.2 Georgia,serif',
    note: 'background:#171d18;color:#f2f0e8',
    card: ['#f2f0e8', '#171d18', '#ff5c35', 'Georgia,serif'],
  },
  {
    id: 'neon',
    box: FULL,
    chip: 'left:36px;bottom:140px;background:#0d120f;color:#d7ff5a;padding:8px 16px;border:2px solid #d7ff5a;font:700 22px Menlo,monospace;letter-spacing:.08em;text-transform:uppercase',
    caption:
      'left:50%;transform:translateX(-50%);bottom:44px;max-width:1640px;background:rgba(10,14,11,.9);color:#d7ff5a;padding:14px 30px;border-radius:12px;text-align:center;font:800 46px/1.2 \'Helvetica Neue\',Arial,sans-serif',
    note: 'background:#d7ff5a;color:#0d120f',
    card: ['#0d120f', '#d7ff5a', '#ff5c35', '\'Helvetica Neue\',Arial,sans-serif'],
  },
  {
    id: 'violet',
    box: inset(192, 36, 1536, 864, 28),
    background: 'url(#violet)',
    chip: 'left:192px;top:912px;color:#d9c8ff;font:700 22px \'Helvetica Neue\',Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase',
    caption: 'left:192px;right:192px;top:950px;color:#fff;font:700 42px/1.2 \'Helvetica Neue\',Arial,sans-serif',
    note: 'background:#2a1458;color:#fff',
    card: ['#2a1458', '#ffffff', '#c6a8ff', '\'Helvetica Neue\',Arial,sans-serif'],
  },
  {
    id: 'terminal',
    box: inset(224, 78, 1472, 828, 6),
    background: '#050805',
    chip: 'left:224px;top:28px;color:#6dff8a;font:400 26px Menlo,monospace',
    chipPrefix: '$ beat-this-moment --section ',
    caption: 'left:224px;right:224px;top:928px;color:#6dff8a;font:400 38px/1.25 Menlo,monospace',
    captionPrefix: '> ',
    note: 'background:#050805;color:#6dff8a;border:1px solid #6dff8a',
    card: ['#050805', '#6dff8a', '#ffffff', 'Menlo,monospace'],
  },
  {
    id: 'broadcast',
    box: FULL,
    chip: 'left:0;bottom:150px;background:#d7263d;color:#fff;padding:10px 28px;font:800 26px \'Helvetica Neue\',Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase',
    caption:
      'left:0;right:0;bottom:0;height:150px;box-sizing:border-box;background:#fff;color:#111;padding:0 40px;display:flex;align-items:center;font:700 44px/1.15 \'Helvetica Neue\',Arial,sans-serif',
    note: 'background:#111;color:#fff',
    card: ['#111111', '#ffffff', '#d7263d', '\'Helvetica Neue\',Arial,sans-serif'],
  },
];

// Splits each section's words into caption lines that end at natural pauses.
const manifest = JSON.parse(readFileSync('demo/voice/manifest.json'));
const clean = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function captionLines({ text, words }) {
  const lines = [];
  let index = 0,
    line = null;
  for (const token of text.split(/\s+/)) {
    let matched = '',
      first = null,
      last = null;
    while (index < words.length && matched.length < clean(token).length) {
      first ??= words[index];
      last = words[index];
      matched += clean(words[index].text);
      index++;
    }
    if (matched !== clean(token)) throw new Error(`Caption words do not match the script at "${token}"`);
    if (!line) line = { text: token, start: first.start_time, end: last.end_time };
    else {
      line.text += ` ${token}`;
      line.end = last.end_time;
    }
    const pause = /[.!?]$/.test(token) || (/[,:]$/.test(token) && line.text.length > 18);
    const hangs = /^(a|an|the|to|and|of|on|in|so|at|that|your|my|it)$/i.test(token);
    if (pause || (line.text.length > 40 && !hangs)) {
      lines.push(line);
      line = null;
    }
  }
  if (line) lines.push(line);
  // A very short tail reads better on the line before it.
  return lines.flatMap((l, i) => {
    const next = lines[i + 1];
    if (next && next.text.split(' ').length === 1 && l.text.length < 52 && !/[.!?]$/.test(l.text)) {
      l.text += ` ${next.text}`;
      l.end = next.end;
      next.merged = true;
    }
    return l.merged ? [] : [l];
  });
}
let clock = 0;
const srt = [];
const timestamp = (t) =>
  new Date(t * 1000).toISOString().slice(11, 23).replace('.', ',');
for (const [i, section] of sections.entries()) {
  section.seconds = manifest[i].seconds + (i === sections.length - 1 ? TAIL : GAP);
  section.lines = captionLines(manifest[i]);
  for (const l of section.lines)
    srt.push(`${srt.length + 1}\n${timestamp(clock + l.start)} --> ${timestamp(clock + l.end + 0.15)}\n${l.text}\n`);
  clock += section.seconds;
}
writeFileSync(`${OUT}/captions.srt`, srt.join('\n'));
console.log(`${clock.toFixed(1)}s, ${srt.length} captions`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
// Layouts are written for 1920x1080 and render at 2560x1440.
const canvas = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 4 / 3 });
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const curly = (s) => s.replace(/"(?=\S)/g, '\u201c').replace(/"/g, '\u201d').replace(/'/g, '\u2019');
const code = (title, body, size = 21) =>
  `<body style="margin:0;background:#101512;color:#dfe6dc;font:${size}px/1.5 Menlo,monospace;padding:44px 60px;height:100vh;box-sizing:border-box"><div style="color:#ff5c35;font-size:15px;letter-spacing:.12em;margin-bottom:20px">${title}</div><pre style="margin:0;white-space:pre-wrap">${escape(body)}</pre></body>`;
await page.setContent(code('PUBLIC/ENGINE.JS', execSync('sed -n 112,127p public/engine.js').toString()));
await page.screenshot({ path: `${WORK}/source.png` });
await page.setContent(code('NPM TEST', execSync('npm test 2>&1 | grep -E "^# (tests|pass|fail)"').toString(), 64));
await page.screenshot({ path: `${WORK}/tests.png` });
// The hosted game's real replies to two fake runs.
const refused = JSON.parse(readFileSync(`${FOOTAGE}/refused.json`));
const reply = (title, request, { status, error }, stamped, name) =>
  page
    .setContent(
      `${code(title, `POST /api/runs\n${request}\n\nHTTP ${status}\n{ "error": "${error}" }`, 27)}${stamped ? '<div style="position:absolute;right:80px;top:300px;transform:rotate(-7deg);border:8px solid #ff5c35;border-radius:12px;color:#ff5c35;padding:8px 34px;font:900 92px \'Helvetica Neue\',Arial,sans-serif;letter-spacing:.06em">REFUSED</div>' : ''}`,
    )
    .then(() => page.screenshot({ path: `${WORK}/${name}.png` }));
for (const stamped of [false, true]) {
  await reply('A MADE-UP RUN, SENT TO THE HOSTED GAME', '{ "ticket": "...", "seconds": 0.5, "completed": true, "inputs": [0] }', refused.fake, stamped, stamped ? 'fake-stamp' : 'fake');
  await reply(`A FINISHED RUN, ${refused.fast.seconds} SECONDS LONG, SENT AT ONCE`, `{ "ticket": "...", "inputs": [ ${Math.round(refused.fast.seconds * 60)} inputs ] }`, refused.fast, stamped, stamped ? 'fast-stamp' : 'fast');
}

// One clean 1440p clip per shot, shared by every theme.
// Text suffers most from repeat compression, so shots stay near lossless and sections are the only visible encode.
// The sources mix color ranges and PNGs pull ffmpeg toward full range, so every step states the one standard range.
const color = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const STANDARD = 'scale=out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709';
const encode = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '8', '-pix_fmt', 'yuv420p', ...color, '-an'];
const sectionEncode = ['-c:v', 'libx264', '-preset', 'medium', '-tune', 'animation', '-crf', '13', '-pix_fmt', 'yuv420p', ...color, '-an'];
for (const section of sections) {
  const parts = section.shots.reduce((sum, s) => sum + s.share, 0);
  for (const shot of section.shots) {
    shot.seconds = (section.seconds * shot.share) / parts;
    shot.file = `${WORK}/${shot.id}.mp4`;
    if (shot.card || existsSync(shot.file)) continue;
    const input = shot.still ? ['-loop', '1', '-i', shot.still] : ['-ss', String(shot.from), '-i', shot.src];
    const filters = [shot.vf, 'fps=30', 'scale=2560:1440:flags=lanczos', 'setsar=1', `tpad=stop_mode=clone:stop_duration=${shot.seconds + 1}`, STANDARD];
    ffmpeg(...input, '-vf', filters.filter(Boolean).join(','), '-t', shot.seconds.toFixed(3), ...encode, shot.file);
  }
}
if (args.includes('--shots-only')) {
  await browser.close();
  process.exit(0);
}

const png = async (html, path) => {
  await canvas.setContent(`<body style="margin:0;background:transparent">${html}</body>`);
  await canvas.screenshot({ path, omitBackground: true });
};
const px = (n) => Math.round((n * 4) / 3 / 2) * 2;
const round = ({ x, y, w, h, radius: r }) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
const chosen = args.filter((a) => !a.startsWith('--'));
for (const theme of themes.filter((t) => !chosen.length || chosen.includes(t.id))) {
  const dir = `${WORK}/${theme.id}`;
  mkdirSync(dir, { recursive: true });
  const { box } = theme;
  const noteAt = box === FULL ? [1920 - 560 - 24, 866] : [box.x + box.w - 560 - 16, box.y + 16];
  await png(
    `<div style="position:absolute;left:${noteAt[0]}px;top:${noteAt[1]}px;width:560px;text-align:center;box-sizing:border-box;padding:7px 12px;border-radius:6px;font:600 21px 'Helvetica Neue',Arial,sans-serif;${theme.note}">Demo runs are played by a test script</div>`,
    `${dir}/note.png`,
  );
  const [cardBg, cardText, cardAccent, cardFont] = theme.card;
  const cardPage = (inner, align = 'flex-start') =>
    `<div style="width:1920px;height:1080px;background:${cardBg};box-sizing:border-box;padding:0 170px 90px;display:flex;flex-direction:column;justify-content:center;align-items:${align};font-family:${cardFont}">${inner}</div>`;
  const cardLine = ({ text, size, accent, dim }) =>
    `<div style="font-size:${size}px;line-height:1.12;font-weight:${dim ? 500 : 800};margin-top:${dim ? 30 : 8}px;color:${accent ? cardAccent : cardText};opacity:${dim ? 0.8 : 1}">${escape(curly(text))}</div>`;
  // The closing card reveals its last line one phrase at a time, so it is drawn once per phrase.
  const closePage = (shown) =>
    cardPage(
      `<div style="font-size:136px;line-height:1.05;font-weight:800;color:${cardText};white-space:nowrap">Beat This Moment</div><div style="font-size:50px;font-weight:600;color:${cardAccent};margin-top:28px">Your crash is chat\u2019s next challenge.</div><div style="display:flex;gap:36px;font-size:58px;font-weight:800;color:${cardText};margin-top:84px;white-space:nowrap">${['You crash.', 'Chat plays.', 'The board decides.'].map((phrase, n) => `<span style="visibility:${n < shown ? 'visible' : 'hidden'}">${phrase}</span>`).join('')}</div>`,
      'center',
    );
  for (const shot of sections.flatMap((s) => s.shots).filter((s) => s.card)) {
    await png(shot.close === undefined ? cardPage(shot.card.map(cardLine).join('')) : closePage(shot.close), `${dir}/${shot.id}.png`);
    ffmpeg('-loop', '1', '-i', `${dir}/${shot.id}.png`, '-vf', `fps=30,setsar=1,${STANDARD}`, '-t', shot.seconds.toFixed(3), ...encode, `${dir}/${shot.id}.mp4`);
  }

  const clips = [];
  for (const [i, section] of sections.entries()) {
    const number = String(i + 1).padStart(2, '0');
    const fill = theme.background === 'url(#violet)' ? 'url(#violet)' : theme.background;
    const frame = box === FULL
      ? ''
      : `<svg width="1920" height="1080" style="position:absolute;left:0;top:0"><defs><linearGradient id="violet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a1a78"/><stop offset="1" stop-color="#160a33"/></linearGradient></defs><path fill="${fill}" fill-rule="evenodd" d="M0 0H1920V1080H0Z ${round({ ...box, x: box.x + 1, y: box.y + 1, w: box.w - 2, h: box.h - 2 })}"/></svg>`;
    await png(frame, `${dir}/frame-${i}.png`);
    const inputs = [];
    for (const shot of section.shots) inputs.push('-i', shot.card ? `${dir}/${shot.id}.mp4` : shot.file);
    const count = section.shots.length;
    let graph = `${section.shots.map((_, n) => `[${n}:v]`).join('')}concat=n=${count}:v=1:a=0,scale=${px(box.w)}:${px(box.h)}:flags=lanczos,pad=2560:1440:${px(box.x)}:${px(box.y)}:black[v0];`;
    inputs.push('-i', `${dir}/frame-${i}.png`, '-i', `${dir}/note.png`);
    graph += `[v0][${count}:v]overlay=0:0[v1];`;
    let last = 'v1',
      at = 0,
      n = 2;
    const spans = section.shots.flatMap((s) => {
      const span = s.scripted ? [`between(t,${at.toFixed(2)},${(at + s.seconds).toFixed(2)})`] : [];
      at += s.seconds;
      return span;
    });
    if (spans.length) {
      graph += `[${last}][${count + 1}:v]overlay=0:0:enable='${spans.join('+')}'[v${n}];`;
      last = `v${n++}`;
    }
    const lines = section.lines.filter((l) => l.start < (section.captionsUntil ?? Infinity));
    for (const [c, line] of lines.entries()) {
      const file = `${dir}/caption-${i}-${c}.png`;
      await png(`<div style="position:absolute;box-sizing:border-box;${theme.caption}">${theme.captionPrefix ?? ''}${escape(line.text)}</div>`, file);
      inputs.push('-i', file);
      const next = lines[c + 1];
      const until = next ? next.start : Math.min(line.end + 0.5, section.captionsUntil ?? Infinity);
      graph += `[${last}][${count + 2 + c}:v]overlay=0:0:enable='between(t,${line.start.toFixed(2)},${until.toFixed(2)})'[v${n}];`;
      last = `v${n++}`;
    }
    await png(`<div style="position:absolute;white-space:nowrap;${theme.chip}">${theme.chipPrefix ?? ''}${number} ${escape(section.label)}</div>`, `${dir}/chip-${i}.png`);
    inputs.push('-i', `${dir}/chip-${i}.png`);
    graph += `[${last}][${count + 2 + lines.length}:v]overlay=0:0:enable='between(t,0,${section.captionsUntil ?? section.seconds})'[v${n}];`;
    last = `v${n++}`;
    graph += `[${last}]${STANDARD}[v${n}];`;
    last = `v${n++}`;
    const out = `${dir}/section-${i}.mp4`;
    ffmpeg(...inputs, '-filter_complex', graph.replace(/;$/, ''), '-map', `[${last}]`, '-t', section.seconds.toFixed(3), '-r', '30', ...sectionEncode, out);
    clips.push(out);
  }

  const list = (files, path) => writeFileSync(path, files.map((f) => `file '${process.cwd()}/${f}'`).join('\n'));
  list(clips, `${dir}/video.txt`);
  const voices = manifest.map((m, i) => {
    const out = `${WORK}/voice-${i + 1}.wav`;
    if (!existsSync(out)) ffmpeg('-i', m.file, '-af', `apad=pad_dur=${i === manifest.length - 1 ? TAIL : GAP},aresample=48000`, '-ac', '2', out);
    return out;
  });
  list(voices, `${dir}/audio.txt`);
  const result = `${OUT}/beat-this-moment-${theme.id}.mp4`;
  ffmpeg(
    '-f', 'concat', '-safe', '0', '-i', `${dir}/video.txt`,
    '-f', 'concat', '-safe', '0', '-i', `${dir}/audio.txt`,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', result,
  );
  console.log(result);
}
await browser.close();
