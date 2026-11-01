# Demo files

The narrated draft is included in this repository. Raw OBS recordings, contact sheets, and intermediate edit assets are local-only files excluded by `.gitignore`. The entries below describe the local production workspace; those raw files are not required to run the app.

- `beat-this-moment-draft.mp4`: 78-second narrated draft, H.264 1280×720 at 30 FPS with AAC audio. Narration is generated locally using the macOS Samantha voice.
- `twitch-broadcast-test.mp4`: the local recording made during the verified public Twitch test, 98.97 seconds.
- `viewer-gameplay.mp4`: 69.63 seconds of actual viewer attempts, board updates, and Guest-636's completed ghost replay, captured through an OBS Browser source.
- `capture-test.mp4`: the initial 10.53-second local window-capture check.
- `DEMO-SCRIPT.md`: the fuller presentation outline.
- `edit-manifest.json`: source files, offsets, and segment durations for the draft.

Rebuild the draft with `uv run --with pillow python demo/build_draft.py` from the project root. This requires macOS text-to-speech and FFmpeg. Intermediate narration and title cards are in `edit/`.

## Still needed before submission

The draft explains the workflow but does **not** show the host actually publishing a moment, the real chat interaction, or actual Codex build-chat footage. Capture and insert those segments, keeping the final video under three minutes. The Computer Use tool explicitly refused access to the Codex app, so its footage needs a manual recording. Chrome's native input remained unreliable during this session; the earlier real `!challenge` command/reply was verified, but a new send during this recording session was not confirmed.

No video has been uploaded and no hackathon entry has been submitted. OBS streaming and recording are both stopped. Its existing stream key is configured in the separate `Beat This Moment` profile; it is not stored in this project.

## OBS scenes

- `Scene`: dedicated Chrome game-window capture, cropped to hide its toolbar, with capture audio muted.
- `Viewer gameplay`: a clean OBS Browser source for the existing public challenge. Use the source's **Interact** button to play. This source has no host authorization and is intended for viewer gameplay.

The source recordings have muted/no narration audio. The assembled draft replaces that with synthetic narration. The game server and public tunnel must stay running for viewers to use the live link.
