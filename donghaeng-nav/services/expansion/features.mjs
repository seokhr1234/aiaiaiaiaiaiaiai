import {loadSnapshot,Facilities} from './snapshot.mjs';
import {fail,bbox,integer} from './contracts.mjs';
let pending;
function geometryBounds(geometry) {
 const box={west:Infinity,south:Infinity,east:-Infinity,north:-Infinity};
 function visit(c){if(typeof c[0]==='number'){box.west=Math.min(box.west,c[0]);box.east=Math.max(box.east,c[0]);box.south=Math.min(box.south,c[1]);box.north=Math.max(box.north,c[1])}else c.forEach(visit)}
 visit(geometry.coordinates);return box;
}
const overlaps=(a,b)=>a.west<=b.east&&a.east>=b.west&&a.south<=b.north&&a.north>=b.south;
function index(features){
 const cells=new Map(),large=[],boxes=features.map(f=>geometryBounds(f.geometry)),step=.02;
 boxes.forEach((b,id)=>{const a=Math.floor(b.west/step),z=Math.floor(b.east/step),c=Math.floor(b.south/step),d=Math.floor(b.north/step);
  if((z-a+1)*(d-c+1)>10000){large.push(id);return}
  for(let x=a;x<=z;x++)for(let y=c;y<=d;y++){const k=x+':'+y;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(id)}
 });
 return {features,query:b=>{const ids=new Set(large);for(let x=Math.floor(b.west/step);x<=Math.floor(b.east/step);x++)for(let y=Math.floor(b.south/step);y<=Math.floor(b.north/step);y++)for(const id of cells.get(x+':'+y)||[])ids.add(id);return [...ids].sort((a,b)=>a-b).filter(id=>overlaps(boxes[id],b)).map(id=>features[id])}};
}
async function store(){
 if(!pending)pending=loadSnapshot().then(s=>{
  const datasets={};
  const places=s.facilities.features.filter(f=>f.properties.name).map(f=>{const c=Facilities.anchor(f);return {id:f.id,name:f.properties.name,address:f.properties.address||'',ll:[c[1],c[0]],type:f.kind,coordinateRole:f.properties.coordinate_role||'mapped_reference',sourceUrl:f.properties.source_url||null,fieldVerified:f.properties.field_verified===true}});
  return {snapshot:s,datasets,places};
 }).catch(error=>{pending=null;throw error});
 return pending;
}
export async function queryFeatures(params,{repository}={}){
 const bounds=bbox(params.get('bbox')),layer=params.get('layer')||'facilities';
 if(!['facilities','precision','crossings'].includes(layer))fail(400,'invalid_layer','자료 종류를 확인해 주세요.');
 const limit=integer(params.get('limit'),300,1000),offset=integer(params.get('offset'),0,1000000);
 if(!limit)fail(400,'invalid_limit','요청 건수는 1 이상이어야 해요.');
 const {snapshot,datasets}=await store();const kind=params.get('kind');let features,total;
 if(repository){({features,total}=await repository.query(snapshot,layer,bounds,{kind,limit,offset}))}
 else {
  if(!datasets[layer])datasets[layer]=index(layer==='facilities'?snapshot.facilities.features:layer==='precision'?snapshot.precision.features:snapshot.data['bundled-crossings-review'].features);
  let found=datasets[layer].query(bounds);if(kind)found=found.filter(f=>(f.kind||f.properties.kind)===kind);
  features=found.slice(offset,offset+limit);total=found.length;
 }
 const source=layer==='precision'?snapshot.precision.metadata:layer==='crossings'?snapshot.data['bundled-crossings-review'].metadata:{};const sourceMetadata=Object.fromEntries(['provider','source_url','source_crs','as_of','license','vertical_datum','crs_verification'].filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
 return {type:'FeatureCollection',sourceMetadata,schema:'donghaeng-features-v1',datasetVersion:snapshot.datasetVersion,layer,bounds,
  features,total,offset,nextOffset:offset+limit<total?offset+limit:null,storage:repository?'postgis':'memory',
  fieldVerified:false,routingEligible:false,notice:'표시용 영역 조회입니다. 자료가 없다는 것이 실제 시설이 없다는 뜻은 아닙니다.'};
}
export async function queryPlaces(params){
 const query=params.get('q')?.trim();if(!query||query.length>80)fail(400,'invalid_query','검색어는 1~80자로 입력해 주세요.');
 const limit=integer(params.get('limit'),10,30);if(!limit)fail(400,'invalid_limit','요청 건수는 1 이상이어야 해요.');
 const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/\s+/g,'');const key=normalize(query),{snapshot,places}=await store();
 const matches=places.filter(p=>normalize(p.name+' '+p.address).includes(key));
 return {schema:'donghaeng-places-v1',datasetVersion:snapshot.datasetVersion,items:matches.slice(0,limit),total:matches.length,
  scope:'기존 서울 등록 시설 이름·주소',completeAddressSearch:false,notice:'검색점은 시설 기준 위치이며 보행 출입구가 아닐 수 있어요.'};
}
