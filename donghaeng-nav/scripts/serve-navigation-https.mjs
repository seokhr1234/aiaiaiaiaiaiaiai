import {createServer} from 'node:https';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual,createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
import {createApp,readConfig} from '../server.mjs';
export function authorized(header,password){const expected='Basic '+Buffer.from('donghaeng:'+password).toString('base64');const digest=s=>createHash('sha256').update(s).digest();return timingSafeEqual(digest(String(header||'')),digest(expected))}
export function validateHost(host){return host==='127.0.0.1'||isIP(host)===4&&(/^(10\.|192\.168\.)/.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host))}
export async function serve(args=process.argv.slice(2),env=process.env){
 const value=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null},host=value('--host'),cert=value('--cert'),key=value('--key'),port=Number(value('--port')||8443),password=env.DONGHAENG_HTTPS_PASSWORD;
 if(!validateHost(host||'')||!cert||!key||!Number.isInteger(port)||port<1024||port>65535||!password||password.length<12)throw Error('사설 IP --host, 신뢰된 --cert/--key, 1024~65535 포트와 12자 이상 DONGHAENG_HTTPS_PASSWORD를 설정해 주세요.');
 const config=await readConfig(),app=createApp(config),handler=app.listeners('request')[0];
 const server=createServer({cert:await readFile(cert),key:await readFile(key)},(req,res)=>{
  if(!authorized(req.headers.authorization,password)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Donghaeng local navigation"','Cache-Control':'no-store'});res.end('Authentication required');return}
  if(/^\/(?:setup|api\/config)(?:[/?]|$)/.test(req.url||'')){res.writeHead(403,{'Cache-Control':'no-store'});res.end('Configure the API key from the PC localhost service.');return}
  handler(req,res);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});
 console.log('로컬 휴대폰 검사: https://'+host+':'+port+' · 로그인 사용자명 donghaeng · 화면을 켠 상태로 이용');
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)serve().catch(()=>{console.error('HTTPS 실행 실패: 사설 IP·인증서 경로·인증서 신뢰·포트·암호 환경변수를 확인해 주세요.');process.exitCode=1});
