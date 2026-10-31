"""Read-only acquisition helper. Preserves inherited proxy/TLS configuration.

python acquire.py sample
python acquire.py inspect-html
python acquire.py inspect-table /absolute/path/to/manually-downloaded.xlsx

Downloads use documented public sample or exact official page URLs only.
No login, guessed attachment endpoints, or API-key creation.
"""
import argparse
import csv
import hashlib
import json
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen

DEST = Path('/workspace/research-downloads/sidewalk')
PAGES = {x: f'https://data.seoul.go.kr/dataList/{x}/{kind}/1/datasetView.do'
         for x, kind in [('OA-22240','F'),('OA-23081','F'),('OA-22906','S'),('OA-21208','A')]}
SAMPLE = 'http://openapi.seoul.go.kr:8088/sample/json/TbTraficWlkNet/1/5/'

def fetch(url, name):
    DEST.mkdir(parents=True, exist_ok=True)
    record = {'url': url, 'retrieved_at': datetime.now(timezone.utc).isoformat()}
    try:
        with urlopen(url, timeout=30) as response:
            data = response.read(30 * 1024 * 1024 + 1)
            if len(data) > 30 * 1024 * 1024:
                raise ValueError('Response exceeds 30 MiB bound')
            record.update(status=response.status, final_url=response.url,
                          content_type=response.headers.get('Content-Type'))
        target = DEST / name
        target.write_bytes(data)
        record.update(path=str(target), bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
    except Exception as exc:
        record['error'] = str(exc)
        data = None
    with (DEST / 'attempts.jsonl').open('a') as out:
        out.write(json.dumps(record, ensure_ascii=False) + '\n')
    print(json.dumps(record, ensure_ascii=False))
    return data

class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if any(word in str(attrs).lower() for word in ('down','file','xlsx','csv','script')):
            print(json.dumps({'tag': tag, 'attrs': attrs}, ensure_ascii=False))

def inspect_table(path):
    """Only schema and bounded preview; does not assume CRS or measure access."""
    if path.suffix.lower() == '.xlsx':
        from openpyxl import load_workbook
        book = load_workbook(path, read_only=True, data_only=True)
        result = {s.title: {'max_row': s.max_row, 'max_column': s.max_column,
                  'first_rows': list(s.iter_rows(min_row=1, max_row=12, values_only=True))}
                  for s in book}
        book.close()
    elif path.suffix.lower() == '.csv':
        text = path.read_text(encoding='utf-8-sig')
        rows = list(csv.reader(text.splitlines()))
        result = {'rows': len(rows), 'first_rows': rows[:12]}
    else:
        raise ValueError('Only CSV/XLSX supported')
    print(json.dumps(result, ensure_ascii=False, default=str, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['sample','inspect-html','inspect-table'])
    parser.add_argument('path', nargs='?')
    args = parser.parse_args()
    if args.mode == 'sample':
        data = fetch(SAMPLE, 'TbTraficWlkNet-sample.json')
        if data:
            body = json.loads(data)
            service = body.get('TbTraficWlkNet', {})
            print(json.dumps({'result': service.get('RESULT', body.get('RESULT')), 'rows': len(service.get('row', []))}, ensure_ascii=False))
    elif args.mode == 'inspect-html':
        for identifier, url in PAGES.items():
            data = fetch(url, identifier + '.html')
            if data:
                Links().feed(data.decode('utf-8', errors='replace'))
    else:
        if not args.path:
            parser.error('inspect-table requires a local path')
        inspect_table(Path(args.path))
