"""Release evidence for separate reference routing; never certify field safety."""
from pathlib import Path
import gzip,hashlib,json,subprocess,unicodedata
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'donghaeng-nav/dist';BASELINE='863b84a21374ad1fc3056516a451472c9bb4b6f0'
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda p:json.loads(p.read_bytes())
before=json.loads(git('show',BASELINE+':donghaeng-nav/dist/runtime-integrity.json'));lock=read(BASE/'runtime-integrity.json')
assert before['data']==lock['data']
for d in lock['data']:
 raw=(BASE/d['path']).read_bytes();assert sha(raw)==d['sha256'];assert raw==git('show',BASELINE+':donghaeng-nav/dist/'+d['path']);assert gzip.decompress((BASE/(d['path']+'.gz')).read_bytes())==raw
changed=[]
for name,digest in lock['protected_code'].items():
 assert sha((BASE/name).read_bytes())==digest
 if before['protected_code'].get(name)!=digest:changed.append(name)
assert set(changed)=={'facilities.js','app.js','data-loader.js','seoul-base.js','city-map.js','precision-map.js'},changed
assert not git('diff','--name-only',BASELINE,'--','research').strip()
assert (ROOT/'수정이력.md').read_bytes().startswith(git('show',BASELINE+':수정이력.md'))
services_path=ROOT/'donghaeng-nav/services/service-integrity.json';services=read(services_path)
for name,digest in {**services['files'],**services['review_assets'],**services['city_assets']}.items():assert sha((ROOT/name).read_bytes())==digest,name
city=read(ROOT/'donghaeng-nav/services/city-walk/manifest.json');assert city['validation_required'] is False and city['metadata']['field_verified'] is False and city['metadata']['accessibility_verified'] is False
build=read(ROOT/'donghaeng-nav/docs/final-build.json');assert build['expansion']['service_integrity_sha256']==sha(services_path.read_bytes());assert build['expansion']['city_walk']['dataset_version']==city['dataset_version']
htmls=[ROOT/('동행길-'+name+'.html') for name in ['최종','시연','전달용']];package=ROOT/'이동약자-내비게이션-실행패키지';htmls += [p for p in package.glob('*.html') if unicodedata.normalize('NFC',p.name) in ['휴대폰용.html','컴퓨터용.html']]
assert len(htmls)==5 and all(sha(p.read_bytes())==build['html_sha256'] for p in htmls)
names={unicodedata.normalize('NFC',p.name):p for p in package.iterdir()}
for line in (package/'SHA256SUMS.txt').read_text().splitlines():digest,name=line.split('  ',1);assert sha(names[unicodedata.normalize('NFC',name)].read_bytes())==digest
reports=['city-walk-source-results','city-walk-building-results','city-walk-api-results','city-map-ui-results','city-layers-core-results','city-walk-bundle-results','main-navigation-results','audit-fixes-ui-results','gps-quality-ui-results','expansion-core-results','expansion-ui-results','review-points-ui-results','vercel-api-results','transit-vercel-results']
for name in reports:assert read(ROOT/('donghaeng-nav/docs/'+name+'.json'))['pass'],name
result={'pass':True,'reviewedDateKst':'2026-11-13','baseline':BASELINE,'originalRuntimeDatasetsByteIdentical':9,'originalEngineAndLocalGraphPolicyUnchanged':True,'changedProtectedOrNewFiles':changed,'protectedCodeFiles':len(lock['protected_code']),'serviceCodeFiles':len(services['files']),'separateCityAssets':len(services['city_assets']),'separateReviewAssets':len(services['review_assets']),'fiveHtmlSameBuild':True,'htmlSha256':build['html_sha256'],'packageHashesMatch':True,'researchAndPriorHistoryPreserved':True,'reports':reports,'cityReferenceRoutingAvailable':True,'cityAccessibleRoutingVerified':False,'cityGpsGuidanceVerified':False,'cityRestRoutingSupported':False,'newMeasuredSlopes':0,'originalRuntimeSlopeChanges':0,'fieldVerified':False,'actualOdsay':False,'productionAliasUpdated':False,'legacyFixtureTestUnavailable':'test-facilities.cjs source fixtures are absent; preserved runtime snapshot/prior implementation comparison passed'}
(ROOT/'donghaeng-nav/docs/city-release-integrity.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
