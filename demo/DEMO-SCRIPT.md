# Beat This Moment — demo outline

Target length: 2 minutes 30 seconds, with time left below the three-minute limit.

## 0:00–0:15 — The idea

“Chat always says they could have done better. Beat This Moment gives them a shot: the streamer turns a failed run into a playable challenge, and viewers start from the same saved game state.”

Show the game and current board. This prototype uses its own browser game; it does not turn arbitrary Twitch video into playable game state.

## 0:15–0:40 — Streamer creates the challenge

Launch a practice run. Jump with Space and dash with Shift. After a crash, select Challenge chat. Show the generated viewer link. Publishing a new challenge starts its own board; previous challenges stay in local history.

## 0:40–1:05 — Twitch connection

Show the connected channel status and the bot's automatic post when the challenge is published. In the channel's chat, send `!challenge` and show the bot returning the playable URL. Open that link as the viewer. Only claim this live behavior when the reply is visibly present.

## 1:05–1:40 — Viewer attempts and verification

Enter a demo player name and take the challenge. Show the resulting score on the shared board, and the bot's chat post if the run takes the lead. Explain: “The server replays the inputs to verify the result.” Completed runs rank ahead of crashes, with completion time deciding the winner.

## 1:40–1:55 — Replay

Use a leaderboard replay control to watch a recorded ghost. If the demo attempt crashes, use an existing completed run and identify it accurately.

## 1:55–2:20 — Built with Codex

Include actual footage of the Codex build conversation and source or test output. Explain the deterministic game engine, saved snapshots, Twitch chat integration, and verified leaderboard. Do not show `.env`, OAuth tokens, host keys, stream keys, private tabs, or account settings.

## 2:20–2:30 — Close

“One moment. The same starting state. A whole community trying to beat it.”

## Recording setup

- OBS profile and scene collection: `Beat This Moment`.
- Capture: dedicated Chrome game window, not the full display.
- Game address: https://beat-the-moment-35-211-225-40.sslip.io/?broadcast=1
- Audio capture is muted. Add narration in an editor, or deliberately configure a microphone before recording narration.
- Output: Hybrid MP4, 1280×720 at 30 FPS, in this directory.
- The public app runs independently on GCP; use the hosted address above.
- Streaming credentials are configured separately. This document contains no credentials.

This is a prepared outline, not evidence of a finished or uploaded video.
