import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dockerRelay} from './offline-docker.mjs';
import {images} from './images.mjs';
const temp=mkdtempSync(join(tmpdir(),'wp-offline-test-'));let forwards=0;
const target=http.createServer((req,res)=>{forwards++;res.end('daemon');});
target.on('upgrade',(req,socket)=>{socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n');socket.end('exec-ok');});
await new Promise(resolve=>target.listen(join(temp,'target.sock'),resolve));
const relay=await dockerRelay(join(temp,'proxy.sock'),join(temp,'target.sock'));
const request=(method,path,body)=>new Promise((resolve,reject)=>{
 const req=http.request({socketPath:join(temp,'proxy.sock'),method,path},res=>{let body='';res.on('data',s=>body+=s);res.on('end',()=>resolve({status:res.statusCode,body}));});req.on('error',reject);req.end(body);
});
try {
 for(const path of ['/v1.47/images/create?fromImage=ghcr.io/x','/images/load','/v1.47/images/a/push'])assert.equal((await request('POST',path)).status,403);
 assert.equal((await request('POST','/v1.47/containers/create',JSON.stringify({Image:images[0],Env:['GITHUB_TOKEN=synthetic-only']}))).status,403);
 assert.equal((await request('POST','/v1.47/containers/create',JSON.stringify({Image:'unknown:cached',Env:[]}))).status,403);
 assert.equal(forwards,0);assert.equal(relay.denied(),5);
 assert.equal((await request('POST','/v1.47/containers/create',JSON.stringify({Image:images[0],Env:[]}))).status,200);
 assert.equal(forwards,1);
 assert.deepEqual(await request('GET','/v1.47/info'),{status:200,body:'daemon'});assert.equal(forwards,2);
 await new Promise((resolve,reject)=>{
  const s=net.connect(join(temp,'proxy.sock'),()=>s.write('POST /v1.47/exec/test/start HTTP/1.1\r\nHost: docker\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: 0\r\n\r\n'));
  let text='';s.on('data',chunk=>text+=chunk);s.on('error',reject);s.on('end',()=>{try{assert.match(text,/101 Switching Protocols/);assert.match(text,/exec-ok/);resolve();}catch(e){reject(e);}});
 });
 console.log('[harness:offline-images-test] PASS: versioned/unversioned pulls blocked before daemon; normal API and exec streams relayed');
} finally {relay.server.closeAllConnections();target.closeAllConnections();await Promise.all([new Promise(r=>relay.server.close(r)),new Promise(r=>target.close(r))]);rmSync(temp,{recursive:true,force:true});}
