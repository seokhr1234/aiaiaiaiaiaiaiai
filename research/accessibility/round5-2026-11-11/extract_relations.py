"""Preserve relations touching the study ways; report unresolved external refs."""
from pathlib import Path
import gzip
import hashlib
import json
import osmium

root = Path(__file__).resolve().parent
target = root/'derived/study-relations.json.gz'
assert not target.exists(), 'Preserve the previous relation extraction'
ways = set()
nodes = set()
for name in ['study-map.json.gz','study-context.json.gz']:
    with gzip.open(root/'derived'/name, 'rt') as stream:
        data = json.load(stream)
    for item in data['elements']:
        if item['type'] == 'way':
            ways.add(item['id'])
        elif item['type'] == 'node':
            nodes.add(item['id'])
    del data
relations = []


class Extract(osmium.SimpleHandler):
    def relation(self, r):
        members = [{'type':m.type,'ref':m.ref,'role':m.role} for m in r.members]
        if any(m['type'] == 'w' and m['ref'] in ways for m in members):
            relations.append({'type':'relation','id':r.id,'version':r.version,
                              'timestamp':str(r.timestamp),'tags':dict(r.tags),'members':members})


source = osmium.io.File(str(root/'raw/osm-korea-261109-pbf/response.bin'), 'pbf')
with osmium.io.Reader(source, osmium.osm.RELATION) as reader:
    osmium.apply(reader, Extract())
ids = {r['id'] for r in relations}
unresolved = []
for r in relations:
    missing = [m for m in r['members'] if m['type'] == 'w' and m['ref'] not in ways
               or m['type'] == 'n' and m['ref'] not in nodes
               or m['type'] == 'r' and m['ref'] not in ids]
    if missing:
        unresolved.append({'id':r['id'],'missing_members':missing})
raw = json.dumps({'elements':relations,'routing_eligible':False,'field_verified':False},ensure_ascii=False,separators=(',',':')).encode()
packed = gzip.compress(raw,compresslevel=6,mtime=0)
target.write_bytes(packed)
report = {'source_as_of':'2026-11-09T21:22:17Z','relations':len(relations),
          'restriction_relations':sum(r['tags'].get('type')=='restriction' for r in relations),
          'relations_with_unresolved_members':len(unresolved),'unresolved':unresolved,
          'output_sha256':hashlib.sha256(packed).hexdigest(), 'uncompressed_sha256':hashlib.sha256(raw).hexdigest(),
          'bytes':len(packed),'routing_eligible':False,'active_runtime_replaced':False,'field_verified':False,
          'notice':'Only relations touching retained study ways; unresolved external members and routing restriction interpretation remain pending'}
detail=gzip.compress(json.dumps(report.pop('unresolved'),ensure_ascii=False,separators=(',',':')).encode(),mtime=0)
(root/'derived/unresolved-relation-members.json.gz').write_bytes(detail)
report['unresolved_detail']={'path':'derived/unresolved-relation-members.json.gz','sha256':hashlib.sha256(detail).hexdigest(),'bytes':len(detail)}
(root/'osm-relations-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='unresolved'},ensure_ascii=False,indent=2))
