// Installed-bot flow: the broadcaster authorizes their own chat with a user token.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export class TwitchBridge {
  constructor({ clientId, clientSecret, redirectUri, onChange, onCommand, tokenFile }) {
    Object.assign(this, { clientId, clientSecret, redirectUri, onChange, onCommand, tokenFile });
    this.state = { connected: false, connecting: false, channel: null, error: null };
    this.seen = new Set();
    this.lastReplies = new Map();
  }
  update(patch) { Object.assign(this.state, patch); this.onChange?.(); }
  async tokenRequest(body) {
    const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, ...body }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Twitch authorization failed. Reconnect your account.');
    return r.json();
  }
  async authorize(code, ownerChannel = '') {
    const tokens = await this.tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: this.redirectUri });
    const user = await this.identity(tokens.access_token);
    if (ownerChannel && user.login.toLowerCase() !== ownerChannel.toLowerCase()) throw new Error(`Sign in as ${ownerChannel} to connect this host desk.`);
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
    try {
      await this.validate();
      if (!ownerChannel || this.user.login.toLowerCase() !== ownerChannel.toLowerCase()) throw new Error('Saved Twitch session does not match the configured owner.');
      this.startSession();
      return true;
    } catch (error) { this.tokens = null; this.user = null; throw error; }
  }
  startSession() {
    this.persistTokens();
    this.stopped = false;
    this.update({ connecting: true, error: null, channel: this.user.login });
    this.connect();
    clearInterval(this.validationTimer);
    this.validationTimer = setInterval(() => this.validate().catch(() => { this.disconnect(); this.update({ error: 'Twitch session expired. Connect again.' }); }), 55 * 60 * 1000);
    this.validationTimer.unref();
  }
  async identity(accessToken) {
    const r = await fetch('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${accessToken}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw Object.assign(new Error('Twitch token is no longer valid.'), { status: r.status });
    const user = await r.json();
    if (user.client_id !== this.clientId || !['user:read:chat','user:write:chat'].every(s => user.scopes?.includes(s))) throw new Error('Twitch token is missing required chat permissions.');
    return user;
  }
  async validate() {
    try { this.user = await this.identity(this.tokens.access_token); }
    catch (error) {
      if (error.status !== 401 || !this.tokens.refresh_token) throw error;
      this.tokens = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token });
      this.user = await this.identity(this.tokens.access_token);
      this.persistTokens();
    }
  }
  async api(path, body) {
    const send = () => fetch(`https://api.twitch.tv/helix/${path}`, { method: 'POST', headers: { 'Client-Id': this.clientId, Authorization: `Bearer ${this.tokens.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    let r = await send();
    if (r.status === 401) { await this.validate(); r = await send(); }
    if (!r.ok) throw new Error(`Twitch request failed (${r.status}). Check authorization and reconnect.`);
    return r.json();
  }
  connect(url = 'wss://eventsub.wss.twitch.tv/ws', migrating = false) {
    if (this.stopped) return;
    const ws = new WebSocket(url);
    const previous = this.socket;
    this.socket = ws;
    let watchdog;
    const arm = seconds => { clearTimeout(watchdog); watchdog = setTimeout(() => ws.close(), (seconds + 10) * 1000); watchdog.unref(); };
    let keepalive = 20;
    arm(keepalive);
    ws.addEventListener('message', async event => {
      try {
        const m = JSON.parse(event.data);
        keepalive = m.payload?.session?.keepalive_timeout_seconds || keepalive;
        arm(keepalive);
        if (m.metadata.message_type === 'session_welcome') {
          if (!migrating) await this.api('eventsub/subscriptions', { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.user.user_id, user_id: this.user.user_id }, transport: { method: 'websocket', session_id: m.payload.session.id } });
          previous?.close();
          this.update({ connected: true, connecting: false, error: null });
        } else if (m.metadata.message_type === 'session_reconnect') {
          const target = new URL(m.payload.session.reconnect_url);
          if (target.protocol !== 'wss:' || target.hostname !== 'eventsub.wss.twitch.tv') throw new Error('Unexpected Twitch reconnect address.');
          this.connect(target.href, true);
        } else if (m.metadata.message_type === 'revocation') {
          this.disconnect(); this.update({ error: 'Twitch revoked chat permission. Connect again.' });
        } else if (m.metadata.message_type === 'notification') {
          const id = m.metadata.message_id;
          if (this.seen.has(id)) return;
          this.seen.add(id);
          if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
          const e = m.payload.event;
          const command = e.message.text.trim().toLowerCase();
          if (!['!challenge','!join'].includes(command)) return;
          const last = this.lastReplies.get(e.chatter_user_id) || 0;
          if (Date.now() - last < 10000) return;
          this.lastReplies.set(e.chatter_user_id, Date.now());
          if (this.lastReplies.size > 2000) this.lastReplies.delete(this.lastReplies.keys().next().value);
          const message = await this.onCommand(command, { id: e.chatter_user_id, name: e.chatter_user_name });
          if (message) {
            const result = await this.api('chat/messages', { broadcaster_id: this.user.user_id, sender_id: this.user.user_id, reply_parent_message_id: e.message_id, message: message.slice(0, 480) });
            if (result.data?.[0]?.is_sent === false) this.update({ error: 'Twitch blocked a chat reply. Check AutoMod and link permissions.' });
          }
        }
      } catch (error) { this.update({ error: error.message }); }
    });
    ws.addEventListener('error', () => this.update({ error: 'Twitch connection interrupted. Retrying…' }));
    ws.addEventListener('close', () => {
      clearTimeout(watchdog);
      if (!this.stopped && this.socket === ws) {
        this.update({ connected: false, connecting: true });
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        this.reconnectTimer.unref();
      }
    });
  }
  disconnect({ forget = true } = {}) {
    this.stopped = true;
    clearTimeout(this.reconnectTimer); clearInterval(this.validationTimer);
    this.socket?.close(); this.tokens = null; this.user = null;
    if (forget && this.tokenFile && existsSync(this.tokenFile)) unlinkSync(this.tokenFile);
    this.update({ connected: false, connecting: false, channel: null, error: null });
  }
}
