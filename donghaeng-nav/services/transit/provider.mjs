import {readFile,stat} from 'node:fs/promises';
import {ServiceError} from '../expansion/contracts.mjs';
import {createOdsayProvider} from './odsay.mjs';
import {createLocalTransitProvider} from './local-network.mjs';
export async function loadTransitPack(file) {
 if(!file)return null;
 try{const info=await stat(file);if(!info.isFile()||info.size>16*1024*1024)throw Error('size');return JSON.parse(await readFile(file,'utf8'))}
 catch{throw new ServiceError(503,'local_transit_pack_unavailable','로컬 교통 자료 파일을 확인하지 못했어요. 경로·파일 형식·크기를 확인해 주세요.')}
}
export async function createTransitProvider(config={}) {
 if(config.mode==='local'||config.localPackFile)return createLocalTransitProvider({pack:config.pack??await loadTransitPack(config.localPackFile),walk:config.walk,now:config.now});
 return createOdsayProvider(config);
}
