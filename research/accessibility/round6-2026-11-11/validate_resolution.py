"""Independent closure and immutable-artifact checks; never promotes routing."""
from pathlib import Path
import gzip
import hashlib
import json

root=Path(__file__).resolve().parent
previous=root.parent/'round5-2026-11-11'
report=json.loads((root/'resolution-results.json').read_text())
packed=(root/'derived/resolved-members.json.gz').read_bytes()
assert hashlib.sha256(packed).hexdigest()==report['output_sha256']
raw=gzip.decompress(packed)
assert hashlib.sha256(raw).hexdigest()==report['uncompressed_sha256']
data=json.loads(raw)
assert data['routing_eligible'] is False and data['field_verified'] is False
available={'n':set(),'w':set(),'r':set()}
mapping={'node':'n','way':'w','relation':'r'}
for name in ['study-map.json.gz','study-context.json.gz','study-relations.json.gz']:
    with gzip.open(previous/'derived'/name,'rt') as stream:
        base=json.load(stream)
    for element in base['elements']:available[mapping[element['type']]].add(element['id'])
    if name=='study-relations.json.gz':original_relations=base['elements']
    del base
original_ids={r['id'] for r in original_relations}
added=set()
for element in data['elements']:
    kind=mapping[element['type']];identity=(kind,element['id'])
    assert identity not in added and element['id'] not in available[kind]
    added.add(identity)
for kind,ident in added:available[kind].add(ident)
relations=original_relations+[e for e in data['elements'] if e['type']=='relation']
remaining=[]
for relation in relations:
    missing=[m for m in relation['members'] if m['ref'] not in available[m['type']]]
    if missing:remaining.append({'id':relation['id'],'type':relation['tags'].get('type'),'tags':relation['tags'],'missing_members_count':len(missing),'original_relation':relation['id'] in original_ids})
missing_nodes=sum(any(n not in available['n'] for n in e['nodes']) for e in data['elements'] if e['type']=='way')
assert missing_nodes==report['remaining_way_node_groups']==0
assert len(remaining)==report['remaining_unresolved_relations_total']
assert sum(r['original_relation'] for r in remaining)==report['remaining_unresolved_original_relations']
assert {r['id'] for r in remaining}=={r['id'] for r in data['missing_relations']}
result={'pass':True,'source_sha256':report['source_sha256'],'previous_unresolved_original_relations':1634,
        'remaining_unresolved_original_relations':report['remaining_unresolved_original_relations'],
        'resolved_original_relations':1634-report['remaining_unresolved_original_relations'],
        'remaining_unresolved_restriction_relations':sum(r['type']=='restriction' for r in remaining),
        'missing_added_way_node_groups':missing_nodes,'added_objects':report['added'],'remaining':remaining,
        'field_verified':False,'active_runtime_replaced':False,'routing_eligible':False,'new_slope_values_promoted':0}
(root/'validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
