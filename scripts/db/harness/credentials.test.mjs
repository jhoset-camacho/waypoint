import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,delimiter} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareCredentialFree,assertCredentialFree,forbiddenEnv} from './credentials.mjs';
const temp=mkdtempSync(join(tmpdir(),'wp-registry-tests-')),bin=join(temp,'bin');mkdirSync(bin);
const baseEnv={...process.env,PATH:bin+delimiter+'/usr/bin'+delimiter+'/bin'};
for(const key of forbiddenEnv)delete baseEnv[key];delete baseEnv.DOCKER_CONTEXT;
const docker=`#!/usr/bin/env bash
set -eu
case "$1" in
 login)
  [[ -n \${GHCR_TOKEN:-} && $* == *--password-stdin* ]] || exit 61
  token=; IFS= read -r token || true
  [[ $token == "$GHCR_TOKEN" ]] || exit 62
  printf '{"auths":{"ghcr.io":{"auth":"synthetic"}}}' > "$DOCKER_CONFIG/config.json"
  printf '%s' "$token" > "$DOCKER_CONFIG/sentinel"
  echo login >> "$TRACE"
  ;;
 pull)
  [[ -z \${GHCR_TOKEN+x} && -z \${GITHUB_TOKEN+x} ]] || exit 63
  [[ -f $DOCKER_CONFIG/sentinel ]] || exit 64
  echo pull >> "$TRACE"
  if [[ \${FAIL_PULL:-0} == 1 ]]; then cat "$DOCKER_CONFIG/sentinel" >&2; exit 42; fi
  ;;
 image) echo inspect >> "$TRACE"; [[ \${FAIL_INSPECT:-0} != 1 ]] || exit 44 ;;
 logout) echo logout >> "$TRACE"; exit 37 ;;
 *) exit 65 ;;
esac
`;
writeFileSync(join(bin,'docker'),docker,{mode:0o755});
writeFileSync(join(bin,'rm'),'#!/usr/bin/env bash\n[[ ${FAIL_RM:-0} != 1 ]] || exit 1\nexec /bin/rm "$@"\n',{mode:0o755});
try {
 for(const [name,failPull,failRM,expected] of [['success',false,false,0],['pull-failure',true,false,42],['cleanup-failure',false,true,40],['both-fail',true,true,42]]) {
  const path=join(temp,name),trace=join(temp,name+'.trace'),sentinel='synthetic-registry-token-for-isolation-test';
  const env={...baseEnv,WP_PREFETCH_CONFIG:path,GHCR_TOKEN:sentinel,GHCR_USER:'fixture',TRACE:trace,FAIL_PULL:failPull?'1':'0',FAIL_RM:failRM?'1':'0'};
  const r=spawnSync('bash',[fileURLToPath(new URL('./prefetch.sh',import.meta.url))],{env,encoding:'utf8'});
  // Never let an assertion render a raw child log that might contain a sentinel.
  assert(r.status===expected,'Unexpected prefetch result: '+name);
  assert(!(r.stdout+r.stderr).includes(sentinel),'Prefetch log leaked a synthetic token');
  assert.equal(existsSync(path),failRM);
  const events=readFileSync(trace,'utf8').trim().split('\n');assert.equal(events[0],'login');assert.equal(events.at(-1),'logout');
  assert.equal(events.filter(e=>e==='pull').length,failPull?1:5);
  if(failRM) assert.throws(()=>prepareCredentialFree({...baseEnv,WP_PREFETCH_CONFIG:path,DOCKER_CONFIG:join(temp,'must-not-run-'+name)}));
 }
 const missingPath=join(temp,'missing-image');
 const missing=spawnSync('bash',[fileURLToPath(new URL('./prefetch.sh',import.meta.url))],{env:{...baseEnv,WP_PREFETCH_CONFIG:missingPath,GHCR_TOKEN:'synthetic-only',GHCR_USER:'fixture',TRACE:join(temp,'missing.trace'),FAIL_INSPECT:'1'},encoding:'utf8'});
 assert.equal(missing.status,20);assert(!existsSync(missingPath));assert.match(missing.stderr,/required image absent/);
 const runtime=join(temp,'runtime'),env={...baseEnv,DOCKER_CONFIG:runtime,WP_PREFETCH_CONFIG:join(temp,'success')};
 prepareCredentialFree(env);assertCredentialFree(env);
 assert.deepEqual(JSON.parse(readFileSync(runtime+'/config.json','utf8')),{});
 // Real child Node acts as a CLI probe and executable suite, with no token/config auth.
 const probe=spawnSync(process.execPath,['--input-type=module','-e',`import {assertCredentialFree} from ${JSON.stringify(new URL('./credentials.mjs',import.meta.url).href)};assertCredentialFree();console.log('credential-free child');`],{env,encoding:'utf8'});
 assert.equal(probe.status,0);assert.match(probe.stdout,/credential-free child/);
 for(const key of forbiddenEnv)assert.throws(()=>assertCredentialFree({...env,[key]:'synthetic'}));
 for(const config of [{auths:{'ghcr.io':{auth:'synthetic'}}},{credHelpers:{'ghcr.io':'pass'}},{credsStore:'osxkeychain'}]) {
  writeFileSync(runtime+'/config.json',JSON.stringify(config));assert.throws(()=>assertCredentialFree(env));
 }
 writeFileSync(runtime+'/config.json','{}');
 writeFileSync(join(bin,'docker-credential-pass'),'fixture',{mode:0o755});assert.throws(()=>assertCredentialFree(env));
 rmSync(join(bin,'docker-credential-pass'));
 assertCredentialFree(env);
 console.log('[harness:credentials-test] PASS: token only in login phase; child CLI/suite token-free; auth config removed before empty runtime; residual auth/helper rejected; cleanup on pull failure; primary preserved; logs redacted');
} finally {rmSync(temp,{recursive:true,force:true});}
