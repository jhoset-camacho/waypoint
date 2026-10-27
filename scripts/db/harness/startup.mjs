// Retry only recognized registry rate limits, never the database/test pipeline.
import {openSync,closeSync,readFileSync,existsSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {ownedSandbox,inside} from './paths.mjs';
import {sanitize} from './diagnostics.mjs';
export function classifyStartup(text) {
  const s=String(text);
  // A concrete permanent/logical failure takes precedence over a rate-limit line.
  if (/address already in use|port .*already.*(?:use|allocated)|ports? .*not available|bind:.*in use/i.test(s)) return 'ports-occupied';
  if (/cannot connect to the docker daemon|docker.*(?:unavailable|not running)|permission denied.*docker|error during connect/i.test(s)) return 'docker-unavailable';
  if (/manifest unknown|manifest.*not found|no such image|name unknown|manifest for .*not found|no matching manifest|pull access denied|unauthorized|authentication required/i.test(s)) return 'image-unavailable';
  if (/\[database:(?:migration|sql|auth|authorization|discovery|verify)\].*FAIL|(?:migration|SQL|Auth|authorization|discovery|test).*failed|syntax error|assertion/i.test(s)) return 'other-startup';
  const pull=/pull(?:ing)?(?: docker)? image|image configuration|registry|ghcr\.io|public\.ecr\.aws/i.test(s);
  if ((pull || /toomanyrequests/i.test(s)) && /toomanyrequests|too many requests|\b429\b|rate[ -]?limit(?:ed| exceeded)?/i.test(s)) return 'registry-rate-limit';
  return 'other-startup';
}
export async function startWithRetry({start,clean,wait,report}) {
  const delays=[15000,30000]; // Three attempts total, not configurable by environment.
  for(let attempt=1;attempt<=3;attempt++) {
    const result=await start(attempt);
    if(result.status===0) {report(`[database:startup] PASS: attempt=${attempt}/3`); return true;}
    const category=classifyStartup(result.log);
    report(`[database:startup] FAIL: category=${category}; attempt=${attempt}/3\n${sanitize(result.log)}`);
    if(category!=='registry-rate-limit') return false;
    if(attempt===3) {report('[database:startup] FAIL: registry-rate-limit; exhausted 3/3 attempts'); return false;}
    if(!await clean(attempt)) {report('[database:startup] FAIL: cleanup between attempts failed; no retry'); return false;}
    report(`[database:startup] RETRY: registry-rate-limit; cleanup PASS; backoff=${delays[attempt-1]/1000}s`);
    await wait(delays[attempt-1]);
  }
  return false;
}
if(process.argv[1] && import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
  const work=ownedSandbox(process.argv[2]), project=process.argv[3];
  const safe=()=> {
    ownedSandbox(work);
    return /^wp-g1-p02a-[a-z0-9-]+$/.test(project) && readFileSync(inside(work,'owner'),'utf8').trim()===project &&
      !existsSync(work+'/supabase/.temp/project-ref') && readFileSync(inside(work,'supabase/config.toml'),'utf8').includes(`project_id = "${project}"`);
  };
  const commandLog=(cmd,args,name)=> {
    const file=work+'/'+name, fd=openSync(file,'w',0o600);
    try {const r=spawnSync(cmd,args,{stdio:['ignore',fd,fd]});return {status:r.status,log:readFileSync(file,'utf8')+(r.error?'\n'+r.error.message:'')};}
    finally {closeSync(fd);}
  };
  const ok=await startWithRetry({
    start:()=>safe()?commandLog('supabase',['start','--workdir',work,'--exclude','edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,storage-api,studio,supavisor,vector'],'start.log'):{status:20,log:'Unowned startup target'},
    clean:()=> {
      if(!safe()) return false;
      if(commandLog('supabase',['stop','--workdir',work,'--project-id',project,'--no-backup'],'stop.log').status!==0) return false;
      for(const args of [['ps','-aq','--filter',`label=com.supabase.cli.project=${project}`],['volume','ls','-q','--filter',`label=com.supabase.cli.project=${project}`],['network','ls','-q','--filter',`name=^supabase_network_${project}$`]]) {
        const r=spawnSync('docker',args,{encoding:'utf8'});
        if(r.status!==0 || r.stdout.trim()) return false;
      }
      return true;
    },
    wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
    report:message=>console.error(message),
  });
  if(!ok) process.exitCode=20;
}
