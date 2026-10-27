import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {sandbox} from './test-support.mjs';
import {snapshotSuites,stagedSuites,executeSuites} from './discovery.mjs';
const temp=mkdtempSync(join(tmpdir(),'wp-f1-snapshot-'));
try {
  const root=join(temp,'source with spaces'), dir=join(root,'scripts/db/memberships'),work=sandbox(temp);
  mkdirSync(join(dir,'nested'),{recursive:true});
  writeFileSync(join(dir,'db-suite.json'),JSON.stringify({version:1,setup:['nested/fixture.setup.sql'],tests:['nested/probe.test.mjs','nested/shape.test.sql']}));
  writeFileSync(join(dir,'nested/probe.test.mjs'),'export default ({mark})=>mark();');
  writeFileSync(join(dir,'nested/fixture.setup.sql'),'SETUP');
  writeFileSync(join(dir,'nested/shape.test.sql'),'TEST');
  assert.equal(snapshotSuites(root,work).length,1);
  rmSync(dir,{recursive:true}); // No late discovery or imports from the checkout.
  let ran=false;
  const sql=[];
  await executeSuites(stagedSuites(work),{mark:()=>{ran=true;}},text=>sql.push(text));
  assert.deepEqual(sql,['SETUP','TEST']);
  assert(ran);
  const target=join(work,'suite-snapshot/scripts/db/memberships/nested/probe.test.mjs');
  rmSync(target);symlinkSync(join(temp,'external.test.mjs'),target);
  assert.throws(()=>stagedSuites(work));
  console.log('[harness:snapshot-test] PASS: nested declared files snapshotted; checkout removed; late link rejected');
} finally {rmSync(temp,{recursive:true,force:true});}
