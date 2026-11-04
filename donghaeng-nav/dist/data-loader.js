// Both server sources and standalone builds expose the same parsed datasets.
window.DONGHAENG_DATA_READY=(async()=>{
 const entries=[...document.querySelectorAll('script[data-src],script[data-encoding="gzip-base64"]')];
 for(let i=0;i<entries.length;i++){
  const element=entries[i],status=document.getElementById('boot-status');
  if(status)status.textContent='지도와 시설 자료를 준비하는 중… '+(i+1)+' / '+entries.length;
  let text;
  if(element.dataset.src){
   const response=await fetch(element.dataset.src);
   if(!response.ok)throw Error('지도 자료를 불러오지 못했어요. 새로고침해 주세요.');
   text=await response.text();
  }else{
   if(!window.DecompressionStream)throw Error('최신 Chrome 또는 Edge에서 열어 주세요.');
   const bytes=Uint8Array.from(atob(element.textContent.trim()),c=>c.charCodeAt(0));
   text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  }
  JSON.parse(text);
  element.textContent=text;element.type='application/json';
  element.removeAttribute('data-src');element.removeAttribute('data-encoding');
 }
})();
