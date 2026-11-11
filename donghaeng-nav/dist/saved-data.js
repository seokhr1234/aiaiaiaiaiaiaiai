(function(root){'use strict';
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
function decode(key,raw){let values;try{values=JSON.parse(raw||'[]')}catch{return {items:[],invalid:1}}if(!Array.isArray(values))return {items:[],invalid:1};
 const valid=key==='donghaeng.school.routes'?x=>x&&Number.isFinite(x.id)&&point(x.origin)&&text(x.originName,200)&&x.destination&&point(x.destination.ll)&&text(x.destination.name,200)&&text(x.condition,500):x=>x&&text(x.type,100)&&text(x.place,80)&&text(x.text,500);
 const items=values.filter(valid);return {items,invalid:values.length-items.length};
}
const api={decode};if(typeof module!=='undefined')module.exports=api;else root.SavedData=api;
})(typeof globalThis==='undefined'?this:globalThis);
