// Real socket collision; no replacement CLI or simulated database.
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {sourceCopy} from './test-support.mjs';
import {verifyRun} from './diagnostics.mjs';
const server=createServer();
await new Promise((resolve,reject)=>server.once('error',reject).listen(56322,'0.0.0.0',resolve));
const temp=mkdtempSync(join(tmpdir(),'wp-f1-ports-'));
try {
  const root=sourceCopy(temp), marker=join(temp,'external-executed');
  for(const linked of [false,true]) {
    if(linked) {
      const outside=join(temp,'external');mkdirSync(outside);
      writeFileSync(join(outside,'db-suite.json'),JSON.stringify({version:1,tests:['probe.test.mjs']}));
      writeFileSync(join(outside,'probe.test.mjs'),`import {writeFileSync} from 'node:fs';export default ()=>writeFileSync(${JSON.stringify(marker)},'bad');`);
      symlinkSync(outside,join(root,'scripts/db/memberships'));
    }
    const result=spawnSync('bash',[join(root,'scripts/db/harness/run.sh')],{encoding:'utf8',timeout:240000});
    const expected=linked?30:20, scenario=linked?'linkedModule-occupied-ports':'startup-occupied-ports';
    verifyRun(scenario,result,expected,()=>{
    assert.equal(result.status,expected,scenario);
    assert.match(result.stdout,/\[database:cleanup\] PASS/);
    assert(!result.stderr.includes('[database:cleanup] FAIL'));
    if(linked) {
      assert(!result.stdout.includes('[database:startup]'));
      assert.match(result.stderr,/\[database:discovery\] FAIL/);
    } else {
      assert.match(result.stdout,/\[database:startup\]/);
      assert.match(result.stderr,/\[database:startup\] FAIL/);
      assert.match(result.stderr,/\[database:diagnostic\] start.log/);
    }
    assert(!existsSync(marker));
    });
    console.log(`[harness:ports-test] PASS: ${scenario} -> ${expected}; cleanup confirmed`);
  }
} finally {server.close();rmSync(temp,{recursive:true,force:true});}
