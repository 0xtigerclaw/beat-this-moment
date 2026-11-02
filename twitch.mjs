// Installed-bot flow: the broadcaster authorizes their own chat with a user token.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const CHECK_INTERVAL = 55 * 60 * 1000;
const RETRY_DELAYS = [30, 60, 120, 300].map((seconds) => seconds * 1000);
const RETRYING = 'Twitch is not answering right now. Retrying…';
// Keeps the bot well inside Twitch's chat limits when a whole chat fires commands at once.
const SEND_WINDOW = 30 * 1000,
  SEND_LIMIT = 15,
  CHALLENGE_COOLDOWN = 15 * 1000;
const SUBSCRIBE_RETRY_LIMIT = 60 * 1000;
const retryDelay = (failures) => RETRY_DELAYS[Math.min(failures, RETRY_DELAYS.length - 1)];

export class TwitchBridge {
  constructor({ clientId, clientSecret, redirectUri, onChange, onCommand, tokenFile }) {
    Object.assign(this, { clientId, clientSecret, redirectUri, onChange, onCommand, tokenFile });
    this.state = { connected: false, connecting: false, channel: null, error: null };
    this.seen = new Set();
    this.lastReplies = new Map();
    this.sendTimes = [];
    this.lastChallengeReply = 0;
    this.subscribeFailures = 0;
    this.session = 0;
  }
  update(patch) {
    Object.assign(this.state, patch);
    this.onChange?.();
  }
  async tokenRequest(body) {
    const r = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...body }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw Object.assign(new Error('Twitch authorization failed. Reconnect your account.'), {
        status: r.status,
      });
    return r.json();
  }
  async authorize(code, ownerChannel = '') {
    const tokens = await this.tokenRequest({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });
    const user = await this.identity(tokens.access_token);
    if (ownerChannel && user.login.toLowerCase() !== ownerChannel.toLowerCase())
      throw new Error(`Sign in as ${ownerChannel} to connect this host desk.`);
    this.tokens = tokens;
    this.user = user;
    this.startSession();
  }
  persistTokens() {
    if (!this.tokenFile || !this.tokens) return;
    mkdirSync(path.dirname(this.tokenFile), { recursive: true, mode: 0o700 });
    writeFileSync(`${this.tokenFile}.tmp`, JSON.stringify(this.tokens), { mode: 0o600 });
    renameSync(`${this.tokenFile}.tmp`, this.tokenFile);
  }
  async restore(ownerChannel = '') {
    if (!this.tokenFile || !existsSync(this.tokenFile)) return false;
    this.tokens = JSON.parse(readFileSync(this.tokenFile, 'utf8'));
    if (!this.tokens?.access_token) throw new Error('Saved Twitch session is invalid. Connect again.');
    return this.resume(ownerChannel);
  }
  async resume(ownerChannel, failures = 0) {
    const session = this.session;
    try {
      await this.validate();
      if (session !== this.session) return false;
      if (!ownerChannel || this.user.login.toLowerCase() !== ownerChannel.toLowerCase())
        throw Object.assign(new Error('Saved Twitch session does not match the configured owner.'), {
          rejected: true,
        });
      this.startSession();
      return true;
    } catch (error) {
      if (session !== this.session) return false;
      if (error.rejected) {
        this.tokens = null;
        this.user = null;
        throw error;
      }
      this.update({ connecting: true, channel: ownerChannel || null, error: RETRYING });
      this.scheduleCheck(retryDelay(failures), () =>
        this.resume(ownerChannel, failures + 1).catch(() =>
          this.update({
            connected: false,
            connecting: false,
            channel: null,
            error: 'Saved Twitch session could not be restored. Connect Twitch again.',
          }),
        ),
      );
      return false;
    }
  }
  startSession() {
    this.session++;
    this.persistTokens();
    this.stopped = false;
    this.update({ connecting: true, error: null, channel: this.user.login });
    this.connect();
    this.scheduleCheck(CHECK_INTERVAL, () => this.checkSession());
  }
  scheduleCheck(delay, check) {
    clearTimeout(this.validationTimer);
    this.validationTimer = setTimeout(check, delay);
    this.validationTimer.unref();
  }
  async checkSession(failures = 0) {
    const session = this.session;
    try {
      await this.validate();
      if (session !== this.session) return;
      if (this.state.error === RETRYING) this.update({ error: null });
      this.scheduleCheck(CHECK_INTERVAL, () => this.checkSession());
    } catch (error) {
      if (session !== this.session) return;
      if (error.rejected) {
        this.disconnect();
        this.update({ error: 'Twitch session expired. Connect again.' });
        return;
      }
      this.update({ error: RETRYING });
      this.scheduleCheck(retryDelay(failures), () => this.checkSession(failures + 1));
    }
  }
  async identity(accessToken) {
    const r = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw Object.assign(new Error('Twitch token is no longer valid.'), { status: r.status });
    const user = await r.json();
    if (!user.client_id) throw new Error('Twitch sent an unexpected validation reply.');
    if (
      user.client_id !== this.clientId ||
      !['user:read:chat', 'user:write:chat'].every((s) => user.scopes?.includes(s))
    )
      throw Object.assign(new Error('Twitch token is missing required chat permissions.'), {
        rejected: true,
      });
    return user;
  }
  // Errors marked rejected mean Twitch refused this login. Everything else is temporary.
  validate() {
    return (this.validating ??= this.validateTokens().finally(() => {
      this.validating = null;
    }));
  }
  async validateTokens() {
    const tokens = this.tokens;
    try {
      const user = await this.identity(tokens.access_token);
      if (this.tokens === tokens) this.user = user;
    } catch (error) {
      if (error.status !== 401) throw error;
      if (!tokens.refresh_token) throw Object.assign(error, { rejected: true });
      const fresh = await this.tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }).catch((refreshError) => {
        throw Object.assign(refreshError, { rejected: [400, 401, 403].includes(refreshError.status) });
      });
      if (!fresh.access_token) throw new Error('Twitch sent an unexpected refresh reply.');
      if (this.tokens !== tokens) return;
      this.tokens = fresh;
      this.persistTokens();
      const user = await this.identity(fresh.access_token);
      if (this.tokens === fresh) this.user = user;
    }
  }
  canSend() {
    const now = Date.now();
    this.sendTimes = this.sendTimes.filter((at) => now - at < SEND_WINDOW);
    if (this.sendTimes.length >= SEND_LIMIT) return false;
    this.sendTimes.push(now);
    return true;
  }
  async sendChat(message, replyTo) {
    const result = await this.api('chat/messages', {
      broadcaster_id: this.user.user_id,
      sender_id: this.user.user_id,
      ...(replyTo ? { reply_parent_message_id: replyTo } : {}),
      message: message.slice(0, 480),
    });
    if (result.data?.[0]?.is_sent === false)
      this.update({ error: 'Twitch blocked a chat reply. Check AutoMod and link permissions.' });
  }
  // Posts to chat unprompted. A failed announcement must never break the action that caused it.
  async announce(message) {
    if (!this.state.connected || !this.user || !this.canSend()) return false;
    try {
      await this.sendChat(message);
      return true;
    } catch (error) {
      this.update({ error: error.message });
      return false;
    }
  }
  async api(path, body) {
    const send = () =>
      fetch(`https://api.twitch.tv/helix/${path}`, {
        method: 'POST',
        headers: {
          'Client-Id': this.clientId,
          Authorization: `Bearer ${this.tokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    let r = await send();
    if (r.status === 401) {
      await this.validate();
      r = await send();
    }
    if (!r.ok) throw new Error(`Twitch request failed (${r.status}). Check authorization and reconnect.`);
    return r.json();
  }
  connect(url = 'wss://eventsub.wss.twitch.tv/ws', migrating = false) {
    if (this.stopped) return;
    const ws = new WebSocket(url);
    const previous = this.socket;
    this.socket = ws;
    let watchdog;
    const arm = (seconds) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ws.close(), (seconds + 10) * 1000);
      watchdog.unref();
    };
    let keepalive = 20;
    arm(keepalive);
    ws.addEventListener('message', async (event) => {
      try {
        const m = JSON.parse(event.data);
        keepalive = m.payload?.session?.keepalive_timeout_seconds || keepalive;
        arm(keepalive);
        if (m.metadata.message_type === 'session_welcome') {
          if (!migrating) {
            try {
              await this.api('eventsub/subscriptions', {
                type: 'channel.chat.message',
                version: '1',
                condition: { broadcaster_user_id: this.user.user_id, user_id: this.user.user_id },
                transport: { method: 'websocket', session_id: m.payload.session.id },
              });
            } catch (error) {
              // Without a subscription this socket can never deliver chat, so close it and try again.
              this.subscribeFailures++;
              this.update({ error: error.message });
              ws.close();
              return;
            }
          }
          this.subscribeFailures = 0;
          previous?.close();
          this.update({ connected: true, connecting: false, error: null });
        } else if (m.metadata.message_type === 'session_reconnect') {
          const target = new URL(m.payload.session.reconnect_url);
          if (target.protocol !== 'wss:' || target.hostname !== 'eventsub.wss.twitch.tv')
            throw new Error('Unexpected Twitch reconnect address.');
          this.connect(target.href, true);
        } else if (m.metadata.message_type === 'revocation') {
          this.disconnect();
          this.update({ error: 'Twitch revoked chat permission. Connect again.' });
        } else if (m.metadata.message_type === 'notification') {
          const id = m.metadata.message_id;
          if (this.seen.has(id)) return;
          this.seen.add(id);
          if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
          const e = m.payload.event;
          const command = e.message.text.trim().toLowerCase();
          if (!['!challenge', '!join'].includes(command)) return;
          const last = this.lastReplies.get(e.chatter_user_id) || 0;
          if (Date.now() - last < 10000) return;
          this.lastReplies.set(e.chatter_user_id, Date.now());
          if (this.lastReplies.size > 2000) this.lastReplies.delete(this.lastReplies.keys().next().value);
          // Everyone sees a !challenge reply, so one link is enough for the whole chat.
          if (command === '!challenge' && Date.now() - this.lastChallengeReply < CHALLENGE_COOLDOWN) return;
          if (!this.canSend()) return;
          if (command === '!challenge') this.lastChallengeReply = Date.now();
          const message = await this.onCommand(command, { id: e.chatter_user_id, name: e.chatter_user_name });
          if (message) await this.sendChat(message, e.message_id);
        }
      } catch (error) {
        this.update({ error: error.message });
      }
    });
    ws.addEventListener('error', () => this.update({ error: 'Twitch connection interrupted. Retrying…' }));
    ws.addEventListener('close', () => {
      clearTimeout(watchdog);
      if (!this.stopped && this.socket === ws) {
        this.update({ connected: false, connecting: true });
        this.reconnectTimer = setTimeout(
          () => this.connect(),
          Math.min(SUBSCRIBE_RETRY_LIMIT, 3000 * 2 ** this.subscribeFailures),
        );
        this.reconnectTimer.unref();
      }
    });
  }
  disconnect({ forget = true } = {}) {
    this.stopped = true;
    this.session++;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.validationTimer);
    this.socket?.close();
    this.tokens = null;
    this.user = null;
    if (forget && this.tokenFile && existsSync(this.tokenFile)) unlinkSync(this.tokenFile);
    this.update({ connected: false, connecting: false, channel: null, error: null });
  }
}
