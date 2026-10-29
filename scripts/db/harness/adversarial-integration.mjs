// Reproduce the review's two exploits through the real runner. Only owned local
// projects can start; the external SQL attack must fail before startup at all.
import {mkdtempSync,renameSync,writeFileSync,symlinkSync,rmSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {verifyRun} from './diagnostics.mjs';
import {sourceCopy} from './test-support.mjs';
for(const attack of ['linkedModule','externalSQL','linkedModule','linkedModule','linkedModule']) {
  const temp=mkdtempSync(join(tmpdir(),'wp-r1-real-'));
  try {
    const root=sourceCopy(temp), marker=join(temp,'external-module-executed');
    if(attack==='externalSQL') {
      const outside=join(temp,'external-migrations');renameSync(join(root,'supabase/migrations'),outside);
      writeFileSync(join(outside,'20990102000000_outside.sql'),'CREATE TABLE public.harness_external_marker(id integer); ALTER TABLE public.harness_external_marker ENABLE ROW LEVEL SECURITY;');
      symlinkSync(outside,join(root,'supabase/migrations'));
    } else {
      const outside=join(temp,'external-suite');mkdirSync(outside);
      writeFileSync(join(outside,'db-suite.json'),JSON.stringify({version:1,tests:['must-fail.test.mjs']}));
      writeFileSync(join(outside,'must-fail.test.mjs'),`import {writeFileSync} from 'node:fs'; export default ()=>{writeFileSync(${JSON.stringify(marker)},'executed');throw Error('deliberate external suite failure');};`);
      symlinkSync(outside,join(root,'scripts/db/memberships'));
    }
    const result=spawnSync('bash',[join(root,'scripts/db/harness/run.sh')],{encoding:'utf8',timeout:240000});
    const wanted=attack==='externalSQL'?20:30;
    verifyRun(attack,result,wanted,()=>{
    assert.equal(result.status,wanted,attack+': unexpected stage/exit');
    assert.match(result.stdout,/\[database:cleanup\] PASS/);
    assert(!result.stderr.includes('[database:cleanup] FAIL'));
    if(attack==='externalSQL') {
      assert(!result.stdout.includes('[database:startup]'),'external SQL reached database startup');
      assert.match(result.stderr,/\[database:plan\] FAIL/);
    } else {
      assert(!result.stdout.includes('[database:startup]'),'invalid module reached startup');
      assert.match(result.stderr,/FAIL: discovery assertion/);
      assert(!result.stdout.includes('[database:modules] NONE'),'declared linked suite disappeared');
    }
    assert(!existsSync(marker),'external module executed');
    });
    console.log(`[harness:adversarial-integration] PASS: ${attack} -> ${wanted}; blocked, cleanup confirmed`);
  } finally {rmSync(temp,{recursive:true,force:true});}
}
