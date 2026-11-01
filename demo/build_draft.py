"""Assemble an explicitly labelled draft from actual OBS captures and local TTS."""
from pathlib import Path
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
WORK = ROOT / "edit"
WORK.mkdir(exist_ok=True)
FONT = "/System/Library/Fonts/Supplemental/Verdana Bold.ttf"


def run(args):
    subprocess.run(args, check=True)


def duration(path):
    return float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)
    ]).decode().split('"duration": "')[1].split('"')[0])


segments = [
    dict(name="intro", seconds=6, title="BEAT THIS MOMENT", subtitle="Chat thinks it can do better.",
         voice="Chat thinks it can do better. Give them a shot."),
    dict(name="host", seconds=14, source="twitch-broadcast-test.mp4", start=3,
         voice="Beat This Moment lets a streamer publish a moment from before a crash. Viewers retry the same saved state in our browser game, Neon Freight."),
    dict(name="attempt", seconds=22, source="viewer-gameplay.mp4", start=0, crop=True,
         voice="Viewers open the challenge link and choose a name. This is a real attempt under Codex demo. It crashes, and the verified result joins the board. The server calculates the result by replaying the recorded inputs."),
    dict(name="replay", seconds=16, source="viewer-gameplay.mp4", start=30, crop=True,
         voice="The fastest completed run becomes a ghost to chase. Here we replay Guest six three six's winning run, completed in five point four two seconds."),
    dict(name="build", seconds=14, title="BUILT WITH CODEX", subtitle="Saved state. Verified inputs. Twitch chat.",
         voice="Codex helped build the game, deterministic replay, and Twitch integration. Chat commands connect through EventSub. We also verified a public broadcast playing in a separate Twitch viewer."),
    dict(name="close", seconds=6, title="ONE MOMENT. SAME START.", subtitle="A whole community trying to beat it.",
         voice="One moment. The same start. A whole community trying to beat it."),
]

manifest = []
for segment in segments:
    name = segment["name"]
    print(f"Rendering {name}", flush=True)
    text_path = WORK / f"{name}-voice.txt"
    text_path.write_text(segment["voice"])
    audio_path = WORK / f"{name}.aiff"
    run(["/usr/bin/say", "-v", "Samantha", "-r", "165", "-f", str(text_path), "-o", str(audio_path)])
    seconds = max(segment["seconds"], duration(audio_path) + 0.7)
    output = WORK / f"{name}.mp4"
    args = ["ffmpeg", "-y", "-v", "error"]
    if "source" in segment:
        args += ["-ss", str(segment["start"]), "-i", str(ROOT / segment["source"])]
        vf = "crop=1000:536:140:40,scale=1280:686,pad=1280:720:0:17:color=0xf2f0e8" if segment.get("crop") else "scale=1280:720"
        vf += ",setsar=1"
    else:
        card = Image.new("RGB", (1280, 720), "#f2f0e8")
        draw = ImageDraw.Draw(card)
        draw.rectangle((86, 208, 162, 217), fill="#ff5c35")
        draw.text((86, 263), segment["title"], font=ImageFont.truetype(FONT, 49), fill="#171d18")
        draw.text((88, 349), segment["subtitle"], font=ImageFont.truetype(FONT, 25), fill="#4b554d")
        draw.text((1170, 24), "DRAFT", font=ImageFont.truetype(FONT, 15), fill="#4b554d")
        title_image = WORK / f"{name}.png"
        card.save(title_image)
        args += ["-loop", "1", "-framerate", "30", "-i", str(title_image)]
        vf = "setsar=1"
    args += ["-i", str(audio_path), "-map", "0:v:0", "-map", "1:a:0", "-vf", vf,
             "-af", "apad,alimiter=limit=0.95", "-t", str(seconds), "-r", "30",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "160k", str(output)]
    run(args)
    manifest.append(dict(segment=name, seconds=seconds, source=segment.get("source"), start=segment.get("start")))

concat = WORK / "concat.txt"
concat.write_text("\n".join(f"file '{WORK / (s['name'] + '.mp4')}'" for s in segments))
run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(concat),
     "-c", "copy", "-movflags", "+faststart", str(ROOT / "beat-this-moment-draft.mp4")])
(ROOT / "edit-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Draft saved. Actual Codex build footage and host publication/chat footage still need insertion.", flush=True)
