import assert from 'node:assert/strict';
import {resultDiagnostic,verifyRun} from './diagnostics.mjs';
const secrets=['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.signature','short-password','anon-private','service-private','opaqueabcdefghijklmnopqrstuvwxyz'];
const result={status:20,stdout:'[database:startup] Starting\n[database:cleanup] PASS\n',stderr:`Error: port 56322 already in use\nJWT=${secrets[0]}\npassword=${secrets[1]}\nANON_KEY=${secrets[2]}\nSERVICE_ROLE_KEY=${secrets[3]}\n${secrets[4]}`};
const log=resultDiagnostic('simulated-mismatch',result,30);
for(const secret of secrets) assert(!log.includes(secret));
for(const proof of ['scenario=simulated-mismatch','received=20','expected=30','last-stage=startup','cleanup=PASS','port 56322 already in use','stdout:','stderr:']) assert(log.includes(proof));
console.log(log);
console.log('[harness:diagnostics-test] PASS: simulated mismatch is observable and sanitized');

for(const stageMismatch of [false,true]) {
  const child={...result,status:stageMismatch?30:20};
  const report=console.error, captured=[];
  console.error=text=>captured.push(text);
  try {
    assert.throws(()=>verifyRun('simulated-'+(stageMismatch?'stage':'exit'),child,30,()=>{
      assert.equal(child.status,30);
      assert.match(child.stderr,/required-stage-proof/);
    }),/Runner contract mismatch/);
  } finally {console.error=report;}
  assert.equal(captured.length,1);
  for(const secret of secrets) assert(!captured[0].includes(secret));
  console.log(captured[0]);
}
assert(!resultDiagnostic('bare-jwt',{status:20,stderr:'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhIn0.abc'},30).includes('eyJhbGciOiJub25lIn0.eyJzdWIiOiJhIn0.abc'));
assert(resultDiagnostic('safe-stage',{status:0,stdout:'[database:authorization] PASS: own positives; verified JWTs'},0).includes('[database:authorization] PASS'));
console.log('[harness:diagnostics-test] PASS: exit AND stage assertion failures are sanitized through the real reporter');
