# Hosted demo

Game: **https://beat-the-moment-35-211-225-40.sslip.io**

Twitch OAuth callback: `https://beat-the-moment-35-211-225-40.sslip.io/auth/callback`

The app runs independently of the Mac on GCP project `beat-the-moment-964ea6`. The original six attempts were migrated, and a real cloud guest attempt was added and verified. The public board, completed ghost replay, HTTPS health check, anonymous host denial, and secret-file denial were checked. The seven attempts survived a service restart.

Twitch is connected to `0xtigerclaw` on the cloud host, with EventSub subscription accepted and no connection error. The old Mac-hosted Twitch bridge was disconnected to prevent duplicate replies. The earlier real `!challenge` reply was verified on the local prototype; a new cloud chat reply has not yet been independently confirmed.

See [deploy/GCP.md](deploy/GCP.md) for service administration, persistence, budget alerts, and teardown. The earlier Cloudflare URL is historical demo access and should no longer be shared.
