// Required validation data loads together; review/background-only data loads on demand.
window.DONGHAENG_LOAD_DATA=(()=>{
 const pending=new Map();
 return function load(id){
  if(pending.has(id))return pending.get(id);
  const element=document.getElementById(id);if(!element)return Promise.reject(Error('지도 자료 블록을 찾지 못했어요.'));
  const source = element.dataset.src || element.dataset.optionalSrc;
  if(!source&&!element.dataset.encoding)return Promise.resolve(element.textContent);
  const task=(async()=>{let text;
   if(source){
    let response;
    if(element.dataset.compressedSrc&&window.DecompressionStream){
     response=await fetch(element.dataset.compressedSrc);
     if(response.ok){const bytes=new Uint8Array(await response.arrayBuffer());text=bytes[0]===31&&bytes[1]===139?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes)}
     else if(response.status!==404)throw Error('지도 자료를 불러오지 못했어요. 새로고침해 주세요.');
    }
    if(text===undefined){response=await fetch(source);if(!response.ok)throw Error('지도 자료를 불러오지 못했어요. 새로고침해 주세요.');text=await response.text()}
   }else if(element.dataset.encoding==='gzip-base64'){
    if(!window.DecompressionStream)throw Error('최신 Chrome 또는 Edge에서 열어 주세요.');
    const bytes=Uint8Array.from(atob(element.textContent.trim()),c=>c.charCodeAt(0));
    text=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
   }else text=element.textContent;
   JSON.parse(text);element.textContent=text;element.type='application/json';
   element.removeAttribute('data-src');element.removeAttribute('data-optional-src');element.removeAttribute('data-compressed-src');element.removeAttribute('data-encoding');
   return text;
  })();pending.set(id,task);task.then(()=>pending.delete(id),()=>pending.delete(id));return task;
 };
})();
window.DONGHAENG_DATA_READY=(async()=>{
 const entries=[...document.querySelectorAll('script[data-src],script[data-encoding="gzip-base64"]')].filter(e=>e.dataset.lazy!=='true');let loaded=0,failed=false;
 await Promise.all(entries.map(async element=>{try{await window.DONGHAENG_LOAD_DATA(element.id)}catch(error){failed=true;throw error}const status=document.getElementById('boot-status');if(status&&!failed)status.textContent='길 찾기 자료를 준비하는 중… '+(++loaded)+' / '+entries.length}));
})();
