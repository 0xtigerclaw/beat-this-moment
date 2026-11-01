# Public demo — temporary tunnel

Game: https://proposal-openings-saving-innovations.trycloudflare.com

Twitch OAuth redirect URL:

```text
https://proposal-openings-saving-innovations.trycloudflare.com/auth/callback
```

Register the application as **Beat This Moment by 0xtigerclaw**, category **Game Integration**, client type **Confidential**. Confirm the callback is present exactly once and has no duplicated text before creating the application.

The Node server and game data live on your Mac. Cloudflare Tunnel forwards the public HTTPS address to `http://127.0.0.1:3000`. No independent cloud app server has been deployed. Keep the Mac, Node process and tunnel running. Restarting the tunnel changes its address and requires updating both `.env` and Twitch's redirect URL.

Host controls require the `HOST_KEY` in the ignored local `.env` file. Do not share it with viewers. The public leaderboard polls every two seconds because Cloudflare Quick Tunnels do not support SSE.

Verified from the public HTTPS address: public state and shared links, viewer entry, deterministic score verification, leaderboard updates, and denial of anonymous host access.

Twitch application registration and broadcaster OAuth are complete. The server is connected to `0xtigerclaw` through EventSub. The user tested `!challenge` in real chat and confirmed the expected bot reply with the current challenge link. A server restart discards the in-memory OAuth session, so reconnect through the app after restarting it.

OBS profile and scene collection `Beat This Moment` are configured for the dedicated Chrome game window. A short public broadcast to `0xtigerclaw` was verified in a separate Twitch viewer and then stopped. Its local 720p/30 FPS recording is `demo/twitch-broadcast-test.mp4`. This test recording has muted audio and is not the finished hackathon presentation. The existing stream key is saved in OBS, not in this repository.
