// Exhaustion through the actual CLI entrypoint/cleanup adapters, with a fake
// local CLI and an immediate clock. No registry, DB, credentials or long waits.
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sandbox} from './test-support.mjs';
import {prepareCredentialFree,forbiddenEnv} from './credentials.mjs';
const temp=mkdtempSync(join(tmpdir(),'wp-startup-entry-')),bin=join(temp,'bin');mkdirSync(bin);
try {
 const work=sandbox(temp),project=readFileSync(join(work,'owner'),'utf8').trim();
 mkdirSync(join(work,'supabase'));writeFileSync(join(work,'supabase/config.toml'),`project_id = "${project}"\n`);
 const env={...process.env,DOCKER_CONFIG:join(temp,'empty-config'),PATH:bin+delimiter+'/usr/bin'+delimiter+'/bin',TRACE:join(temp,'trace')};
 for(const key of forbiddenEnv)delete env[key];delete env.DOCKER_CONTEXT;delete env.WP_PREFETCH_CONFIG;
 prepareCredentialFree(env);
 writeFileSync(join(bin,'supabase'),`#!/usr/bin/env bash
set -eu
[[ -z \${GITHUB_TOKEN+x} && -z \${GHCR_TOKEN+x} ]] || exit 88
echo "$1" >> "$TRACE"
if [[ $1 == start ]]; then cat "$STARTUP_DIAGNOSTIC" >&2;exit 1;fi
[[ $1 == stop ]]
`,{mode:0o755});
 writeFileSync(join(bin,'docker'),'#!/usr/bin/env bash\nexit 0\n',{mode:0o755});
 const clock=`import {appendFileSync} from 'node:fs';globalThis.setTimeout=(fn,ms)=>{appendFileSync(process.env.TRACE,'wait'+ms+'\\n');queueMicrotask(fn);};`;
 const pure=[
  ['rate-limit-exceeded','failed to pull docker image: rate limit exceeded'],
  ['too-many-requests','failed to pull docker image: too many requests'],
  ['toomanyrequests','failed to pull docker image: toomanyrequests'],
  ['http429','failed to pull image ghcr.io/supabase/gotrue:v2.189.0: HTTP 429 Too Many Requests'],
 ];
 const mixed=[
  ['invalid-reference','invalid reference format'],['manifest-invalid','manifest invalid'],
  ['storage','Storage initialization failed'],['exec-format','failed to start container: exec format error'],
  ['denied','denied: requested access to the resource is denied'],['auth-unhealthy','container Auth unhealthy'],
  ['unauthorized','unauthorized'],['authentication','authentication required'],
  ['missing-tag','manifest for ghcr.io/supabase/x:nope not found'],['missing-image','no such image'],
  ['missing-manifest','manifest unknown'],['port','bind: address already in use'],
  ['docker','Cannot connect to the Docker daemon'],['sql','SQL failed'],
  ['migration','migration failed'],['discovery','discovery failed'],['module','module invalid'],
  ['data-api','Data API failed'],['test','test failed'],['authorization','authorization failed'],
 ].map(([name,cause])=>[name,'failed to pull docker image: toomanyrequests\n'+cause]);
 const independent=[
  ['auth429-unhealthy','Pulling image ghcr.io/supabase/gotrue:v2.189.0\nAuth HTTP 429 Too Many Requests\ncontainer auth is unhealthy'],
  ['unrelated429','Pulling image ghcr.io/supabase/postgres:17.6.1.134\nHTTP 429 Too Many Requests'],
 ];
 env.STARTUP_DIAGNOSTIC=join(temp,'diagnostic');
 for(const [name,log] of [...pure,...mixed,...independent]) {
  writeFileSync(env.TRACE,'');writeFileSync(env.STARTUP_DIAGNOSTIC,log+'\n');
  const r=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(clock),fileURLToPath(new URL('./startup.mjs',import.meta.url)),work,project],{env,encoding:'utf8'});
  assert.equal(r.status,20,name);
  const retry=pure.some(([id])=>id===name);
  assert.deepEqual(readFileSync(env.TRACE,'utf8').trim().split('\n'),retry?['start','stop','wait15000','start','stop','wait30000','start']:['start'],name);
  if(retry)assert.match(r.stderr,/exhausted 3\/3/);
  else {assert.doesNotMatch(r.stderr,/RETRY|registry-rate-limit/);}
  console.log(`[harness:startup-entry-test] PASS: R2 ${name}; starts=${retry?3:1}; retries=${retry?2:0}; cleanups=${retry?2:0}; backoffs=${retry?'15000,30000':'none'}; exit=20`);
 }
 const startsBefore=readFileSync(env.TRACE,'utf8');
 writeFileSync(env.DOCKER_CONFIG+'/config.json',JSON.stringify({auths:{'ghcr.io':{auth:'synthetic-sensitive-config'}}}));
 const rejected=spawnSync(process.execPath,[fileURLToPath(new URL('./startup.mjs',import.meta.url)),work,project],{env,encoding:'utf8'});
 assert(rejected.status===20);assert(!rejected.stderr.includes('synthetic-sensitive-config'));
 assert.match(rejected.stderr,/private details suppressed/);
 assert.equal(readFileSync(env.TRACE,'utf8'),startsBefore,'Residual config reached CLI');
 console.log('[harness:startup-entry-test] PASS: R2 real entry traces, exit 20, residual-auth rejection; fake CLI token-free');
} finally {rmSync(temp,{recursive:true,force:true});}
