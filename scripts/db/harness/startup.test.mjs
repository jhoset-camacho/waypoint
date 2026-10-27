import assert from 'node:assert/strict';
import {classifyStartup,startWithRetry} from './startup.mjs';
const transient=['failed to pull docker image: unexpected status from HEAD request: 429','failed to pull docker image: toomanyrequests: allowed: 44000/minute','error pulling image configuration: HTTP 429 Too Many Requests','registry ghcr.io response status: 429'];
for(const text of transient) assert.equal(classifyStartup(text),'registry-rate-limit');
for(const [text,category] of [
  ['bind: address already in use','ports-occupied'],['port 56322 already in use','ports-occupied'],
  ['Cannot connect to the Docker daemon','docker-unavailable'],['permission denied while trying to connect to the docker API','docker-unavailable'],
  ['manifest unknown','image-unavailable'],['manifest for ghcr.io/supabase/x:nope not found','image-unavailable'],
  ['no matching manifest for linux/amd64','image-unavailable'],['pull access denied','image-unavailable'],
  ['unhealthy container','other-startup'],['Auth HTTP 429 Too Many Requests','other-startup'],
]) assert.equal(classifyStartup(text),category);
async function simulate(results,cleanOK=true) {
  const events=[],logs=[];let calls=0;
  const ok=await startWithRetry({start:async()=>{events.push('start'+(++calls));return results[Math.min(calls-1,results.length-1)];},clean:async n=>{events.push('clean'+n);return cleanOK;},wait:async ms=>events.push('wait'+ms),report:s=>logs.push(s)});
  return {ok,events,logs:logs.join('\n')};
}
const rate={status:1,log:transient[0]},success={status:0,log:''};
let r=await simulate([rate,rate,success]);assert(r.ok);assert.deepEqual(r.events,['start1','clean1','wait15000','start2','clean2','wait30000','start3']);
r=await simulate([rate]);assert(!r.ok);assert.equal(r.events.filter(e=>e.startsWith('start')).length,3);assert.match(r.logs,/exhausted 3\/3/);
r=await simulate([rate],false);assert(!r.ok);assert.deepEqual(r.events,['start1','clean1']);assert.match(r.logs,/cleanup between attempts failed/);
for(const text of ['migration failed','SQL failed','Auth failed','authorization failed','discovery failed','test failed','syntax error','AssertionError','bind: address already in use','manifest unknown','Cannot connect to the Docker daemon','unknown startup failure']) {
  // Even mixed logs cannot make a logical/permanent error transient.
  const log=['unknown startup failure'].includes(text)?text:transient[0]+'\n'+text;
  r=await simulate([{status:30,log}]);assert(!r.ok);assert.deepEqual(r.events,['start1'],text);
}
const jwt='eyJhbGciOiJub25lIn0.eyJzdWIiOiJwcml2YXRlIn0.signature';
r=await simulate([{status:1,log:transient[0]+'\nAuthorization: Bearer '+jwt+'\npassword=private\nGITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789\n'+jwt}]);
for(const value of [jwt,'ghp_abcdefghijklmnopqrstuvwxyz0123456789','password=private']) assert(!r.logs.includes(value));
assert.match(r.logs,/registry-rate-limit/);assert.match(r.logs,/suppressed/);
console.log('[harness:startup-test] PASS: classification, bounded retry/backoff, no logical retry, cleanup order/failure, exhaustion and sanitized diagnostics');

// Exact independent-review regressions: unrelated lines cannot become one cause.
for(const log of [
 'Pulling image ghcr.io/supabase/gotrue:v2.189.0\nAuth HTTP 429 Too Many Requests\ncontainer auth is unhealthy',
 'failed to pull docker image: toomanyrequests\ndenied: requested access to the resource is denied',
 'failed to pull docker image: toomanyrequests\ncontainer Auth unhealthy',
 'Pulling image ghcr.io/supabase/postgres:17.6.1.134\nHTTP 429 Too Many Requests',
 'manifest unknown',
 'bind: address already in use',
 'toomanyrequests: allowed: 44000/minute',
 'failed to pull image ghcr.io/supabase/test:429: unrelated timeout',
 'Pulling image ghcr.io/supabase/gotrue:v2.189.0\nData API HTTP 429 Too Many Requests',
]) {
 const r=await simulate([{status:1,log}]);assert(!r.ok);assert.deepEqual(r.events,['start1']);
 assert.notEqual(classifyStartup(log),'registry-rate-limit');
}
for(const log of ['failed to download image: toomanyrequests','pulling image ghcr.io/supabase/postgres:17.6.1.134: HTTP 429 Too Many Requests','failed to pull image ghcr.io/supabase/gotrue:v2.189.0: HTTP 429 Too Many Requests']) {
 const r=await simulate([{status:1,log}]);assert(!r.ok);assert.deepEqual(r.events,['start1','clean1','wait15000','start2','clean2','wait30000','start3']);
 assert.match(r.logs,/exhausted 3\/3/);
}
// The runner maps false to exit 20, never executes downstream work after it.
const downstream=[];
await assert.rejects(async()=>{
 const ok=await startWithRetry({start:()=>{downstream.push('start');return success;},clean:()=>{downstream.push('clean');return true;},wait:()=>downstream.push('wait'),report:()=>{}});
 assert(ok);downstream.push('sql');throw Error('downstream SQL failure');
},/downstream SQL failure/);
assert.deepEqual(downstream,['start','sql']);
console.log('[harness:startup-test] PASS: causal pure/mixed review cases, permanent precedence, one start for services, bounded pure registry retries and exhausted failure mapped to 20');
