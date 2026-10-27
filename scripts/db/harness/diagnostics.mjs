// Bounded diagnostics only: never publish credential files, HTTP bodies or dumps.
import {readFileSync} from 'node:fs';
import {ownedSandbox,inside} from './paths.mjs';
export function sanitize(text='') {
  return String(text).replace(/\x1b\[[0-9;]*m/g,'').split('\n').map(line=> {
    if(/jwt\s*[:=]|token\s*[:=]|(?:access|refresh)[_-]?token|anon.?key|service.?role|password|authorization\s*[:=]|secret|credential|api.?key|postgres(?:ql)?:\/\//i.test(line)) return '[sensitive line suppressed]';
    return line.replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[JWT suppressed]').replace(/[A-Za-z0-9_+/=-]{24,}/g,'[opaque value suppressed]').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'');
  }).slice(-60).join('\n').slice(-12000);
}
export function resultDiagnostic(scenario,result,expected) {
  const combined=String(result.stdout??'')+'\n'+String(result.stderr??'');
  const stages=[...combined.matchAll(/\[database:([a-z/-]+)\]/g)].map(m=>m[1]).filter(s=>!['cleanup','diagnostic'].includes(s));
  const cleanup=/\[database:cleanup\] FAIL/.test(combined)?'FAIL':/\[database:cleanup\] PASS/.test(combined)?'PASS':'UNCONFIRMED';
  return `[harness:diagnostic] scenario=${scenario}; received=${result.status}; expected=${expected}; last-stage=${stages.at(-1)??'unknown'}; cleanup=${cleanup}; signal=${result.signal??'none'}\nstdout:\n${sanitize(result.stdout)}\nstderr:\n${sanitize(result.stderr)}`;
}
if(process.argv[2]==='--logs') {
  const work=ownedSandbox(process.argv[3]);
  for(const name of ['start.log','reset.log','sql.log','status.log','stop.log']) {
    let text;
    try {text=readFileSync(inside(work,name),'utf8');} catch {continue;}
    // Restrict CLI diagnostics to infrastructure/error lines; no arbitrary CLI output.
    const relevant=text.split('\n').filter(line=>/error|fail|toomanyrequests|429|rate.?limit|manifest unknown|not found|address already|port .*use|unhealthy|timeout|timed out|container .*status/i.test(line));
    if(relevant.length) console.error(`[database:diagnostic] ${name}\n${sanitize(relevant.join('\n'))}`);
  }
}

if(process.argv[2]==='--text') console.log(sanitize(readFileSync(process.argv[3],'utf8')));
if(process.argv[2]==='--result') {
  const [, , ,scenario,status,expected,log]=process.argv;
  console.error(resultDiagnostic(scenario,{status:Number(status),stdout:readFileSync(log,'utf8'),stderr:''},Number(expected)));
}

// Never let assertion errors render the child's unsanitized actual/expected data.
export function verifyRun(scenario,result,expected,verify) {
  try {verify();}
  catch {
    console.error(resultDiagnostic(scenario,result,expected));
    throw Error('Runner contract mismatch: '+scenario);
  }
}
