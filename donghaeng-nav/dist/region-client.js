(function(root){'use strict';
function create({fetchImpl=root.fetch.bind(root)}={}){
 const requests=new Map();let serial=0;
 async function request(key,path,{method='GET',body}={}){
  requests.get(key)?.controller.abort();const controller=new AbortController(),id=++serial;requests.set(key,{id,controller});
  const timer=setTimeout(()=>controller.abort(),18000);
  try{const response=await fetchImpl(path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,signal:controller.signal});
   const data=await response.json();if(requests.get(key)?.id!==id)throw new DOMException('Aborted','AbortError');
   if(!response.ok){const error=Error(data.error||'자료를 불러오지 못했어요.');error.code=data.code;throw error}return data;
  }finally{clearTimeout(timer);if(requests.get(key)?.id===id)requests.delete(key)}
 }
 return {request,cancel:key=>requests.get(key)?.controller.abort(),cancelAll:()=>{for(const r of requests.values())r.controller.abort()}};
}
const api={create};if(typeof module!=='undefined')module.exports=api;else root.RegionClient=api;
})(typeof globalThis==='undefined'?this:globalThis);
