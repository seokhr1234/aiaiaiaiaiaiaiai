"""Sync only the usage guide into existing standalone HTML variants.

The complete build remains build-html.py. This UI-only sync preserves each
variant's scripts and embedded datasets when original GIS build inputs are absent.
"""
from pathlib import Path
import hashlib
import json
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'donghaeng-nav/dist'


def section(text, pattern):
    match = re.search(pattern, text, re.S)
    if not match:
        raise ValueError('Missing usage guide section: ' + pattern)
    return match.group()


def main():
    markup = section((SOURCE / 'index.html').read_text(), r'<dialog id="usage-guide".*?</dialog>')
    css = section((SOURCE / 'style.css').read_text(), r'/\* usage-guide:start \*/.*?/\* usage-guide:end \*/')
    js = section((SOURCE / 'app.js').read_text(), r'// usage-guide:start\n.*?// usage-guide:end')
    # Includes the three canonical builds, the two GPS variants, and the portable pair.
    paths = sorted(ROOT.glob('*.html')) + sorted(ROOT.glob('이동약자-내비게이션-실행패키지/*.html'))
    updates = {}
    for path in paths:
        text = path.read_text()
        if 'id="info-dialog"' not in text or "$('#about').onclick=" not in text:
            continue
        if 'id="usage-guide"' in text:
            text = re.sub(r'<dialog id="usage-guide".*?</dialog>', lambda _: markup, text, count=1, flags=re.S)
        else:
            text = re.sub(r'<dialog id="info-dialog".*?</dialog>', lambda m: m.group() + '\n' + markup, text, count=1, flags=re.S)
        if '/* usage-guide:start */' in text:
            text = re.sub(r'/\* usage-guide:start \*/.*?/\* usage-guide:end \*/', lambda _: css, text, count=1, flags=re.S)
        else:
            text = text.replace('</head>', '<style>\n' + css + '\n</style></head>', 1)
        if '// usage-guide:start' in text:
            text = re.sub(r'// usage-guide:start\n.*?// usage-guide:end', lambda _: js, text, count=1, flags=re.S)
        else:
            text, count = re.subn(r"\$\('#about'\)\.onclick=[^\n]+", lambda _: js, text, count=1)
            if count != 1:
                raise ValueError('Missing original usage guide handler: ' + str(path))
        updates[path] = text
    # Validate every target before writing; never touch research or rebuild map data.
    for path, text in updates.items():
        if path.read_text() != text:
            path.write_text(text, encoding='utf-8', newline='\n')
        print(path.relative_to(ROOT))
    final = ROOT / '동행길-최종.html'
    digest = hashlib.sha256(final.read_bytes()).hexdigest()
    for relative in ['donghaeng-nav/docs/final-build.json', '전달-검증.json']:
        path = ROOT / relative
        original = path.read_bytes().decode('utf-8')
        data = json.loads(original)
        updated = re.sub(r'"html_sha256": "[a-f0-9]+"', '"html_sha256": "' + digest + '"', original, count=1)
        if 'html_bytes' in data:
            updated = re.sub(r'"html_bytes": \d+', '"html_bytes": ' + str(final.stat().st_size), updated, count=1)
        record = {
            'date': '2026-11-04',
            'scope': 'Usage guide only; runtime data and navigation code preserved',
            'verification': 'donghaeng-nav/docs/usage-guide-review.md',
        }
        entry = '"usage_guide_update": ' + json.dumps(record, ensure_ascii=False, indent=2).replace('\n', '\n  ')
        if 'usage_guide_update' in data:
            updated = re.sub(r'"usage_guide_update": \{[^}]*\}', lambda _: entry, updated, count=1)
        else:
            end = updated.rfind('}')
            updated = updated[:end].rstrip() + ',\n  ' + entry + '\n}' + updated[end + 1:]
        path.write_bytes(updated.encode('utf-8'))
    # Package hashes describe the files on disk; previous test JSON remains historical.
    for sums in ROOT.glob('*/SHA256SUMS.txt'):
        if not any(p.parent == sums.parent for p in updates):
            continue
        names = {unicodedata.normalize('NFC', p.name): p for p in sums.parent.iterdir()}
        lines = []
        for line in sums.read_text().splitlines():
            _, name = line.split('  ', 1)
            path = names[unicodedata.normalize('NFC', name)]
            lines.append(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + name)
        sums.write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
