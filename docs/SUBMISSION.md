# Beat This Moment

## Tagline

Chat thinks it can do better. Give it the same starting state and find out.

## Inspiration

The gap between watching a streamer and playing alongside their community is still large. We wanted a streamer to turn a failed attempt into a quick, shared challenge that viewers can open immediately in their browser.

We also think small games deserve a bigger place on Twitch. AI is making games far easier to build, so more indie developers will rise, and we are already seeing more small games come out. Twitch should not be limited to big AAA titles. Integrating something like this would let smaller game developers build a community around small, quick games, which are always fun to play together.

## What it does

A streamer signs in with Twitch, plays our browser game, Neon Freight, and publishes a saved moment from before a crash. The bot posts the challenge in chat. Viewers follow the link and retry the same game state, and their results appear on a shared leaderboard and an OBS overlay. The best completed attempt becomes a ghost to race or replay, and the bot announces each new leader.

Twitch chat connects the experience: `!challenge` returns the current playable link, while `!join` creates a temporary entry link attributed to the chatter. Twitch tells the bot who typed the command, so that run carries their Twitch name on the board. Guests can also play without a Twitch account, and are labeled as guests. Streamers can remove anyone from the board, and guest names pass a basic filter before they can reach the stream.

## How we built it

Codex built the dependency-free Node.js server, the Canvas game, the interface, and the Twitch integration. A fixed-timestep engine runs in both the browser and server. Each attempt records its inputs, and the server replays those inputs from the saved snapshot to calculate and verify the result.

The Twitch integration uses Twitch OAuth for broadcaster sign-in, with the token and owner account validated against Twitch, plus EventSub WebSockets and the Send Chat Message API. The prototype runs on a small GCP VM with persistent disk and HTTPS, with an OBS scene for streaming and a separate transparent leaderboard overlay.

## What we verified

- 59 automated tests cover deterministic replay, snapshot restoration, ranking, host authorization, rate limits, persistence, OAuth protections, moderation, and mocked chat behavior.
- Separate-browser testing verified publication, viewer entry, score submission, leaderboard updates, and replay.
- `!challenge` and `!join` were tested in real Twitch chat against the hosted game.
- A public broadcast to `0xtigerclaw` was played successfully in a separate signed-out Twitch viewer.

## Scope and current limitations

This prototype supports one purpose-built browser game. It does not derive playable game state from arbitrary Twitch video. Server replay checks scores but does not prevent tool-assisted inputs. Guest names are unverified, and `!join` links are visible bearer links rather than viewer OAuth. Its single-instance storage is intended for a prototype.

## Next

Add independently authenticated viewer identities, durable cloud hosting, and integrations with games that can expose restorable state.

## Submission fields

- Repository: https://github.com/0xtigerclaw/beat-this-moment
- Live challenge: https://beat-the-moment-35-211-225-40.sslip.io/play
- Demo video: still to add. It must be public on YouTube, under three minutes, and show the project on Twitch and how it was built with Codex.
- Codex session ID: `01a18ea7-7fb9-7881-8b09-b3e992e8e231`.

This is a prepared draft. Nothing has been submitted or uploaded yet.
