from pathlib import Path
import runpy,tempfile,json,hashlib,copy
ROOT=Path(__file__).resolve().parent.parent
attach=runpy.run_path(str(ROOT/'scripts/terrain-review-policy.py'))['attach_review']
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
with tempfile.TemporaryDirectory() as directory:
 r=Path(directory);(r/'dist').mkdir();(r/'dist/map-data.json').write_text('{}');(r/'dist/map-context.json').write_text('{}');(r/'data/terrain/review').mkdir(parents=True);source=r/'source';source.write_text('verified input')
 review={'version':1,'summary':{'new_sources_promoted':0},'policy':{'version':'test'},'inputs':{'map_data_sha256':sha(r/'dist/map-data.json'),'map_context_sha256':sha(r/'dist/map-context.json'),'files':{'source':sha(source)}},'edges':{'1-2':{'status':'source_disagreement'}}};p=r/'data/terrain/review/edge-quality.json';p.write_text(json.dumps(review));baseline={'meta':{},'edges':{'1-2':2.7}}
 result=attach(r,copy.deepcopy(baseline));assert result['edges']==baseline['edges'];assert result['review']['state']=='current'
 source.write_text('changed input')
 try:attach(r,copy.deepcopy(baseline));raise AssertionError('stale input accepted')
 except ValueError:pass
 source.write_text('verified input');review['summary']['new_sources_promoted']=1;p.write_text(json.dumps(review))
 try:attach(r,copy.deepcopy(baseline));raise AssertionError('unvalidated source promoted')
 except ValueError:pass
 p.unlink();(r/'data/terrain/research').mkdir()
 try:attach(r,copy.deepcopy(baseline));raise AssertionError('missing known audit accepted')
 except ValueError:pass
print('PASS: audit attaches without rewriting original slopes; stale inputs, unvalidated promotion and missing known audit are rejected.')
