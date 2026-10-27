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
if [[ $1 == start ]]; then echo 'failed to pull docker image: toomanyrequests' >&2;exit 1;fi
[[ $1 == stop ]]
`,{mode:0o755});
 writeFileSync(join(bin,'docker'),'#!/usr/bin/env bash\nexit 0\n',{mode:0o755});
 const clock=`import {appendFileSync} from 'node:fs';globalThis.setTimeout=(fn,ms)=>{appendFileSync(process.env.TRACE,'wait'+ms+'\\n');queueMicrotask(fn);};`;
 const r=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(clock),fileURLToPath(new URL('./startup.mjs',import.meta.url)),work,project],{env,encoding:'utf8'});
 assert.equal(r.status,20);assert.match(r.stderr,/exhausted 3\/3/);
 assert.deepEqual(readFileSync(env.TRACE,'utf8').trim().split('\n'),['start','stop','wait15000','start','stop','wait30000','start']);
 writeFileSync(env.DOCKER_CONFIG+'/config.json',JSON.stringify({auths:{'ghcr.io':{auth:'synthetic-sensitive-config'}}}));
 const rejected=spawnSync(process.execPath,[fileURLToPath(new URL('./startup.mjs',import.meta.url)),work,project],{env,encoding:'utf8'});
 assert(rejected.status===20);assert(!rejected.stderr.includes('synthetic-sensitive-config'));
 assert.match(rejected.stderr,/private details suppressed/);
 assert.equal(readFileSync(env.TRACE,'utf8').trim().split('\n').filter(x=>x==='start').length,3,'Residual config reached CLI');
 console.log('[harness:startup-entry-test] PASS: real entry exits 20 after exactly three starts, cleanup and controlled backoff; fake CLI token-free');
} finally {rmSync(temp,{recursive:true,force:true});}
