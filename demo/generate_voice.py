"""Generates each narration section of DEMO-SCRIPT.md with the HeyGen CLI.

Run from the project root after `heygen auth login`. Audio stays in demo/voice, which git ignores.
"""
import json
import pathlib
import re
import subprocess
import time
import urllib.request

VOICE_ID = 'b52684a460834d0fbc66531609b34237'
HEYGEN = pathlib.Path.home() / '.local/bin/heygen'
OUT = pathlib.Path('demo/voice')

body = pathlib.Path('demo/DEMO-SCRIPT.md').read_text().split('## Script')[1].split('## Stay accurate')[0]
manifest = []
for index, section in enumerate(re.split(r'\n### ', body)[1:], 1):
    heading = section.split('\n')[0]
    lines = [re.sub(r'\*\*\[if seen\]\*\* ', '', l[2:]) for l in section.split('\n') if l.startswith('> ')]
    text = ' '.join(lines)
    for attempt in range(4):
        result = subprocess.run(
            [HEYGEN, 'model', 'audio', 'tts', 'create', '--model', 'heygen-voice-1-turbo-free',
             '--voice-id', VOICE_ID, '--text', text, '--language', 'en', '--with-timestamps'],
            capture_output=True, text=True,
        )
        if result.returncode == 0:
            break
        print(f'attempt {attempt + 1} failed: {result.stderr[:400]}')
        time.sleep(5 * (attempt + 1))
    else:
        raise SystemExit('HeyGen kept failing.')
    data = json.loads(result.stdout)['data']
    target = OUT / f'section-{index}.wav'
    urllib.request.urlretrieve(data['audio_url'], target)
    manifest.append({'section': index, 'heading': heading, 'text': text, 'file': str(target), 'seconds': data['duration'], 'words': data.get('original_words') or []})
    print(f'{heading:42} {len(text.split()):3} words {data["duration"]:5.1f}s')
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2))
print('total', round(sum(m['seconds'] for m in manifest), 1))
