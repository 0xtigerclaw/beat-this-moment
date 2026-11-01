import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { VERSION, initial, replay, validSnapshot, compareRuns, world, PLAYER, FLOOR } from './public/engine.js';
import { TwitchBridge } from './twitch.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const id = () => randomBytes(18).toString('base64url');
const cleanName = v => String(v || '').replace(/[^\p{L}\p{N}_ .-]/gu, '').trim().slice(0, 24);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function createApp(options = {}) {
  const port = options.port ?? Number(process.env.PORT || 3000);
  const publicUrl = (options.publicUrl || process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const hostKey = options.hostKey ?? process.env.HOST_KEY ?? '';
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(publicUrl).hostname) && !hostKey) throw new Error('Set HOST_KEY when PUBLIC_URL is public, including when using a tunnel.');
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(ROOT, '.data');
  const clientId = options.clientId ?? process.env.TWITCH_CLIENT_ID ?? '';
  const clientSecret = options.clientSecret ?? process.env.TWITCH_CLIENT_SECRET ?? '';
  const ownerChannel = (options.ownerChannel ?? process.env.TWITCH_OWNER_CHANNEL ?? '').trim().toLowerCase();
  if(ownerChannel && !/^[a-z0-9_]{1,25}$/.test(ownerChannel)) throw new Error('TWITCH_OWNER_CHANNEL must be a Twitch login name.');
  mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'challenges.json');
  let db = { activeId: null, challenges: [] };
  if (existsSync(file)) db = JSON.parse(readFileSync(file, 'utf8'));
  const persist = () => { writeFileSync(`${file}.tmp`, JSON.stringify(db), { mode: 0o600 }); renameSync(`${file}.tmp`, file); };
  const newChallenge = (snapshot, title) => {
    const c = { id: id(), title, snapshot, finish: Math.min(3600, snapshot.x + (snapshot.version >= 2 ? 2200 : 1600)), createdAt: Date.now(), runs: [] };
    db.challenges.push(c); db.activeId = c.id; persist(); return c;
  };
  if (!db.activeId) newChallenge(initial(), 'Night Shift / hard challenge');
  else if (!db.challenges.some(c => c.snapshot.version >= VERSION)) newChallenge(initial(), 'Night Shift / hard challenge');
  const sessions = new Map(), runTickets = new Map(), joins = new Map(), playerSessions = new Map(), oauthStates = new Map(), rates = new Map();
  const clients = new Set();
  const find = cid => db.challenges.find(c => c.id === cid);
  const board = c => {
    const best = new Map();
    for (const run of c.runs) {
      const key = `${run.identity}:${run.playerId}`;
      if (!best.has(key) || compareRuns(run, best.get(key)) < 0) best.set(key, run);
    }
    return [...best.values()].sort(compareRuns).slice(0, 20).map(({ inputs, ...r }, i) => ({ ...r, rank: i + 1 }));
  };
  const challengeView = c => c && ({ id: c.id, title: c.title, snapshot: c.snapshot, finish: c.finish, createdAt: c.createdAt, attempts: c.runs.length, leaderboard: board(c), shareUrl: `${publicUrl}/c/${c.id}` });
  const state = () => ({ challenge: challengeView(find(db.activeId)), history: [...db.challenges].reverse().slice(0, 12).map(c => ({ id: c.id, title: c.title, attempts: c.runs.length })), twitch: { ...twitch.state, configured: !!(clientId && clientSecret), ownerLogin: !!ownerChannel, ownerChannel }, publicUrl, updates: new URL(publicUrl).hostname.endsWith('.trycloudflare.com') ? 'poll' : 'events' });
  const broadcast = () => { const payload = `data: ${JSON.stringify(state())}\n\n`; for (const res of clients) res.write(payload); };
  const twitch = new TwitchBridge({ clientId, clientSecret, tokenFile: options.tokenFile ?? process.env.TWITCH_TOKEN_FILE, redirectUri: `${publicUrl}/auth/callback`, onChange: broadcast, onCommand: (command, user) => {
    const c = find(db.activeId);
    if (command === '!challenge') return `Beat this moment: ${publicUrl}/c/${c.id} — jump with Space, dash with Shift. Can you beat the best time?`;
    const token = id(); joins.set(token, { ...user, challengeId: c.id, expires: Date.now() + 10 * 60 * 1000 });
    return `@${user.name} your challenge entry: ${publicUrl}/c/${c.id}?join=${token} (single-use link, expires in 10 minutes)`;
  } });
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(x => x.trim().split('=')));
  const host = req => (sessions.get(cookies(req).btm_host) || 0) > Date.now();
  const requireHost = req => { if (!host(req)) throw fail('Open the host desk and unlock it first.', 401); };
  const json = (res, data, status = 200, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(data)); };
  const readBody = async req => {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 70000) throw fail('Request too large.', 413); }
    try { return JSON.parse(body || '{}'); } catch { throw fail('Invalid JSON.'); }
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'");
    try {
      const url = new URL(req.url, publicUrl);
      if (req.method === 'GET' && url.pathname === '/healthz') return json(res, { ok: true });
      if (req.method === 'POST') {
        if (req.headers.origin && req.headers.origin !== new URL(publicUrl).origin) throw fail('Origin not permitted.', 403);
        const key = req.socket.remoteAddress;
        const rate = rates.get(key) || { at: Date.now(), count: 0 };
        if (Date.now() - rate.at > 60000) { rate.at = Date.now(); rate.count = 0; }
        rates.set(key, rate); if (++rate.count > 180) throw fail('Too many requests. Try again in a minute.', 429);
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, state());
      if (req.method === 'GET' && url.pathname === '/api/me') return json(res, { host: host(req), keyRequired: !!hostKey });
      if (req.method === 'POST' && url.pathname === '/api/host-session') {
        const body = await readBody(req);
        const loopback = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
        if (hostKey ? body.key !== hostKey : !loopback) throw fail(hostKey ? 'Host key not recognised.' : 'Host access is only available on this computer. Set HOST_KEY for remote hosting.', 403);
        const token = id(); sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
        return json(res, { ok: true }, 200, { 'Set-Cookie': `btm_host=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${publicUrl.startsWith('https:') ? '; Secure' : ''}` });
      }
      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`data: ${JSON.stringify(state())}\n\n`); clients.add(res);
        const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 20000);
        req.on('close', () => { clearInterval(heartbeat); clients.delete(res); }); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/challenges') {
        requireHost(req); const { snapshot, title } = await readBody(req);
        if (!validSnapshot(snapshot) || world(snapshot.seed, snapshot.version).finish - snapshot.x < 400) throw fail('Choose a running moment with at least 400m left.');
        if (world(snapshot.seed, snapshot.version).obstacles.some(o => snapshot.x + PLAYER.w > o.x && snapshot.x < o.x + o.w && snapshot.y + PLAYER.h > FLOOR - o.h)) throw fail('This moment starts inside an obstacle. Choose an earlier checkpoint.');
        const c = newChallenge(snapshot, String(title || 'Beat this moment').trim().slice(0, 60) || 'Beat this moment'); broadcast(); return json(res, challengeView(c), 201);
      }
      if (req.method === 'POST' && url.pathname === '/api/challenges/active') {
        requireHost(req); const { id: cid } = await readBody(req); if (!find(cid)) throw fail('Challenge not found.', 404);
        db.activeId = cid; persist(); broadcast(); return json(res, { ok: true });
      }
      if (req.method === 'GET' && /^\/api\/challenges\/[\w-]+$/.test(url.pathname)) {
        const c = find(url.pathname.split('/').pop()); if (!c) throw fail('Challenge not found.', 404); return json(res, challengeView(c));
      }
      if (req.method === 'POST' && url.pathname === '/api/runs/start') {
        const body = await readBody(req); const c = find(body.challengeId); if (!c) throw fail('Challenge not found.', 404);
        let identity = 'guest', playerId = cleanName(body.name).toLowerCase(), name = cleanName(body.name);
        let playerSession = body.playerSession;
        const returning = playerSessions.get(playerSession);
        if (returning && returning.expires > Date.now()) { identity = 'twitch'; playerId = returning.id; name = returning.name; }
        if (body.joinToken) {
          const join = joins.get(body.joinToken);
          if (!join || join.expires < Date.now() || join.challengeId !== c.id) throw fail('This entry link expired or was used. Type !join in Twitch chat for another.');
          joins.delete(body.joinToken); identity = 'twitch'; playerId = join.id; name = join.name;
          playerSession = id(); playerSessions.set(playerSession, { id: join.id, name: join.name, expires: Date.now() + 3600000 });
        }
        if (!name) throw fail('Enter a player name.');
        const ticket = id(); runTickets.set(ticket, { challengeId: c.id, identity, playerId, name, at: Date.now() });
        return json(res, { ticket, name, identity, playerSession: identity === 'twitch' ? playerSession : undefined, challenge: challengeView(c) }, 201);
      }
      if (req.method === 'POST' && url.pathname === '/api/runs') {
        const body = await readBody(req); const ticket = runTickets.get(body.ticket);
        if (!ticket || Date.now() - ticket.at > 60 * 60 * 1000) throw fail('Run expired. Start another attempt.');
        const c = find(ticket.challengeId);
        let result; try { result = replay(c.snapshot, body.inputs, c.finish); } catch (e) { throw fail(e.message); }
        if (result.seconds * 1000 > Date.now() - ticket.at + 2000) throw fail('Run was submitted faster than real time.');
        const run = { id: id(), name: ticket.name, identity: ticket.identity, playerId: ticket.playerId, ticks: result.ticks, seconds: result.seconds, distance: result.distance, completed: result.completed, jumps: result.jumps, createdAt: Date.now(), inputs: body.inputs };
        if (c.runs.length >= 5000) throw fail('This challenge is full. Ask the host for a new round.');
        runTickets.delete(body.ticket); c.runs.push(run); persist(); broadcast();
        return json(res, { run: { ...run, inputs: undefined }, leaderboard: board(c) }, 201);
      }
      if (req.method === 'GET' && /^\/api\/replays\/[\w-]+\/[\w-]+$/.test(url.pathname)) {
        const [, , , cid, rid] = url.pathname.split('/');
        const c = find(cid), run = c?.runs.find(r => r.id === rid);
        if (!run) throw fail('Replay not found.', 404);
        return json(res, { name: run.name, trace: replay(c.snapshot, run.inputs, c.finish).trace, completed: run.completed });
      }
      if (req.method === 'GET' && url.pathname === '/auth/twitch') {
        if (!ownerChannel) requireHost(req);
        if (!clientId || !clientSecret) throw fail('Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to .env, then restart.');
        if(oauthStates.size>=1000) throw fail('Too many pending sign-ins. Try again later.',429);
        const token = id(), nonce = id(); oauthStates.set(token, { session: cookies(req).btm_host, nonce, expires: Date.now() + 600000 });
        const auth = new URL('https://id.twitch.tv/oauth2/authorize');
        auth.search = new URLSearchParams({ client_id: clientId, redirect_uri: `${publicUrl}/auth/callback`, response_type: 'code', scope: 'user:read:chat user:write:chat', force_verify:'true', state: token }).toString();
        res.writeHead(302, { Location: auth.href, 'Set-Cookie': `btm_oauth=${nonce}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${publicUrl.startsWith('https:') ? '; Secure' : ''}` }); return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/auth/callback') {
        const token = url.searchParams.get('state'); const pending = oauthStates.get(token); oauthStates.delete(token);
        if (!pending || pending.expires < Date.now() || pending.nonce !== cookies(req).btm_oauth || (!ownerChannel && (pending.session !== cookies(req).btm_host || !host(req)))) throw fail('OAuth state expired. Return to the host desk and connect again.', 403);
        if (!url.searchParams.get('code')) throw fail('Twitch authorization was cancelled.');
        try { await twitch.authorize(url.searchParams.get('code'), ownerChannel); } catch(error) { throw fail(error.message,403); }
        const session = id(); sessions.set(session,Date.now()+8*60*60*1000);
        res.writeHead(302, { Location: '/?connected=1', 'Set-Cookie': [`btm_host=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${publicUrl.startsWith('https:') ? '; Secure' : ''}`, `btm_oauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${publicUrl.startsWith('https:') ? '; Secure' : ''}`] }); return res.end();
      }
      if (req.method === 'POST' && url.pathname === '/api/twitch/disconnect') { requireHost(req); twitch.disconnect(); return json(res, { ok: true }); }
      if (req.method === 'GET') {
        const page = url.pathname === '/' || url.pathname === '/overlay' || /^\/c\/[\w-]+$/.test(url.pathname);
        const filename = page ? 'index.html' : url.pathname.slice(1);
        const types = { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript', 'engine.js': 'text/javascript', 'style.css': 'text/css', 'favicon.svg': 'image/svg+xml' };
        if (types[filename]) { res.writeHead(200, { 'Content-Type': types[filename], 'Cache-Control': 'no-cache' }); return res.end(readFileSync(path.join(ROOT, 'public', filename))); }
      }
      throw fail('Not found.', 404);
    } catch (e) { if (!res.headersSent) json(res, { error: e.status ? e.message : 'Something went wrong. Try again.' }, e.status || 500); else res.end(); }
  });
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k,v] of sessions) if (v < now) sessions.delete(k);
    for (const [k,v] of runTickets) if (v.at < now - 3600000) runTickets.delete(k);
    for (const collection of [joins, playerSessions, oauthStates]) for (const [k,v] of collection) if (v.expires < now) collection.delete(k);
    for (const [k,v] of rates) if (v.at < now - 60000) rates.delete(k);
  }, 60000); cleanup.unref();
  const close = () => { clearInterval(cleanup); twitch.disconnect({ forget: false }); for (const res of clients) res.end(); server.close(); };
  const ready = twitch.restore(ownerChannel).catch(() => twitch.update({ connected: false, connecting: false, error: 'Saved Twitch session could not be restored. Connect Twitch again.' }));
  return { server, close, ready };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== 'localhost' && !process.env.HOST_KEY) throw new Error('Set HOST_KEY before exposing the server beyond localhost.');
  const app = createApp();
  app.server.listen(port, host, () => console.log(`Beat This Moment → http://localhost:${port}`));
  process.on('SIGINT', () => app.close()); process.on('SIGTERM', () => app.close());
}
