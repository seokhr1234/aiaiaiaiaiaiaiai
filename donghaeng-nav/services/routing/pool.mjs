import {Worker} from 'node:worker_threads';
import {ServiceError} from '../expansion/contracts.mjs';
// A single bounded worker keeps CPU-heavy graph work off the HTTP event loop.
export function createRoutingService({timeoutMs=12000,maxQueue=4,workerUrl=new URL('./worker.mjs',import.meta.url)}={}) {
 let worker=null,serial=0,active=null,closed=false;const queue=[];
 const error=(code,message,status=503)=>new ServiceError(status,code,message);
 function cleanup(item){clearTimeout(item.timer);item.signal?.removeEventListener('abort',item.abort)}
 function reset(reason){const current=worker;worker=null;if(active){const item=active;active=null;cleanup(item);item.reject(reason)}current?.terminate();pump()}
 function start(){
  if(worker)return;
  const current=new Worker(workerUrl);worker=current;
  current.on('message',message=>{
   if(current!==worker||!active||message.id!==active.id)return;
   const item=active;active=null;cleanup(item);current.unref();
   message.error?item.reject(new ServiceError(message.error.status,message.error.code,message.error.message)):item.resolve(message.result);pump();
  });
  current.on('error',()=>{if(current===worker)reset(error('routing_worker_failed','경로 계산을 다시 시도해 주세요.'))});
  current.on('exit',()=>{if(current===worker)reset(error('routing_worker_stopped','경로 계산이 중단됐어요.'))});
 }
 function pump(){
  if(closed||active||!queue.length)return;
  start();active=queue.shift();worker.ref();worker.postMessage({id:active.id,input:active.input});
 }
 return {
  route(input,{signal}={}){
   if(closed)return Promise.reject(error('routing_closed','경로 서비스를 종료했어요.'));
   if(signal?.aborted)return Promise.reject(error('request_aborted','요청을 취소했어요.',499));
   if(queue.length+(active?1:0)>=maxQueue)return Promise.reject(error('routing_busy','경로 계산 요청이 많아요. 잠시 후 다시 시도해 주세요.',429));
   return new Promise((resolve,reject)=>{
    const item={id:++serial,input,resolve,reject,signal};
    item.abort=()=>{if(active===item)reset(error('request_aborted','요청을 취소했어요.',499));else{const i=queue.indexOf(item);if(i>=0){queue.splice(i,1);cleanup(item);reject(error('request_aborted','요청을 취소했어요.',499))}}};
    item.timer=setTimeout(()=>{if(active===item)reset(error('routing_timeout','경로 계산 시간이 초과됐어요.',504));else{const i=queue.indexOf(item);if(i>=0){queue.splice(i,1);cleanup(item);reject(error('routing_timeout','경로 계산 대기 시간이 초과됐어요.',504))}}},timeoutMs);
    signal?.addEventListener('abort',item.abort,{once:true});queue.push(item);pump();
   });
  },
  close(){closed=true;for(const item of queue.splice(0)){cleanup(item);item.reject(error('routing_closed','경로 서비스를 종료했어요.'))}reset(error('routing_closed','경로 서비스를 종료했어요.'))},
  status:()=>({active:!!active,queued:queue.length,maxQueue})
 };
}
