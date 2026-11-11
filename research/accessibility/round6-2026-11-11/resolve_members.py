"""Resolve external study members from the SAME verified country PBF.

Does not download or overwrite round5, clip geometry, infer missing members, or
promote the result into routing. Missing PBF objects remain explicit.
"""
from pathlib import Path
import collections
import gzip
import hashlib
import json
import time
import osmium

ROOT = Path(__file__).resolve().parent
PREVIOUS = ROOT.parent/'round5-2026-11-11'
OUT = ROOT/'derived'
SOURCE = PREVIOUS/'raw/osm-korea-261109-pbf/response.bin'
EXPECTED = '4e44c2315ea171b0c9041e9ea625865163fddaf9325d146884dd00ba9a17484d'


def sha_file(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        while chunk:=stream.read(1024*1024):
            digest.update(chunk)
    return digest.hexdigest()


def compressed_json(path):
    with gzip.open(path,'rt') as stream:
        return json.load(stream)


def resolve(source, base_nodes, base_ways, original_relations, max_objects=2000000):
    """Pure orchestration apart from deterministic, local PBF reads."""
    found={'n':{},'w':{},'r':{}}
    relations={r['id']:r for r in original_relations}
    attempted_relations=set()
    scans=[]
    class Handler(osmium.SimpleHandler):
        def __init__(self,kind,wanted):
            super().__init__();self.kind=kind;self.wanted=wanted
        def node(self,n):
            if self.kind!='n' or n.id not in self.wanted or not n.location.valid():return
            found['n'][n.id]={'type':'node','id':n.id,'lat':n.location.lat,'lon':n.location.lon,'version':n.version,'timestamp':str(n.timestamp),'tags':dict(n.tags)}
        def way(self,w):
            if self.kind!='w' or w.id not in self.wanted:return
            found['w'][w.id]={'type':'way','id':w.id,'nodes':[n.ref for n in w.nodes],'version':w.version,'timestamp':str(w.timestamp),'tags':dict(w.tags)}
        def relation(self,r):
            if self.kind!='r' or r.id not in self.wanted:return
            item={'type':'relation','id':r.id,'version':r.version,'timestamp':str(r.timestamp),'tags':dict(r.tags),'members':[{'type':m.type,'ref':m.ref,'role':m.role} for m in r.members]}
            found['r'][r.id]=item;relations[r.id]=item
    def scan(kind,wanted):
        if len(wanted)>max_objects:raise ValueError('Explicit object budget exceeded; do not publish a partial success')
        bits={'n':osmium.osm.NODE,'w':osmium.osm.WAY,'r':osmium.osm.RELATION}[kind]
        started=time.monotonic()
        with osmium.io.Reader(source,bits) as reader:osmium.apply(reader,Handler(kind,wanted))
        scans.append({'type':kind,'requested':len(wanted),'found':len(set(found[kind])&wanted),'seconds':round(time.monotonic()-started,3)})
    for _ in range(16):
        wanted={m['ref'] for r in relations.values() for m in r['members'] if m['type']=='r' and m['ref'] not in relations and m['ref'] not in attempted_relations}
        if not wanted:break
        attempted_relations.update(wanted);scan('r',wanted)
    else:raise ValueError('Nested relation depth budget exceeded')
    wanted_ways={m['ref'] for r in relations.values() for m in r['members'] if m['type']=='w' and m['ref'] not in base_ways}
    scan('w',wanted_ways)
    wanted_nodes={m['ref'] for r in relations.values() for m in r['members'] if m['type']=='n' and m['ref'] not in base_nodes}
    wanted_nodes.update(n for w in found['w'].values() for n in w['nodes'] if n not in base_nodes)
    scan('n',wanted_nodes)
    available={'n':base_nodes|set(found['n']),'w':base_ways|set(found['w']),'r':set(relations)}
    missing=[]
    for r in relations.values():
        absent=[m for m in r['members'] if m['ref'] not in available[m['type']]]
        if absent:missing.append({'id':r['id'],'type':r['tags'].get('type'),'missing_members':absent,'original_relation':r['id'] not in found['r']})
    missing_way_nodes=[{'way_id':w['id'],'nodes':[n for n in w['nodes'] if n not in available['n']]} for w in found['w'].values() if any(n not in available['n'] for n in w['nodes'])]
    return {'elements':[v for kind in ['n','w','r'] for _,v in sorted(found[kind].items())],
            'missing_relations':missing,'missing_way_nodes':missing_way_nodes,'scans':scans,
            'added':{kind:len(items) for kind,items in found.items()},'relation_total':len(relations)}


def main():
    assert sha_file(SOURCE)==EXPECTED,'Source PBF changed'
    OUT.mkdir(parents=True,exist_ok=False)
    base_nodes,base_ways=set(),set()
    for name in ['study-map.json.gz','study-context.json.gz']:
        data=compressed_json(PREVIOUS/'derived'/name)
        for item in data['elements']:
            if item['type']=='node':base_nodes.add(item['id'])
            elif item['type']=='way':base_ways.add(item['id'])
        del data
    original=compressed_json(PREVIOUS/'derived/study-relations.json.gz')['elements']
    started=time.monotonic();result=resolve(osmium.io.File(str(SOURCE),'pbf'),base_nodes,base_ways,original)
    details={'elements':result.pop('elements'),'missing_relations':result.pop('missing_relations'),'missing_way_nodes':result.pop('missing_way_nodes'),
             'field_verified':False,'routing_eligible':False}
    raw=json.dumps(details,ensure_ascii=False,separators=(',',':')).encode();packed=gzip.compress(raw,compresslevel=6,mtime=0);(OUT/'resolved-members.json.gz').write_bytes(packed)
    report={**result,'source_sha256':EXPECTED,'source_as_of':'2026-11-09T21:22:17Z','reviewed_date_kst':'2026-11-11',
            'previous_unresolved_original_relations':1634,
            'remaining_unresolved_original_relations':sum(r['original_relation'] for r in details['missing_relations']),
            'remaining_unresolved_relations_total':len(details['missing_relations']),
            'remaining_unresolved_types':dict(collections.Counter(r['type'] for r in details['missing_relations'])),
            'remaining_way_node_groups':len(details['missing_way_nodes']),
            'output_sha256':hashlib.sha256(packed).hexdigest(),'uncompressed_sha256':hashlib.sha256(raw).hexdigest(),
            'output_bytes':len(packed),'elapsed_seconds':round(time.monotonic()-started,2),
            'field_verified':False,'routing_eligible':False,'active_runtime_replaced':False,'new_slope_values_promoted':0,
            'notice':'Missing members absent from this country PBF are not inferred; resolved membership is not pedestrian connectivity or permission'}
    (ROOT/'resolution-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
