// Docker API relay: deny pulls rather than merely hoping the local cache is used.
import http from 'node:http';
import net from 'node:net';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {assertCredentialFree,forbiddenEnv} from './credentials.mjs';
import {requireLocalImages,images} from './images.mjs';
export async function dockerRelay(socketPath,target,allowedImages=new Set(images)) {
 let denied=0;
 const server=http.createServer(async (req,res)=>{
  const path=req.url.replace(/^\/v[\d.]+/,'');
  if(req.method==='POST'&&/^\/images\/(?:create|load|[^/?]+\/push)(?:[/?]|$)/.test(path)) {
   denied++;res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Registry operations forbidden: local preloaded images only'}));return;
  }
  let body;
  if(req.method==='POST'&&/^\/containers\/create(?:[/?]|$)/.test(path)) {
   try {
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw Error('Oversized config');chunks.push(chunk);}
    body=Buffer.concat(chunks);const config=JSON.parse(body.toString());
    if(!allowedImages.has(config.Image))throw Error('image-manifest');
    if((config.Env??[]).some(value=>forbiddenEnv.includes(value.split('=',1)[0])||value.startsWith('DOCKER_CONFIG=')))throw Error('registry-credentials');
   } catch(error) {denied++;res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({message:error.message==='image-manifest'?'Container image outside precache manifest':'Registry credentials or invalid container config forbidden'}));return;}
  }
  const upstream=http.request({socketPath:target,path:req.url,method:req.method,headers:req.headers},reply=>{
   res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});if(body)upstream.end(body);else req.pipe(upstream);
 });
 server.on('upgrade',(req,socket,head)=>{
  const path=req.url.replace(/^\/v[\d.]+/,'');
  // Only exec/attach hijacks are required by this harness, never image APIs.
  if(!/^\/(?:exec\/[^/]+\/start|containers\/[^/]+\/attach)(?:[/?]|$)/.test(path)) {denied++;socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');return;}
  const peer=net.connect(target,()=>{
   peer.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`+req.rawHeaders.reduce((s,h,i)=>s+(i%2?': '+h+'\r\n':h),'')+'\r\n');
   if(head.length)peer.write(head);
   socket.pipe(peer);peer.pipe(socket);
  });
  socket.on('error',()=>peer.destroy());peer.on('error',()=>socket.destroy());socket.on('close',()=>peer.destroy());peer.on('close',()=>socket.destroy());
 });
 await new Promise((resolve,reject)=>server.once('error',reject).listen(socketPath,resolve));
 return {server,denied:()=>denied};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
 let result=20,temp,relay;
 try {
  assertCredentialFree();const allowedImages=requireLocalImages();
  const endpoint=process.env.DOCKER_HOST||'unix:///var/run/docker.sock';
  if(!endpoint.startsWith('unix://'))throw Error('Local Unix Docker endpoint required');
  temp=mkdtempSync(join(tmpdir(),'wp-offline-'));
  relay=await dockerRelay(join(temp,'docker.sock'),endpoint.slice(7),allowedImages);
  console.log('[database:offline-images] ENFORCED: Docker API image pulls disabled for CLI and suites');
  const child=spawn('bash',[fileURLToPath(new URL('./selftest.sh',import.meta.url))],{stdio:'inherit',env:{...process.env,DOCKER_HOST:'unix://'+join(temp,'docker.sock')}});
  const terminate=signal=>child.kill(signal);
  process.once('SIGINT',()=>terminate('SIGINT'));process.once('SIGTERM',()=>terminate('SIGTERM'));
  result=await new Promise(resolve=>{child.once('error',()=>resolve(20));child.once('exit',code=>resolve(code??20));});
  if(relay.denied()) {console.error('[database:offline-images] FAIL: runtime attempted forbidden image/credential operation');if(result===0)result=20;}
  else if(result===0) console.log('[database:offline-images] PASS: zero runtime image pulls; credential-free containers; only precached images used');
  else console.error('[database:offline-images] INFO: zero runtime pulls; primary test failure preserved');
 } catch {console.error('[database:offline-images] FAIL: credential/image/API guard (private details suppressed)');result=20;}
 finally {if(relay){relay.server.closeAllConnections();await new Promise(resolve=>relay.server.close(resolve));}if(temp)rmSync(temp,{recursive:true,force:true});}
 process.exitCode=result;
}
