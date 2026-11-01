# Beat This Moment

## Tagline

Chat thinks it can do better. Give it the same starting state and find out.

## Inspiration

The gap between watching a streamer and playing alongside their community is still large. We wanted a streamer to turn a failed attempt into a quick, shared challenge that viewers can open immediately in their browser.

## What it does

A streamer plays our browser game, Neon Freight, and publishes a saved moment from before a crash. Viewers follow the challenge link and retry the same game state. Their results appear on a shared leaderboard, and the best completed attempt becomes a ghost to race or replay.

Twitch chat connects the experience: `!challenge` returns the current playable link, while `!join` creates a temporary entry link attributed to the chatter. Guests can also play without a Twitch account.

## How we built it

Codex helped build a dependency-free Node.js server, a Canvas game, the interface, and the Twitch integration. A fixed-timestep engine runs in both the browser and server. Each attempt records its inputs; the server replays those inputs from the saved snapshot to calculate and verify the result.

The Twitch integration uses broadcaster OAuth, EventSub WebSockets, and the Send Chat Message API. Challenge history and attempts persist in a local JSON store. The prototype runs on a small GCP VM with persistent disk and HTTPS, with an OBS scene for streaming and a separate transparent leaderboard overlay.

## What we verified

- Eleven automated tests cover deterministic replay, snapshot restoration, ranking, host authorization, persistence, OAuth protections, and mocked chat behavior.
- Separate-browser testing verified publication, viewer entry, score submission, leaderboard updates, and replay.
- Real Twitch chat returned the expected `!challenge` reply.
- A short public broadcast to `0xtigerclaw` was played successfully in a separate signed-out Twitch viewer.

## Scope and current limitations

This prototype supports one purpose-built browser game. It does not derive playable game state from arbitrary Twitch video. Server replay checks scores but does not prevent tool-assisted inputs. Guest names are unverified; `!join` links are visible bearer links rather than viewer OAuth. The current public URL runs independently on GCP; its single-instance storage remains intended for a prototype.

## Next

Add independently authenticated viewer identities, durable cloud hosting, and integrations with games that can expose restorable state.

## Submission fields still to complete

- Public source repository URL.
- Finished demo video URL, under three minutes, including actual Codex build footage.
- Codex build session ID: `01a18ea7-7fb9-7881-8b09-b3e992e8e231`.
- Final review against the event's current rules before submitting.

This document is a prepared draft. No hackathon submission or video upload has been made.
