"""Attach a reproducible, hash-bound comparison audit without replacing original terrain values.
Only the GIS review command needs external packages. The normal HTML build stays stdlib-only.
"""
from pathlib import Path
import hashlib,json

def attach_review(root,result):
 root=Path(root);path=root/'data/terrain/review/edge-quality.json'
 if not path.exists():
  if (root/'data/terrain/research').exists():raise ValueError('조사 자료에 대한 검증 산출물이 없습니다. review-terrain.py를 먼저 실행하세요.')
  result['meta']['review_state']='not_available';return result
 review=json.loads(path.read_text())
 if review.get('version')!=1:raise ValueError('Unsupported terrain review version')
 inputs=review['inputs'];required={'dist/map-data.json':inputs['map_data_sha256'],'dist/map-context.json':inputs['map_context_sha256'],**inputs['files']}
 if inputs.get('review_script_sha256'):required['scripts/review-terrain.py']=inputs['review_script_sha256']
 for relative,expected in required.items():
  p=root/relative
  if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:raise ValueError('지형 검증 입력이 바뀌었습니다: '+relative+' · review-terrain.py를 GIS 환경에서 다시 실행하세요.')
 allowed={'legacy_hint','source_disagreement','terrain_inapplicable','unconfirmed'}
 if any(v.get('status') not in allowed for v in review['edges'].values()):raise ValueError('Invalid review decision')
 if review['summary'].get('new_sources_promoted')!=0:raise ValueError('New sources require independent road-surface validation before promotion')
 review['state']='current';result['review']=review;result['meta']['review_state']='current';result['meta']['review_policy']=review['policy']['version'];result['meta']['new_sources_promoted']=0
 return result
