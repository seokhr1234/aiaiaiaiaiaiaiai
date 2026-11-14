"""Bind transit walking reference review while preserving original walking evidence."""
from pathlib import Path
import json,gzip,hashlib,subprocess,unicodedata
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'donghaeng-nav/dist';OLD='7fa090a9af1c3ba561f24e73271a40036e1b055f'
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_bytes())
previous=json.loads(git('show',OLD+':donghaeng-nav/dist/runtime-integrity.json'));lock=read(BASE/'runtime-integrity.json');assert previous['data']==lock['data']
for d in lock['data']:
 raw=(BASE/d['path']).read_bytes();assert sha(raw)==d['sha256'] and raw==git('show',OLD+':donghaeng-nav/dist/'+d['path']);assert gzip.decompress((BASE/(d['path']+'.gz')).read_bytes())==raw
changed=[]
for name,digest in lock['protected_code'].items():
 assert sha((BASE/name).read_bytes())==digest
 if previous['protected_code'].get(name)!=digest:changed.append(name)
assert set(changed)=={'app.js','transit-ui.js','transit-walk-review.js'},changed
path=ROOT/'donghaeng-nav/services/service-integrity.json';services=read(path);old_services=json.loads(git('show',OLD+':donghaeng-nav/services/service-integrity.json'))
assert services['review_assets']==old_services['review_assets'] and services['city_assets']==old_services['city_assets']
for name,digest in {**services['files'],**services['review_assets'],**services['city_assets']}.items():assert sha((ROOT/name).read_bytes())==digest,name
assert not git('diff','--name-only',OLD,'--','research').strip();assert (ROOT/'수정이력.md').read_bytes().startswith(git('show',OLD+':수정이력.md'))
build=read(ROOT/'donghaeng-nav/docs/final-build.json');assert build['expansion']['service_integrity_sha256']==sha(path.read_bytes());assert build['transit_main']['reference_markers_only'] is False and build['transit_main']['walking_reference_geometry'] and build['transit_main']['vehicle_geometry_verified'] is False and build['transit_main']['stop_mapping_verified'] is False and build['transit_main']['full_ui_optimization_deferred']
htmls=[ROOT/('동행길-'+n+'.html') for n in ['최종','시연','전달용']];package=ROOT/'이동약자-내비게이션-실행패키지';htmls += [p for p in package.glob('*.html') if unicodedata.normalize('NFC',p.name) in ['휴대폰용.html','컴퓨터용.html']];assert len(htmls)==5 and all(sha(p.read_bytes())==build['html_sha256'] for p in htmls)
names={unicodedata.normalize('NFC',p.name):p for p in package.iterdir()}
for line in (package/'SHA256SUMS.txt').read_text().splitlines():digest,name=line.split('  ',1);assert sha(names[unicodedata.normalize('NFC',name)].read_bytes())==digest
reports=['transit-walk-review-core-results','transit-walk-review-ui-results','transit-walk-review-bundle-ui-results','city-walk-api-results','transit-main-core-results','transit-main-ui-results','transit-main-bundle-ui-results','transit-edge-results','transit-vercel-results','main-navigation-results','expansion-core-results','expansion-ui-results','city-map-ui-results','vercel-api-results','city-walk-bundle-results']
for name in reports:assert read(ROOT/('donghaeng-nav/docs/'+name+'.json'))['pass'],name
r={'pass':True,'checkedDateKst':'2026-11-14','baseline':OLD,'originalDataFilesByteIdentical':9,'changedProtectedOrNewFiles':changed,'protectedFiles':len(lock['protected_code']),'serviceFiles':len(services['files']),'reviewAndCityAssetsByteIdentical':True,'researchAndPriorHistoryPreserved':True,'fiveHtmlSameBuild':True,'htmlSha256':build['html_sha256'],'reports':reports,'fullUiOptimizationDeferred':True,'accessibleTransitVerified':False,'timetableVerified':False,'actualProviderCallsThisChange':0,'stopMappingVerified':False,'fieldVerified':False}
(ROOT/'donghaeng-nav/docs/transit-walk-review-release-integrity.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False,indent=2))
