#!/usr/bin/env python3
"""Preserve public HTTP response bytes and provenance; never overwrite an attempt.

Usage: python collect.py plan.json
The plan is a list of {id,url[,method,form,body,headers,timeout]}. No credentials.
Inherited proxy and TLS verification are retained. HTTP 200 alone is not evidence
of a valid dataset: response validation is performed separately.
"""
import concurrent.futures
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
KST = dt.timezone(dt.timedelta(hours=9))


def collect(item):
    folder = ROOT / 'raw' / item['id']
    folder.mkdir(parents=True, exist_ok=False)
    record = dict(item)
    record['requested_at_utc'] = dt.datetime.now(dt.timezone.utc).isoformat()
    record['requested_at_kst'] = dt.datetime.now(KST).isoformat()
    record['field_verified'] = False
    record['source_as_of'] = None
    record['source_crs'] = None
    record['vertical_datum'] = None
    headers = {'User-Agent': 'DonghaengAccessibilityResearch/1.0', **item.get('headers', {})}
    body = item.get('body', '').encode() if 'body' in item else None
    if 'form' in item:
        body = urllib.parse.urlencode(item['form']).encode()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    req = urllib.request.Request(item['url'], data=body, headers=headers,
                                 method=item.get('method', 'POST' if body else 'GET'))
    try:
        try:
            response = urllib.request.urlopen(req, timeout=item.get('timeout', 45))
        except urllib.error.HTTPError as error:
            response = error
        with response:
            record['http_status'] = response.code
            record['final_url'] = response.url
            record['response_headers'] = {k: v for k, v in response.headers.items()
                if k.lower() in ('content-type', 'content-length', 'content-disposition',
                                 'last-modified', 'etag', 'date', 'server', 'location')}
            data = response.read()
        (folder / 'response.bin').write_bytes(data)
        record.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                      response_path=str((folder / 'response.bin').relative_to(ROOT)),
                      transport_result='http_response')
    except Exception as error:
        record.setdefault('http_status', None)
        record.update(transport_result='request_failed', error_type=type(error).__name__, error=str(error))
        # Keep partial bodies for future attempts, explicitly separate from
        # complete responses. Earlier attempts made before this enhancement
        # have only the recorded IncompleteRead error, not recovered bytes.
        partial = getattr(error, 'partial', None)
        if partial:
            (folder / 'partial.bin').write_bytes(partial)
            record.update(partial_path=str((folder / 'partial.bin').relative_to(ROOT)),
                          partial_bytes=len(partial), partial_sha256=hashlib.sha256(partial).hexdigest())
    record['completed_at_utc'] = dt.datetime.now(dt.timezone.utc).isoformat()
    (folder / 'request.json').write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({k: record.get(k) for k in ('id', 'http_status', 'bytes', 'error')}, ensure_ascii=False), flush=True)
    return record


if __name__ == '__main__':
    plan = json.loads(Path(sys.argv[1]).read_text())
    assert len({item['id'] for item in plan}) == len(plan)
    assert all(not (ROOT / 'raw' / item['id']).exists() for item in plan), 'Preserve previous attempts'
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(collect, plan))
