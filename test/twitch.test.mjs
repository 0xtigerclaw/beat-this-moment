import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchBridge } from '../twitch.mjs';

test('broadcaster chat commands subscribe, reply, deduplicate, and respect cooldowns', async () => {
  const realFetch = globalThis.fetch,
    realSocket = globalThis.WebSocket;
  const sockets = [],
    calls = [],
    commands = [];
  class Socket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      sockets.push(this);
    }
    close() {
      this.dispatchEvent(new Event('close'));
    }
    message(type, payload, messageId = 'event-1') {
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ metadata: { message_type: type, message_id: messageId }, payload }),
        }),
      );
    }
  }
  globalThis.WebSocket = Socket;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body });
    if (String(url).includes('/oauth2/token'))
      return Response.json({ access_token: 'dummy-token', refresh_token: 'dummy-refresh' });
    if (String(url).includes('/validate'))
      return Response.json({
        client_id: 'dummy-client',
        user_id: '123',
        login: 'testchannel',
        scopes: ['user:read:chat', 'user:write:chat'],
      });
    return Response.json({ data: [{ is_sent: true }] });
  };
  const bridge = new TwitchBridge({
    clientId: 'dummy-client',
    clientSecret: 'dummy-secret',
    redirectUri: 'http://localhost/auth/callback',
    onCommand: async (command, user) => {
      commands.push({ command, user });
      return 'Challenge link';
    },
  });
  try {
    await bridge.authorize('dummy-code');
    sockets[0].message('session_welcome', { session: { id: 'session-1', keepalive_timeout_seconds: 20 } });
    await new Promise(setImmediate);
    assert.equal(bridge.state.connected, true);
    const subscribe = calls.find((c) => c.url.endsWith('eventsub/subscriptions'));
    assert.deepEqual(JSON.parse(subscribe.body).condition, { broadcaster_user_id: '123', user_id: '123' });
    const payload = {
      event: {
        chatter_user_id: '123',
        chatter_user_name: 'Broadcaster',
        message_id: 'chat-1',
        message: { text: '!challenge' },
      },
    };
    sockets[0].message('notification', payload, 'notice-1');
    await new Promise(setImmediate);
    sockets[0].message('notification', payload, 'notice-1');
    sockets[0].message('notification', payload, 'notice-2');
    await new Promise(setImmediate);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].command, '!challenge');
    const reply = calls.find((c) => c.url.endsWith('chat/messages'));
    assert.equal(JSON.parse(reply.body).reply_parent_message_id, 'chat-1');
    sockets[0].message('revocation', {});
    await new Promise(setImmediate);
    assert.equal(bridge.state.connected, false);
    assert.match(bridge.state.error, /revoked/);
  } finally {
    bridge.disconnect();
    globalThis.fetch = realFetch;
    globalThis.WebSocket = realSocket;
  }
});

test('public hosting requires a host key even when tunnelling localhost', async () => {
  const { createApp } = await import('../server.mjs');
  assert.throws(() => createApp({ publicUrl: 'https://example.com', hostKey: '' }), /HOST_KEY/);
});

function chatHarness() {
  const realFetch = globalThis.fetch,
    realSocket = globalThis.WebSocket,
    sockets = [],
    sent = [];
  class Socket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      sockets.push(this);
    }
    close() {
      this.dispatchEvent(new Event('close'));
    }
    message(type, payload, messageId) {
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ metadata: { message_type: type, message_id: messageId }, payload }),
        }),
      );
    }
  }
  globalThis.WebSocket = Socket;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/oauth2/token'))
      return Response.json({ access_token: 'dummy-token', refresh_token: 'dummy-refresh' });
    if (String(url).includes('/validate'))
      return Response.json({
        client_id: 'dummy-client',
        user_id: '123',
        login: 'testchannel',
        scopes: ['user:read:chat', 'user:write:chat'],
      });
    if (String(url).endsWith('chat/messages')) {
      sent.push(JSON.parse(options.body));
      return Response.json({ data: [{ is_sent: true }] });
    }
    return Response.json({ data: [] });
  };
  const bridge = new TwitchBridge({
    clientId: 'dummy-client',
    clientSecret: 'dummy-secret',
    redirectUri: 'http://localhost/auth/callback',
    onCommand: async (command, user) => `${command} for ${user.name}`,
  });
  const say = async (text, user, id) => {
    sockets[0].message(
      'notification',
      {
        event: {
          chatter_user_id: user,
          chatter_user_name: user,
          message_id: `chat-${id}`,
          message: { text },
        },
      },
      `notice-${id}`,
    );
    await new Promise(setImmediate);
    await new Promise(setImmediate);
  };
  const start = async () => {
    await bridge.authorize('dummy-code');
    sockets[0].message('session_welcome', { session: { id: 'session-1', keepalive_timeout_seconds: 20 } });
    await new Promise(setImmediate);
  };
  const restore = () => {
    bridge.disconnect();
    globalThis.fetch = realFetch;
    globalThis.WebSocket = realSocket;
  };
  return { bridge, sent, say, start, restore };
}

test('a whole chat typing !challenge gets one reply, and each !join still gets its own', async () => {
  const { sent, say, start, restore } = chatHarness();
  try {
    await start();
    await say('!challenge', 'a', 1);
    await say('!challenge', 'b', 2);
    await say('!challenge', 'c', 3);
    assert.equal(sent.length, 1);
    await say('!join', 'd', 4);
    await say('!join', 'e', 5);
    assert.deepEqual(
      sent.slice(1).map((m) => m.message),
      ['!join for d', '!join for e'],
    );
  } finally {
    restore();
  }
});

test('chat replies stop at the send budget instead of flooding Twitch', async () => {
  const { sent, say, start, restore } = chatHarness();
  try {
    await start();
    for (let n = 0; n < 40; n++) await say('!join', `viewer-${n}`, n);
    assert.equal(sent.length, 15);
  } finally {
    restore();
  }
});

test('announcements post without a reply target, and only while connected', async () => {
  const { bridge, sent, start, restore } = chatHarness();
  try {
    assert.equal(await bridge.announce('too early'), false);
    await start();
    assert.equal(await bridge.announce('New leader'), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].message, 'New leader');
    assert.equal('reply_parent_message_id' in sent[0], false);
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error('network blip');
    };
    assert.equal(await bridge.announce('still fine'), false);
    globalThis.fetch = realFetch;
  } finally {
    restore();
  }
});

test('a refused chat subscription retries instead of sticking on connecting', async () => {
  const realFetch = globalThis.fetch,
    realSocket = globalThis.WebSocket,
    realTimeout = globalThis.setTimeout,
    sockets = [],
    delays = [];
  let refuse = true;
  class Socket extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      sockets.push(this);
    }
    close() {
      this.dispatchEvent(new Event('close'));
    }
    message(type, payload) {
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            metadata: { message_type: type, message_id: `m${Math.random()}` },
            payload,
          }),
        }),
      );
    }
  }
  globalThis.WebSocket = Socket;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/oauth2/token'))
      return Response.json({ access_token: 't', refresh_token: 'r' });
    if (String(url).includes('/validate'))
      return Response.json({
        client_id: 'c',
        user_id: '1',
        login: 'o',
        scopes: ['user:read:chat', 'user:write:chat'],
      });
    if (String(url).endsWith('eventsub/subscriptions'))
      return refuse ? new Response('{}', { status: 403 }) : Response.json({ data: [] });
    return Response.json({ data: [] });
  };
  const bridge = new TwitchBridge({
    clientId: 'c',
    clientSecret: 's',
    redirectUri: 'x',
    onCommand: async () => '',
  });
  try {
    await bridge.authorize('code');
    // Run only reconnect waits at once. The socket watchdog uses other durations and must not fire.
    const reconnectWaits = new Set([3000, 6000, 12000, 24000, 48000, 60000]);
    globalThis.setTimeout = (fn, ms, ...rest) => {
      if (!reconnectWaits.has(ms)) return realTimeout(fn, ms, ...rest);
      delays.push(ms);
      return realTimeout(fn, 0, ...rest);
    };
    const welcome = async (socket) => {
      socket.message('session_welcome', { session: { id: 's', keepalive_timeout_seconds: 20 } });
      await new Promise((r) => realTimeout(r, 20));
    };
    await welcome(sockets[0]);
    assert.equal(bridge.state.connected, false);
    assert.match(bridge.state.error, /403/);
    assert.equal(sockets.length, 2);
    await welcome(sockets[1]);
    assert.equal(delays[0], 6000);
    assert.equal(delays[1], 12000);
    refuse = false;
    await welcome(sockets[2]);
    assert.equal(bridge.state.connected, true);
    assert.equal(bridge.state.error, null);
    assert.equal(bridge.subscribeFailures, 0);
  } finally {
    globalThis.setTimeout = realTimeout;
    bridge.disconnect();
    globalThis.fetch = realFetch;
    globalThis.WebSocket = realSocket;
  }
});
