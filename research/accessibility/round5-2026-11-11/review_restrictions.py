from pathlib import Path
import gzip,json,collections
r=Path(__file__).resolve().parent
rels=json.loads(gzip.decompress((r/'derived/study-relations.json.gz').read_bytes()))['elements']
unresolved=json.loads(gzip.decompress((r/'derived/unresolved-relation-members.json.gz').read_bytes()))
ids={item['id'] for item in unresolved}
types=collections.Counter(item['tags'].get('type','unknown') for item in rels if item['id'] in ids)
restrictions=[item for item in rels if item['tags'].get('type')=='restriction']
fields=collections.Counter(k for item in restrictions for k in item['tags'] if k.startswith('restriction') or k=='except')
summary={'source_as_of':'2026-11-09T21:22:17Z','unresolved_relation_types':dict(types),'restriction_relations':len(restrictions),'restriction_tag_keys':dict(fields),'restrictions_with_unresolved_members':sum(item['id'] in ids for item in restrictions),'foot_specific_restrictions':sum(any(k in item['tags'] for k in ['restriction:foot','restriction:foot:conditional']) for item in restrictions),'routing_eligible':False,'active_runtime_replaced':False,'new_slope_values_promoted':0,'field_verified':False,'notice':'Statistics on retained relation tags only; absence of foot-specific tags does not prove unrestricted walking'}
(r/'restriction-review.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
