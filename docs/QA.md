# Verification

Last updated November 2, 2026. This records what was actually checked, and how. Mocked checks and live checks are kept apart on purpose.

## Automated

`npm test` runs 59 tests, and `npm run check` runs syntax checks on every source file. GitHub Actions runs both on Node.js 22 and 24 for every push. The tests cover:

- Deterministic courses, the course versions and upgrade path, and completable jump and dash routes.
- Exact restoration from mid-jump snapshots, replay equivalence, and rejection of malformed or incomplete runs.
- Ranking, duplicate submission prevention, and persistence across restarts.
- Host authorization, cross-origin rejection, per-address rate limits, and OAuth state and owner checks.
- Name filtering, host removal, and separate identities for guests who share a name.
- Twitch commands, chat cooldowns, the send budget, announcements, and token recovery. These use mocked Twitch HTTP and WebSocket responses.

Course difficulty was also measured with simulated players who make timing errors. Those figures guided the tuning, but they are not measurements of real people.

## Browser checks

Run in Chromium against a local server:

- A host's practice run crashes and offers a pre-crash snapshot, and publishing creates a saved challenge and share link.
- A separate browser session loads that challenge without host permissions.
- A viewer's run is replayed by the server and reaches the host's board live.
- A completed run outranks a crash, and its ghost replay plays with a live timer, distance, and dash bar.
- After a replay, the mode chip, ghost label, and chase ghost return to the current leader.
- At 390px wide there is no horizontal overflow, and starting a run or replay brings the game and touch controls into view.
- The OBS overlay shows the same results on a transparent background.
- Hosts can remove a player from the board, viewers have no remove control, and the live board updates for everyone.

## Live on Twitch

- **OAuth:** broadcaster consent completed through the real Twitch screen for `0xtigerclaw`, and Twitch accepted the EventSub chat subscription.
- **Chat commands on the cloud host:** `!challenge` and `!join` each replied in about 0.6 seconds. The `!join` link gave the expected Twitch identity, was rejected when reused, and added no run to the board. Both were sent from the broadcaster's account, so a message from another viewer has not been tested live.
- **Broadcast:** a public test stream through OBS played correctly in a separate signed-out Twitch viewer.
- **Not yet seen on real Twitch:** the bot's automatic posts for a new challenge and a new leader. These are covered by mocked tests only.

## Hosted deployment

The GCP deployment was checked from outside after each update: HTTPS health, denial of anonymous host actions, private file denial, the name filter, the `/play` redirect, and replay retrieval for older challenges. Challenge data and the Twitch connection survive a service restart. See [deploy/GCP.md](../deploy/GCP.md) for the layout.

Private configuration is root-owned with mode 0600. Challenge data and saved Twitch credentials are owned by an unprivileged user with mode 0600. The VM has no Google service account, public ports are 80 and 443, and SSH is restricted to Google's IAP range.

## Known limits

Server replay stops fabricated scores, but it does not stop bots, tool-assisted inputs, or name impersonation. Guest names are unverified, and `!join` links are visible to everyone in chat. The name filter is basic. Storage is one JSON file used by one Node process.
