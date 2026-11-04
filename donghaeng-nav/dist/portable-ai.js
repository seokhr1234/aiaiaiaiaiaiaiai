(function(root){'use strict';
let key='',version=0;
function isFile(){return ['file:','content:'].includes(location.protocol)}
function normalize(value){let text=String(value||'').trim();if((text.startsWith('"')&&text.endsWith('"'))||(text.startsWith("'")&&text.endsWith("'")))text=text.slice(1,-1).trim();if(text.length<20||text.length>300||!/^[-A-Za-z0-9_.]+$/.test(text))throw Error('API 키만 붙여넣어 주세요. 공백·주소·설명은 제외해 주세요.');return text}
function clear(){key='';version++}
function configure(value){key=normalize(value);version++}
async function analyze(condition,{signal,fetchImpl=root.fetch.bind(root)}={}){
 if(!key)throw Error('Gemini API 키를 먼저 입력해 주세요.');if(typeof condition!=='string'||!condition.trim()||condition.length>500)throw Error('상태 문장을 1~500자로 입력해 주세요.');
 const started=version;
 let response;try{response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+root.ConditionRequest.defaultModel+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(root.ConditionRequest.create(condition)),signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store'})}catch(error){if(error.name==='AbortError')throw error;throw Error('Google 연결 실패 · 인터넷 연결 또는 파일 브라우저의 통신 제한을 확인해 주세요.')}
 if(started!==version)throw Error('키 설정이 바뀌었어요. 다시 실행해 주세요.');
 if(!response.ok)throw Error(response.status===429?'Gemini 사용 한도 초과 · 할당량을 확인해 주세요.':[400,401,403].includes(response.status)?'키 인증 실패 · 키의 API 권한·제한을 확인해 주세요.':response.status===404?'이 키에서 Gemini 모델을 사용할 수 없어요.':'Gemini 응답 오류 · 잠시 후 다시 시도해 주세요.');
 let data;try{data=await response.json();const text=data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');return root.ConditionAI.validate(JSON.parse(text))}catch{throw Error('Gemini 응답 형식 오류 · 다시 시도해 주세요.')}
}
async function selectRoute(input,{signal,fetchImpl=root.fetch.bind(root)}={}){
 const clean=root.RouteChoice.validateInput(input);if(!key)throw Error('AI 키가 없어요.');const started=version;
 const response=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+root.ConditionRequest.defaultModel+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(root.RouteChoice.request(clean)),signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store'});
 if(started!==version)throw Error('키 설정이 바뀌었어요.');if(!response.ok)throw Error('Gemini 경로 비교 연결에 실패했어요.');
 const data=await response.json();if(started!==version)throw Error('키 설정이 바뀌었어요.');const text=data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');
 return root.RouteChoice.validateDecision(JSON.parse(text),clean.candidates);
}
function init({onChange=()=>{}}={}){
 const dialog=document.getElementById('portable-key-dialog'),form=document.getElementById('portable-key-form'),input=document.getElementById('portable-key-input'),status=document.getElementById('portable-key-status');if(!dialog)return;
 const buttons=[...document.querySelectorAll('[data-open-portable-key]')];
 if(!isFile())return;
 buttons.forEach(b=>{b.hidden=false;b.onclick=()=>{input.value='';status.textContent=key?'키 입력됨 · 실제 연결은 길 찾기에서 확인합니다.':'인터넷이 필요합니다. 키는 이 화면을 닫으면 삭제됩니다.';dialog.showModal()}});
 form.onsubmit=ev=>{ev.preventDefault();try{configure(input.value);input.value='';onChange();buttons.forEach(b=>b.textContent='AI 키 변경');dialog.close();document.getElementById('parser-note').textContent='키 입력됨 · 길 찾기에서 Gemini 연결';}catch(e){status.textContent=e.message;input.value=''}};
 document.getElementById('portable-key-clear').onclick=()=>{clear();input.value='';onChange();buttons.forEach(b=>b.textContent='AI 키 입력');status.textContent='키를 삭제했어요. 기기 내 해석을 사용합니다.'};
 root.addEventListener('pagehide',()=>{clear();input.value=''});root.addEventListener('pageshow',()=>{if(!key)buttons.forEach(b=>b.textContent='AI 키 입력')});
}
root.PortableAI={isFile,normalize,configure,clear,hasKey:()=>!!key,analyze,selectRoute,init};
})(globalThis);
