# Demo files

The narrated draft, `beat-this-moment-draft.mp4`, is 78 seconds of H.264 1280×720 video at 30 FPS with AAC audio. Its narration uses the macOS Samantha voice. Raw OBS recordings and intermediate edit assets stay local and are excluded by `.gitignore`. None of them are needed to run the app.

- `DEMO-SCRIPT.md`: the fuller presentation outline.
- `build_draft.py`: rebuilds the draft from those local recordings. Run `uv run --with pillow python demo/build_draft.py` from the project root. It needs macOS text-to-speech and FFmpeg.

## Final videos

`build_video.mjs` builds five themed versions into `demo/final`, with captions from the narration timing. `generate_voice.py` makes the narration with HeyGen, and `record_live.mjs` records the signed-out Twitch and viewer shots. Footage and voice files stay local. None of these are needed to run the app.

## OBS scenes

- `Scene`: dedicated Chrome game-window capture, cropped to hide its toolbar, with capture audio muted.
- `Viewer gameplay`: a clean OBS Browser source for the public challenge. Use the source's **Interact** button to play. This source has no host authorization.

The stream key is configured in a separate OBS profile and is not stored in this project.
