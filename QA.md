# Verification — November 1, 2026

`npm test`: 10 tests passed. `npm run check`: all JavaScript syntax checks passed.

Verified with a running localhost server and Chromium:
- Host practice run crashes and offers a pre-crash snapshot for publication.
- Publishing creates an actual saved challenge and share URL.
- A separate browser context loads that challenge without host permissions.
- A guest crash is submitted, replayed by the server, and shown on the host's board through SSE.
- Keyboard events drive a completed viewer run; the server verifies it and promotes it above the crash.
- The winner's recorded ghost replay starts through the replay button.
- The OBS page displays the same results and has a transparent background.
- At 390px wide there is no horizontal overflow and the visible jump control starts the game.
- Twitch setup opens, explains missing credentials, and disables authorization until configured.
- A missing challenge shows an unavailable state and disables entry.

The Twitch module's subscription, broadcaster commands, replies, deduplication, cooldown and revocation are tested with mocked Twitch HTTP/WebSocket responses. Owner OAuth tests cover browser nonce/state binding, single-use state, rejection of other accounts, and host access for the configured owner only.

The registered application's credentials have been accepted by Twitch through a server-side client-credentials exchange; the resulting token was kept in memory and not printed. Chrome reached the real Twitch authorization screen for `Beat This Moment by 0xtigerclaw`, signed in as `0xtigerclaw`, with the correct public callback and read/write chat permissions. Broadcaster consent completed successfully. The public server reports `connected: true`, channel `0xtigerclaw`, `connecting: false`, and no error after Twitch accepted the EventSub chat subscription.

**Real chat command/reply verified:** the user tested `!challenge` and supplied the bot's expected reply containing the current playable challenge URL, Space/Shift controls, and challenge invitation. This confirms the live path from Twitch chat through EventSub to the Send Chat Message API. `!join` attribution still has only mocked coverage; it has not been confirmed in live chat.

Public HTTPS access through a temporary Cloudflare Tunnel is now tested: viewer entry, verified score submission, leaderboard updates, generated public challenge links, two-second polling configuration, and denial of anonymous host access. This is not independent cloud-server deployment; the Mac and both processes must remain running.

The active challenge is named `0xtigerclaw / opening challenge`. The live board includes a completed Guest-636 run at 5.42 seconds. Earlier verification runs remain in stored history, visibly attributed to `Browser tester`.

OBS has a separate `Beat This Moment` profile and scene collection. Its window-capture source targets the dedicated Chrome game window, with the browser toolbar cropped out and capture audio muted. A local 10.53-second recording was verified with ffprobe: H.264, 1280×720, 30 FPS, with an AAC audio track. An extracted frame confirms the compact game and leaderboard are captured without the browser toolbar. The original MOV and a losslessly remuxed `demo/capture-test.mp4` are saved locally.

**Public Twitch broadcast verified:** after explicit user approval, the user copied their existing stream key and it was pasted directly into OBS's secure field. OBS transmitted to Twitch at approximately 4,671 kbps. The public channel showed LIVE, and a separate signed-out Twitch viewer played the actual game image. The test lasted approximately 1 minute 51 seconds; streaming and recording were then stopped and OBS showed both Start buttons again. The local recording, `demo/twitch-broadcast-test.mp4`, is 98.97 seconds, H.264 1280×720 at 30 FPS, with AAC audio. It is a connection/capture test, not the final narrated hackathon video.

A new automated `!challenge` send has not been confirmed during this broadcast test. The earlier real chat command/reply remains verified. Chrome control was unreliable; an unsent command draft may remain in its chat box.

**Additional gameplay capture:** the `Viewer gameplay` OBS scene uses a Browser source pointed at the existing public challenge. Actual viewer attempts under `Codex demo` were verified and added to the live board, then Guest-636's completed ghost replay was watched through to the completion screen. The raw recording is `demo/viewer-gameplay.mp4` (69.63 seconds). A 78-second narrated draft is saved as `demo/beat-this-moment-draft.mp4`; duration, H.264 720p/30 FPS video, AAC audio, non-silent narration, and representative frames were checked. It still lacks actual host publication, chat interaction, and Codex build footage. The Computer Use tool explicitly blocked access to the Codex app. This remains a draft; it has not been uploaded or submitted.
