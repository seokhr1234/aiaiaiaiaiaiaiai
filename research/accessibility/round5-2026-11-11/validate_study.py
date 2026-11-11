"""Verify hashes and complete way-node references in the unpromoted study set."""
from pathlib import Path
import gzip
import hashlib
import json
import math

root=Path(__file__).resolve().parent
summary=json.loads((root/'osm-extract-results.json').read_text())
checks=[]
for name, expected in summary['outputs'].items():
    path=root/'derived'/name
    assert hashlib.sha256(path.read_bytes()).hexdigest()==expected['sha256'],name
    digest=hashlib.sha256()
    with gzip.open(path,'rb') as stream:
        while chunk:=stream.read(1024*1024):
            digest.update(chunk)
    assert digest.hexdigest()==expected['uncompressed_sha256'],name
    with gzip.open(path,'rt') as stream:
        data=json.load(stream)
    assert len(data['elements'])==expected['elements'],name
    assert data['study']['routing_eligible'] is False
    assert data['study']['field_verified'] is False
    node_ids=set()
    ways=[]
    identities=set()
    for item in data['elements']:
        identity=(item['type'],item['id'])
        assert identity not in identities
        identities.add(identity)
        if item['type']=='node':
            assert math.isfinite(item['lat']) and math.isfinite(item['lon'])
            assert -90<=item['lat']<=90 and -180<=item['lon']<=180
            node_ids.add(item['id'])
        elif item['type']=='way':
            ways.append(item)
    missing=sum(any(n not in node_ids for n in w['nodes']) for w in ways)
    assert missing==0,name
    checks.append({'file':name,'nodes':len(node_ids),'ways':len(ways),'missing_way_node_references':missing})
    del data,identities,node_ids,ways
relations=json.loads((root/'osm-relations-results.json').read_text())
packed=root/'derived/study-relations.json.gz'
assert hashlib.sha256(packed.read_bytes()).hexdigest()==relations['output_sha256']
assert hashlib.sha256(gzip.decompress(packed.read_bytes())).hexdigest()==relations['uncompressed_sha256']
result={'pass':True,'checks':checks,'source_as_of':summary['source_as_of'],
        'relations':relations['relations'],'relations_with_unresolved_members':relations['relations_with_unresolved_members'],
        'routing_eligible':False,'active_runtime_replaced':False,'new_slope_values_promoted':0,'field_verified':False,
        'remaining':'Resolve external relation members, interpret restrictions, review connectivity/precision/terrain binding before active graph promotion'}
(root/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
