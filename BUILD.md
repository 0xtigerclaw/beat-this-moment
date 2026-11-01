# Beat This Moment — build contract

Build a one-button jump / optional dash browser runner with a real saved-state challenge. A host plays, publishes the pre-failure state, viewers attempt the same state, and an OBS overlay updates from server-verified results. A winning run can be replayed as a ghost. Start locally with no external service dependencies. Twitch is an explicitly disconnected integration until OAuth is completed.

Acceptance:
- Fixed-timestep simulation restores x/y/velocity, energy, frame, seed and jump count exactly.
- Server recomputes every submitted run from its recorded inputs, never accepts client scores.
- Challenge links work in a separate browser session, and results persist across restarts.
- A new challenge isolates its runs and leaderboard. Replays reference the correct challenge.
- Host mutations require a host session. Public routes expose no tokens or credentials.
- Guests can play without Twitch; guest names are not represented as verified Twitch identities.
- Twitch broadcaster OAuth subscribes to chat via EventSub WebSocket, validates/refreshes tokens, reconnects, and implements !challenge and !join.
- OBS overlay is transparent, read-only, and updates through SSE.
- Keyboard and mobile jump/dash controls work; UI exposes connection/errors honestly.

Verify deterministic replay, snapshot restoration, invalid run rejection, host authorization, persistence and a separate-session browser round trip. Live Twitch verification remains dependent on a registered Twitch app and broadcaster authorization.
