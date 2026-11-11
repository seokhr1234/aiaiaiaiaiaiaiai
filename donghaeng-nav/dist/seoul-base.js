(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SeoulBaseMap=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function intersects(b,v){return b[0]<=v.east&&b[2]>=v.west&&b[1]<=v.north&&b[3]>=v.south}
function visible(data,zoom,bounds){return data.features.filter(f=>f.z<=zoom&&intersects(f.b,bounds))}
const attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
// Leaflet owns both raster and offline tile transforms, including animated zoom.
function offlineLayer(L,map,data){
const Base=L.GridLayer.extend({createTile(coords){
const c=document.createElement('canvas'),s=this.getTileSize(),ratio=Math.min(window.devicePixelRatio||1,2),z=coords.z;
c.width=s.x*ratio;c.height=s.y*ratio;
const offset=L.point(coords.x*s.x,coords.y*s.y),nw=map.unproject(offset,z),se=map.unproject(offset.add(s),z);
const bounds={west:nw.lng,east:se.lng,south:se.lat,north:nw.lat};
const ctx=c.getContext('2d');ctx.scale(ratio,ratio);ctx.fillStyle='#f2f1e9';ctx.fillRect(0,0,s.x,s.y);
const fs=visible(data,z,bounds),project=p=>map.project([p[1],p[0]],z).subtract(offset);
const path=f=>{ctx.beginPath();f.c.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q.x,q.y);else ctx.moveTo(q.x,q.y)});if(f.p)ctx.closePath()};
for(const k of ['green','water','river','boundary'])for(const f of fs.filter(f=>f.k===k)){path(f);if(k==='boundary'){ctx.strokeStyle='#b5bfa9';ctx.lineWidth=1.2;ctx.setLineDash([5,5]);ctx.stroke();ctx.setLineDash([])}else if(k==='river'){ctx.strokeStyle='#bfdde6';ctx.lineWidth=z<14?5:Math.min(40,2**(z-12));ctx.stroke()}else{ctx.fillStyle=k==='green'?'#dce7cf':'#bfdde6';ctx.fill()}}
const roads=fs.filter(f=>f.k==='road').sort((a,b)=>b.z-a.z);for(const f of roads){const major=['motorway','trunk','primary','secondary','tertiary'].includes(f.h),walk=['footway','path','steps','cycleway'].includes(f.h),weight=Math.max(.7,Math.min(10,(major?4:walk?1.2:2.6)*2**((z-15)*.18)));path(f);ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash(f.h==='steps'?[2,3]:[]);if(!walk){ctx.strokeStyle=major?'#cfc8b6':'#d8d6ca';ctx.lineWidth=weight+1.4;ctx.stroke()}ctx.strokeStyle=walk?'#b5b9a5':major?'#fff5cf':'#fffef8';ctx.lineWidth=weight;ctx.stroke();ctx.setLineDash([])}
const occupied=[],named=new Set();function label(text,p,priority){const q=project(p);if(q.x<20||q.y<20||q.x>s.x-20||q.y>s.y-20)return;ctx.font=(priority?'600 ':'')+(priority?12:11)+'px sans-serif';const width=ctx.measureText(text).width+12;if(occupied.some(r=>Math.abs(r.x-q.x)<(r.w+width)/2&&Math.abs(r.y-q.y)<22))return;occupied.push({x:q.x,y:q.y,w:width});ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='#fffffff0';ctx.strokeText(text,q.x,q.y);ctx.fillStyle=priority?'#466052':'#6f7869';ctx.fillText(text,q.x,q.y)}
for(const f of fs.filter(f=>['label','station'].includes(f.k)).sort((a,b)=>a.z-b.z)){if(!named.has(f.n)){label(f.n,f.c,f.k==='label');named.add(f.n)}}for(const f of roads){if(!f.n||named.has(f.n)||z<Math.max(14,f.z+1))continue;label(f.n,f.c[Math.floor(f.c.length/2)],false);named.add(f.n)}

return c;
}});
return new Base({minZoom:3,maxZoom:19,noWrap:true,keepBuffer:2,zIndex:0,attribution:'내장 자료 '+attribution});
}
async function create(map){
const L=window.L,canRequestTiles=/^https?:$/.test(location.protocol);
const control=L.control({position:'topright'});
let status,retry;
control.onAdd=()=>{const box=L.DomUtil.create('div','map-source-control');status=L.DomUtil.create('span','',box);status.setAttribute('role','status');status.setAttribute('aria-live','polite');retry=L.DomUtil.create('button','',box);retry.type='button';retry.textContent='다시 연결';retry.hidden=true;L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);return box};
control.addTo(map);
let fallback=null,fallbackPromise=null,needsFallback=false,disposed=false,timer=null,resizeFrame=null;
const failedTiles=new Set();
const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
minZoom:3,maxZoom:19,maxNativeZoom:19,noWrap:true,keepBuffer:2,updateWhenIdle:true,
zIndex:1,referrerPolicy:'strict-origin-when-cross-origin',attribution
});
function report(mode,text){status.dataset.mode=mode;status.textContent=text;retry.hidden=!canRequestTiles||!['fallback','error'].includes(mode)}
async function showFallback(text){
needsFallback=true;report('fallback',text);
try{
if(!fallbackPromise)fallbackPromise=(async()=>{const embedded=document.getElementById('bundled-seoul-base');let data;
if(embedded){await root.DONGHAENG_LOAD_DATA?.(embedded.id);data=JSON.parse(embedded.textContent)}else{const response=await fetch('data/accessibility/seoul/seoul-base.json');if(!response.ok)throw Error('base unavailable');data=await response.json()}
if(!Array.isArray(data.features)||!data.features.length)throw Error('empty base');
return offlineLayer(L,map,data)})();
fallback=await fallbackPromise;if(needsFallback&&!disposed&&!map.hasLayer(fallback))fallback.addTo(map);
}catch{fallbackPromise=null;if(needsFallback&&!disposed)report('error','배경을 불러오지 못했어요 · 경로·시설은 유지됩니다')}
}
function onlineReady(){needsFallback=false;if(fallback&&map.hasLayer(fallback))map.removeLayer(fallback);report('online','OpenStreetMap · 온라인 지도')}
function startTimer(){clearTimeout(timer);timer=setTimeout(()=>showFallback('지도 연결 지연 · 내장 지도 표시'),10000)}
tiles.on('loading',()=>{if(!needsFallback)report('loading','OpenStreetMap 연결 중…');startTimer()});
tiles.on('tileerror',event=>{failedTiles.add(event.tile);showFallback('일부 타일 연결 실패 · 내장 지도로 보완')});
tiles.on('tileload',event=>failedTiles.delete(event.tile));
tiles.on('tileunload',event=>failedTiles.delete(event.tile));
tiles.on('load',()=>{clearTimeout(timer);if(failedTiles.size)showFallback('타일 연결 실패 · 내장 지도로 보완');else onlineReady()});
function connect(){
if(!canRequestTiles){showFallback('내장 지도 · 파일 시연');status.title='내장 지도를 표시합니다. AI는 화면의 키 입력에서 연결할 수 있어요.';return}
if(navigator.onLine===false){disconnect();return}
failedTiles.clear();report('loading','OpenStreetMap 연결 중…');startTimer();
if(map.hasLayer(tiles))tiles.redraw();else tiles.addTo(map);
}
function disconnect(){clearTimeout(timer);if(map.hasLayer(tiles))map.removeLayer(tiles);failedTiles.clear();showFallback('오프라인 · 내장 지도 표시')}
retry.onclick=connect;window.addEventListener('online',connect);window.addEventListener('offline',disconnect);
// CSS layout changes (presentation/mobile) need size invalidation too.
const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>map.invalidateSize({pan:false,debounceMoveend:true}))}):null;
observer?.observe(map.getContainer());
map.once('unload',()=>{disposed=true;clearTimeout(timer);cancelAnimationFrame(resizeFrame);observer?.disconnect();window.removeEventListener('online',connect);window.removeEventListener('offline',disconnect)});
connect();return {layer:tiles,control};
}
return {create,visible,intersects};
});
