"""Reuse the immutable round5 collector, writing only this new research round."""
from pathlib import Path
import concurrent.futures
import importlib.util
import json
import sys

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('prior_collector', root.parent/'round5-2026-11-11/collect.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
collector.ROOT = root
plan_path = Path(sys.argv[1]) if len(sys.argv) > 1 else root/'plan-tag-docs.json'
plan = json.loads(plan_path.read_text())
summary_path = root/(plan_path.stem.removeprefix('plan-')+'-results.json')
assert not summary_path.exists(), 'Preserve previous collection summary'
assert len({item['id'] for item in plan}) == len(plan)
assert all(not (root/'raw'/item['id']).exists() for item in plan), 'Preserve previous attempts'
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    records = list(pool.map(collector.collect, plan))
summary = {'requested_date_kst': '2026-11-11', 'scope': 'Public documentation/catalog requests; HTTP 200 alone does not establish new GIS acquisition',
           'requests': [{k: r.get(k) for k in ['id', 'url', 'http_status', 'transport_result', 'bytes', 'sha256', 'error_type']} for r in records],
           'field_verified': False, 'new_slope_values_promoted': 0}
summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n')
