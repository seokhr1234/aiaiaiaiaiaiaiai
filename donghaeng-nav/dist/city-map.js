(function(root){'use strict';
const BOUNDS=[[37.413,126.764],[37.715,127.185]];
function inScope(ll){return Array.isArray(ll)&&ll.length===2&&ll.every(Number.isFinite)&&ll[0]>=37.4&&ll[0]<=37.72&&ll[1]>=126.75&&ll[1]<=127.2}
function places(features,local=[]){const out=new Map(local.map(p=>[String(p.id),p]));for(const f of features){const p=f.properties||{},c=f.geometry?.coordinates;if(f.geometry?.type!=='Point'||!p.name||!inScope([c[1],c[0]]))continue;const id='city-facility:'+f.id;out.set(id,{id,name:p.name,address:p.address||'',ll:[c[1],c[0]],type:f.kind,sourceUrl:p.source_url,approximate:p.coordinate_role!=='mapped_point'})}return [...out.values()]}
const api={BOUNDS,inScope,places};if(typeof module!=='undefined')module.exports=api;else root.CityMap=api;
})(typeof globalThis==='undefined'?this:globalThis);
