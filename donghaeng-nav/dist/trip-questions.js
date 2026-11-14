(function(root){'use strict';
const steps=[{id:'origin',title:'어디에서 출발할까요?',hint:'이름·주소로 검색하거나 현재 위치를 써 보세요.'},{id:'destination',title:'어디로 가고 싶으세요?',hint:'장소를 검색하거나 지도에서 골라 주세요.'},{id:'condition',title:'오늘 몸 상태는 어떤가요?',hint:'불편한 점이나 쉬고 싶은 간격을 알려 주세요.'},{id:'mode',title:'어떻게 이동할까요?',hint:'입력한 상태에 맞춰 길을 찾아볼게요.'}];
function create({getState,onMapCancel=()=>{},onClassic=()=>{},onLayoutChange=()=>{}}){
 const doc=root.document,form=doc.querySelector('#search'),home=form.parentNode,anchor=doc.createComment('search form home'),character=doc.querySelector('.companion-character'),characterHome=character.parentNode;
 home.insertBefore(anchor,form);
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n};
 const section=el('section',null,'trip-questions');section.id='trip-questions';section.setAttribute('aria-label','캐릭터와 길 찾기');section.hidden=true;
 const card=el('div',null,'question-card'),top=el('div',null,'question-top'),progress=el('span','1 / 4','question-progress'),classic=el('button','한 번에 입력','question-classic');classic.type='button';top.append(progress,classic);
 const avatar=el('button',null,'question-character'),heading=el('h1',steps[0].title),hint=el('p',steps[0].hint,'question-hint');avatar.type='button';avatar.setAttribute('aria-label','동글이 말풍선 접기');avatar.setAttribute('aria-expanded','true');avatar.setAttribute('aria-controls','question-bubble');card.id='question-bubble';hint.id='question-hint';heading.id='question-title';heading.tabIndex=-1;heading.setAttribute('aria-live','polite');
 const slot=el('div',null,'question-input'),review=el('dl',null,'question-summary'),error=el('p','','question-error');error.setAttribute('role','status');
 const controls=el('div',null,'question-controls'),back=el('button','이전','secondary'),next=el('button','다음 →','primary');back.type=next.type='button';controls.append(back,next);
 const collapse=el('button','−','question-collapse');collapse.type='button';collapse.setAttribute('aria-label','말풍선 접기');top.append(collapse);card.append(top,heading,hint,slot,review,error,controls);section.append(card,avatar);doc.body.append(section);
 const returnMap=el('button','질문으로 돌아가기','question-map-return');returnMap.type='button';returnMap.hidden=true;doc.body.append(returnMap);
 const parts={origin:['.origin-settings'],destination:['.destination-field'],condition:['label[for="condition"]','#condition'],mode:['.travel-mode-control','#transit-sharing','#transit-connection','#find-route']};
 let index=0,active=false,awaitingMap=null,destroyed=false,collapsed=false;
 function fold(value){collapsed=value;card.hidden=value;section.dataset.collapsed=String(value);avatar.setAttribute('aria-expanded',String(!value));avatar.setAttribute('aria-label',value?'동글이 말풍선 열기':'동글이 말풍선 접기')}
 avatar.onclick=()=>{fold(!collapsed);if(!collapsed)heading.focus({preventScroll:true})};collapse.onclick=()=>{fold(true);avatar.focus({preventScroll:true})};
 const valid=(step,state)=>step==='origin'?Array.isArray(state.origin):step==='destination'?!!state.destination:step==='condition'?!!state.condition.trim():true;
 function sync(){if(!active||destroyed)return;const state=getState(),step=steps[index];section.dataset.step=step.id;progress.textContent=(index+1)+' / '+steps.length;heading.textContent=step.title;hint.textContent=state.ready?step.hint:'지도 자료를 준비하고 있어요…';
  [...form.children].forEach(n=>n.classList.remove('question-step-active'));for(const selector of parts[step.id])form.querySelector(selector)?.classList.add('question-step-active');
  if(step.id==='origin')form.querySelector('.origin-settings').open=true;
  form.querySelector('#condition').required=step.id==='mode';next.hidden=step.id==='mode';back.hidden=index===0;next.disabled=!state.ready||!valid(step.id,state);review.hidden=step.id!=='mode';review.replaceChildren();
  if(step.id==='mode')for(const [key,value] of [['출발',state.originName],['도착',state.destination?.name],['상태',state.condition]])review.append(el('dt',key),el('dd',value||'미입력'));
 }
 function open(step=0,{focus=false}={}){if(destroyed)return;index=Math.max(0,Math.min(3,step));active=true;awaitingMap=null;returnMap.hidden=true;section.hidden=false;doc.body.classList.remove('question-map-picking');doc.body.classList.add('question-open');fold(false);avatar.append(character);slot.append(form);sync();card.scrollTop=0;requestAnimationFrame(onLayoutChange);if(focus)heading.focus({preventScroll:true});}
 function close(){if(awaitingMap)onMapCancel();form.querySelector('.origin-settings').open=false;form.querySelector('#condition').required=true;active=false;awaitingMap=null;section.hidden=true;returnMap.hidden=true;doc.body.classList.remove('question-open','question-map-picking');requestAnimationFrame(onLayoutChange);anchor.after(form);characterHome.append(character);[...form.children].forEach(n=>n.classList.remove('question-step-active'));}
 function go(delta){const state=getState();if(delta>0&&(!state.ready||!valid(steps[index].id,state)))return false;index=Math.max(0,Math.min(3,index+delta));error.textContent='';sync();card.scrollTop=0;heading.focus({preventScroll:true});return true;}
 back.onclick=()=>go(-1);next.onclick=()=>go(1);classic.onclick=()=>{close();onClassic()};
 function submit(ev){if(!active)return;if(index<3){ev.preventDefault();ev.stopImmediatePropagation();go(1);return}const state=getState(),missing=steps.slice(0,3).findIndex(s=>!valid(s.id,state));if(!state.ready||missing>=0){ev.preventDefault();ev.stopImmediatePropagation();if(missing>=0)index=missing;sync();error.textContent='이 항목을 먼저 알려 주세요.';return}close();}
 form.addEventListener('submit',submit,true);
 function picking(ev){if(!active||!ev.target.closest('#pick-origin,#pick-destination,#verify-destination'))return;awaitingMap=ev.target.closest('#pick-origin')?'origin':'destination';section.hidden=true;doc.body.classList.remove('question-open');doc.body.classList.add('question-map-picking');returnMap.hidden=false;requestAnimationFrame(onLayoutChange);}
 form.addEventListener('click',picking,true);
 function chosen(ev){if(active&&awaitingMap===ev.detail?.kind){section.hidden=false;returnMap.hidden=true;doc.body.classList.remove('question-map-picking');doc.body.classList.add('question-open');awaitingMap=null;requestAnimationFrame(onLayoutChange);sync();heading.focus({preventScroll:true})}else sync();}
 root.addEventListener('trip-point-changed',chosen);
 returnMap.onclick=()=>{onMapCancel();awaitingMap=null;returnMap.hidden=true;section.hidden=false;doc.body.classList.remove('question-map-picking');doc.body.classList.add('question-open');requestAnimationFrame(onLayoutChange);sync();};
 const observer=new MutationObserver(sync);for(const selector of ['#find-route','#origin-name','#destination-status','#location-status'])observer.observe(doc.querySelector(selector),{attributes:true,attributeFilter:['disabled','data-selected'],childList:true,subtree:true,characterData:true});
 form.addEventListener('input',sync);form.addEventListener('change',sync);
 // Route menu returns to the conversation; saved/report modes retain the map UI.
 const menuHandlers=[];for(const button of doc.querySelectorAll('[data-view],[data-mobile-tab],#mobile-edit')){const handler=()=>{const destination=button.dataset.view||button.dataset.mobileTab;if(destination==='saved'||destination==='report')close();else if(destination==='route'||button.id==='mobile-edit')open(0,{focus:true})};button.addEventListener('click',handler);menuHandlers.push([button,handler]);}
 return {open,close,collapse:()=>fold(true),snapshot:()=>({active,index,awaitingMap,collapsed}),destroy(){destroyed=true;close();observer.disconnect();form.removeEventListener('submit',submit,true);form.removeEventListener('click',picking,true);form.removeEventListener('input',sync);form.removeEventListener('change',sync);root.removeEventListener('trip-point-changed',chosen);for(const [b,h]of menuHandlers)b.removeEventListener('click',h);section.remove();returnMap.remove();anchor.remove();}};
}
const api={create,steps};if(typeof module!=='undefined')module.exports=api;else root.TripQuestions=api;
})(typeof globalThis==='undefined'?this:globalThis);
