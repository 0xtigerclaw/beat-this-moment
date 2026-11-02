import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TwitchBridge } from '../twitch.mjs';

test('persisted Twitch credentials refresh, survive shutdown, enforce owner, and clear on disconnect', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'btm-tokens-')),
    tokenFile = path.join(dir, 'tokens.json');
  const originalFetch = globalThis.fetch,
    originalSocket = globalThis.WebSocket;
  let rejectOld = false,
    login = 'owner',
    connections = 0;
  class Socket extends EventTarget {
    constructor() {
      super();
      connections++;
    }
    close() {
      this.dispatchEvent(new Event('close'));
    }
  }
  globalThis.WebSocket = Socket;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/oauth2/token')) {
      const refresh = options.body.get('grant_type') === 'refresh_token';
      return Response.json({
        access_token: refresh ? 'new-access' : 'old-access',
        refresh_token: refresh ? 'new-refresh' : 'old-refresh',
      });
    }
    if (rejectOld && options.headers.Authorization === 'OAuth old-access')
      return new Response('', { status: 401 });
    return Response.json({
      client_id: 'test-client',
      user_id: '123',
      login,
      scopes: ['user:read:chat', 'user:write:chat'],
    });
  };
  const make = () =>
    new TwitchBridge({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      redirectUri: 'https://example.com/auth/callback',
      tokenFile,
    });
  let bridge = make();
  try {
    await bridge.authorize('test-code', 'owner');
    assert.equal(statSync(tokenFile).mode & 0o777, 0o600);
    bridge.disconnect({ forget: false });
    assert.ok(existsSync(tokenFile));
    rejectOld = true;
    bridge = make();
    assert.equal(await bridge.restore('owner'), true);
    assert.equal(bridge.user.login, 'owner');
    assert.equal(JSON.parse(readFileSync(tokenFile)).refresh_token, 'new-refresh');
    bridge.disconnect({ forget: false });
    const before = connections;
    login = 'someone_else';
    bridge = make();
    await assert.rejects(bridge.restore('owner'), /configured owner/);
    assert.equal(connections, before);
    assert.equal(bridge.tokens, null);
    bridge.disconnect();
    assert.equal(existsSync(tokenFile), false);
    writeFileSync(tokenFile, '{}');
    bridge = make();
    await assert.rejects(bridge.restore('owner'), /invalid/);
  } finally {
    bridge.disconnect();
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalSocket;
    rmSync(dir, { recursive: true, force: true });
  }
});

const HOUR = 55 * 60 * 1000,
  VALID = {
    client_id: 'test-client',
    user_id: '123',
    login: 'owner',
    scopes: ['user:read:chat', 'user:write:chat'],
  };
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
};

// Runs a bridge against a scripted Twitch: set validate/refresh to change how each endpoint answers.
function harness(t, saved = { access_token: 'old-access', refresh_token: 'old-refresh' }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'btm-tokens-')),
    tokenFile = path.join(dir, 'tokens.json');
  const originalFetch = globalThis.fetch,
    originalSocket = globalThis.WebSocket,
    sockets = [];
  const twitch = {
    validate: () => Response.json(VALID),
    refresh: () => Response.json({ access_token: 'new-access', refresh_token: 'new-refresh' }),
    calls: { validate: 0, refresh: 0 },
  };
  class Socket extends EventTarget {
    constructor() {
      super();
      sockets.push(this);
      this.closed = 0;
    }
    close() {
      this.closed++;
    }
  }
  globalThis.WebSocket = Socket;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/oauth2/validate')) {
      twitch.calls.validate++;
      return twitch.validate();
    }
    if (String(url).includes('/oauth2/token')) {
      twitch.calls.refresh++;
      return twitch.refresh();
    }
    return Response.json({ data: [{}] });
  };
  writeFileSync(tokenFile, JSON.stringify(saved));
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bridge = new TwitchBridge({
    clientId: 'test-client',
    clientSecret: 'test-secret',
    redirectUri: 'https://example.com/auth/callback',
    tokenFile,
  });
  t.after(() => {
    bridge.disconnect({ forget: false });
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalSocket;
    rmSync(dir, { recursive: true, force: true });
  });
  const welcome = async (socket) => {
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          metadata: { message_type: 'session_welcome' },
          payload: { session: { id: 's1', keepalive_timeout_seconds: 1000000 } },
        }),
      }),
    );
    await settle();
  };
  const tick = async (ms) => {
    t.mock.timers.tick(ms);
    await settle();
  };
  return {
    bridge,
    twitch,
    tokenFile,
    sockets,
    welcome,
    tick,
    saved: () => JSON.parse(readFileSync(tokenFile)),
  };
}
async function liveSession(h) {
  assert.equal(await h.bridge.restore('owner'), true);
  await h.welcome(h.sockets[0]);
  assert.equal(h.bridge.state.connected, true);
}

for (const [name, failure] of [
  [
    'a network error',
    () => {
      throw new TypeError('fetch failed');
    },
  ],
  [
    'a timeout',
    () => {
      throw new DOMException('timed out', 'TimeoutError');
    },
  ],
  ['a 503 reply', () => new Response('', { status: 503 })],
  ['a rate limit reply', () => new Response('', { status: 429 })],
  ['a broken 200 reply', () => new Response('<html>')],
])
  test(`${name} during the hourly check keeps the login and recovers on retry`, async (t) => {
    const h = harness(t);
    await liveSession(h);
    h.twitch.validate = failure;
    await h.tick(HOUR);
    assert.equal(existsSync(h.tokenFile), true);
    assert.equal(h.bridge.tokens.access_token, 'old-access');
    assert.equal(h.bridge.state.connected, true);
    assert.equal(h.sockets[0].closed, 0);
    assert.equal(h.sockets.length, 1);
    assert.match(h.bridge.state.error, /Retrying/);
    h.twitch.validate = () => Response.json(VALID);
    await h.tick(30000);
    assert.equal(h.bridge.state.error, null);
    assert.equal(h.bridge.state.connected, true);
    const after = h.twitch.calls.validate;
    await h.tick(HOUR - 1);
    assert.equal(h.twitch.calls.validate, after);
    await h.tick(1);
    assert.equal(h.twitch.calls.validate, after + 1);
  });

test('retries back off, stay well under an hour, and do not touch the login', async (t) => {
  const h = harness(t);
  await liveSession(h);
  h.twitch.validate = () => new Response('', { status: 500 });
  await h.tick(HOUR);
  for (const delay of [30000, 60000, 120000, 300000, 300000]) {
    const before = h.twitch.calls.validate;
    await h.tick(delay - 1);
    assert.equal(h.twitch.calls.validate, before);
    await h.tick(1);
    assert.equal(h.twitch.calls.validate, before + 1);
  }
  assert.equal(h.saved().refresh_token, 'old-refresh');
  assert.equal(h.bridge.state.connected, true);
});

test('a temporary refresh failure keeps the login and retries', async (t) => {
  const h = harness(t);
  await liveSession(h);
  h.twitch.validate = () => new Response('', { status: 401 });
  for (const failure of [
    () => new Response('', { status: 500 }),
    () => new Response('', { status: 429 }),
    () => {
      throw new TypeError('fetch failed');
    },
    () => Response.json({}),
  ]) {
    h.twitch.refresh = failure;
    await h.tick(HOUR);
    assert.equal(existsSync(h.tokenFile), true);
    assert.equal(h.saved().refresh_token, 'old-refresh');
    assert.equal(h.bridge.tokens.refresh_token, 'old-refresh');
    assert.match(h.bridge.state.error, /Retrying/);
  }
  h.twitch.refresh = () => Response.json({ access_token: 'new-access', refresh_token: 'new-refresh' });
  h.twitch.validate = () => Response.json(VALID);
  await h.tick(HOUR);
  assert.equal(h.bridge.state.error, null);
});

test('a refreshed token is saved even when the check after it fails', async (t) => {
  const h = harness(t);
  await liveSession(h);
  h.twitch.validate = () => new Response('', { status: 401 });
  h.twitch.refresh = () => {
    h.twitch.validate = () => new Response('', { status: 503 });
    return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh' });
  };
  await h.tick(HOUR);
  assert.equal(h.saved().refresh_token, 'new-refresh');
  assert.match(h.bridge.state.error, /Retrying/);
});

for (const status of [400, 401, 403])
  test(`a refresh rejected with ${status} clears the login`, async (t) => {
    const h = harness(t);
    await liveSession(h);
    h.twitch.validate = () => new Response('', { status: 401 });
    h.twitch.refresh = () => new Response('', { status });
    await h.tick(HOUR);
    assert.equal(existsSync(h.tokenFile), false);
    assert.equal(h.bridge.tokens, null);
    assert.equal(h.bridge.state.connected, false);
    assert.match(h.bridge.state.error, /session expired/);
    const after = h.twitch.calls.validate;
    await h.tick(HOUR * 2);
    assert.equal(h.twitch.calls.validate, after);
  });

test('a 401 with no refresh token, missing scopes, or a foreign client clear the login', async (t) => {
  for (const [name, saved, reply] of [
    ['no refresh token', { access_token: 'old-access' }, () => new Response('', { status: 401 })],
    ['missing scopes', undefined, () => Response.json({ ...VALID, scopes: ['user:read:chat'] })],
    ['foreign client', undefined, () => Response.json({ ...VALID, client_id: 'other-client' })],
  ])
    await t.test(name, async (t2) => {
      const h = harness(t2, saved);
      await liveSession(h);
      h.twitch.validate = reply;
      await h.tick(HOUR);
      assert.equal(existsSync(h.tokenFile), false);
      assert.match(h.bridge.state.error, /session expired/);
    });
});

for (const [name, failure] of [
  [
    'a network error',
    () => {
      throw new TypeError('fetch failed');
    },
  ],
  ['a 503 reply', () => new Response('', { status: 503 })],
])
  test(`${name} at startup retries and connects`, async (t) => {
    const h = harness(t);
    h.twitch.validate = failure;
    assert.equal(await h.bridge.restore('owner'), false);
    assert.equal(existsSync(h.tokenFile), true);
    assert.equal(h.bridge.tokens.access_token, 'old-access');
    assert.equal(h.bridge.state.connecting, true);
    assert.match(h.bridge.state.error, /Retrying/);
    assert.equal(h.sockets.length, 0);
    await h.tick(30000);
    assert.equal(h.sockets.length, 0);
    h.twitch.validate = () => Response.json(VALID);
    await h.tick(60000);
    assert.equal(h.sockets.length, 1);
    assert.equal(h.bridge.state.error, null);
    await h.welcome(h.sockets[0]);
    assert.equal(h.bridge.state.connected, true);
    const after = h.twitch.calls.validate;
    await h.tick(HOUR);
    assert.equal(h.twitch.calls.validate, after + 1);
  });

test('startup rejections still fail, right away or after a retry', async (t) => {
  await t.test('rejected refresh on first try', async (t2) => {
    const h = harness(t2);
    h.twitch.validate = () => new Response('', { status: 401 });
    h.twitch.refresh = () => new Response('', { status: 400 });
    await assert.rejects(h.bridge.restore('owner'), /authorization failed/);
    assert.equal(h.bridge.tokens, null);
    await h.tick(HOUR);
    assert.equal(h.twitch.calls.refresh, 1);
  });
  await t.test('wrong owner after a retry', async (t2) => {
    const h = harness(t2);
    h.twitch.validate = () => new Response('', { status: 503 });
    assert.equal(await h.bridge.restore('owner'), false);
    h.twitch.validate = () => Response.json({ ...VALID, login: 'someone_else' });
    await h.tick(30000);
    assert.equal(h.sockets.length, 0);
    assert.equal(h.bridge.tokens, null);
    assert.equal(h.bridge.state.connecting, false);
    assert.equal(h.bridge.state.channel, null);
    assert.match(h.bridge.state.error, /could not be restored/);
    const after = h.twitch.calls.validate;
    await h.tick(HOUR * 2);
    assert.equal(h.twitch.calls.validate, after);
  });
});

test('host disconnect removes the file and stops retries, even mid-check', async (t) => {
  await t.test('while waiting to retry at startup', async (t2) => {
    const h = harness(t2);
    h.twitch.validate = () => new Response('', { status: 503 });
    await h.bridge.restore('owner');
    h.bridge.disconnect();
    assert.equal(existsSync(h.tokenFile), false);
    const after = h.twitch.calls.validate;
    await h.tick(HOUR);
    assert.equal(h.twitch.calls.validate, after);
    assert.equal(h.bridge.state.connecting, false);
  });
  await t.test('while an hourly refresh is in flight', async (t2) => {
    const h = harness(t2);
    await liveSession(h);
    let answer;
    h.twitch.validate = () => new Response('', { status: 401 });
    h.twitch.refresh = () =>
      new Promise((resolve) => {
        answer = resolve;
      });
    await h.tick(HOUR);
    h.bridge.disconnect();
    answer(Response.json({ access_token: 'late-access', refresh_token: 'late-refresh' }));
    await settle();
    assert.equal(existsSync(h.tokenFile), false);
    assert.equal(h.bridge.tokens, null);
    assert.equal(h.bridge.state.error, null);
    const after = h.twitch.calls.validate;
    await h.tick(HOUR);
    assert.equal(h.twitch.calls.validate, after);
  });
  await t.test('while an hourly check that then fails is in flight', async (t2) => {
    const h = harness(t2);
    await liveSession(h);
    let answer;
    h.twitch.validate = () =>
      new Promise((resolve) => {
        answer = resolve;
      });
    await h.tick(HOUR);
    h.bridge.disconnect();
    answer(new Response('', { status: 503 }));
    await settle();
    assert.equal(h.bridge.state.error, null);
    const after = h.twitch.calls.validate;
    await h.tick(HOUR);
    assert.equal(h.twitch.calls.validate, after);
  });
  await t.test('while a startup retry is in flight', async (t2) => {
    const h = harness(t2);
    h.twitch.validate = () => new Response('', { status: 503 });
    await h.bridge.restore('owner');
    let answer;
    h.twitch.validate = () =>
      new Promise((resolve) => {
        answer = resolve;
      });
    await h.tick(30000);
    h.bridge.disconnect();
    answer(Response.json(VALID));
    await settle();
    assert.equal(h.sockets.length, 0);
    assert.equal(h.bridge.state.connecting, false);
    assert.equal(existsSync(h.tokenFile), false);
  });
  await t.test('shutdown keeps the file and clears the timer', async (t2) => {
    const h = harness(t2);
    await liveSession(h);
    h.bridge.disconnect({ forget: false });
    assert.equal(existsSync(h.tokenFile), true);
    const after = h.twitch.calls.validate;
    await h.tick(HOUR);
    assert.equal(h.twitch.calls.validate, after);
  });
});

test('signing in during a startup retry replaces it, and a late failure leaves the new login alone', async (t) => {
  const h = harness(t);
  h.twitch.validate = () => new Response('', { status: 503 });
  await h.bridge.restore('owner');
  let answer;
  h.twitch.validate = () =>
    new Promise((resolve) => {
      answer = resolve;
    });
  await h.tick(30000);
  const stale = answer;
  h.twitch.validate = () => Response.json(VALID);
  h.twitch.refresh = () => Response.json({ access_token: 'fresh-access', refresh_token: 'fresh-refresh' });
  await h.bridge.authorize('code', 'owner');
  stale(new Response('', { status: 503 }));
  await settle();
  assert.equal(h.bridge.tokens.access_token, 'fresh-access');
  assert.equal(h.saved().refresh_token, 'fresh-refresh');
  assert.equal(h.sockets.length, 1);
  assert.equal(h.bridge.state.connecting, true);
  assert.equal(h.bridge.state.error, null);
});

test('a Twitch revocation still removes the file', async (t) => {
  const h = harness(t);
  await liveSession(h);
  h.sockets[0].dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({ metadata: { message_type: 'revocation' }, payload: {} }),
    }),
  );
  await settle();
  assert.equal(existsSync(h.tokenFile), false);
  assert.match(h.bridge.state.error, /revoked/);
});

test('concurrent checks share one refresh', async (t) => {
  const h = harness(t);
  await liveSession(h);
  h.twitch.validate = () =>
    h.bridge.tokens.access_token === 'new-access' ? Response.json(VALID) : new Response('', { status: 401 });
  await Promise.all([h.bridge.validate(), h.bridge.validate()]);
  assert.equal(h.twitch.calls.refresh, 1);
  assert.equal(h.saved().refresh_token, 'new-refresh');
});
