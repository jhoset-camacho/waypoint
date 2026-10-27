// Fast fail-closed source checks; all mutations stay in disposable copies.
import {mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync, renameSync, symlinkSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../../..');
const expected=readFileSync(join(root,'scripts/db/migration-parity/expected-migrations.txt'),'utf8').trim().split('\n');
const scenarios={
  baseline:()=>{},
  modified:r=>writeFileSync(join(r,expected[0]),'-- modified'),
  missing:r=>rmSync(join(r,expected[8])),
  renamed:r=>renameSync(join(r,expected[0]),join(r,'supabase/migrations/00000000000001_renamed.sql')),
  duplicate:r=>writeFileSync(join(r,'supabase/migrations/00000000000001_duplicate.sql'),'select 1;'),
  historic010:r=>writeFileSync(join(r,'supabase/migrations/00000000000010_legacy.sql'),'select 1;'),
  historic011:r=>writeFileSync(join(r,'supabase/migrations/00000000000011_legacy.sql'),'select 1;'),
  historicC01:r=>writeFileSync(join(r,'supabase/migrations/20260925172808_legacy.sql'),'select 1;'),
  duplicateCandidate:r=>{for(const n of ['a','b']) writeFileSync(join(r,`supabase/migrations/20990101000000_${n}.sql`),'select 1;');},
  symlink:r=>symlinkSync(join(r,expected[0]),join(r,'supabase/migrations/20990101000000_link.sql')),
  orderedCandidates:r=>{for(const n of ['20990103000000_c.sql','20990101000000_a.sql','20990102000000_b.sql']) writeFileSync(join(r,'supabase/migrations',n),'select 1;');}
};
for(const [name,mutate] of Object.entries(scenarios)) {
  const temp=mkdtempSync(join(tmpdir(),'wp-p02a-plan-'));
  try {
    const source=join(temp,'source'), work=join(temp,'work'); mkdirSync(work);
    for(const dir of ['scripts/db/harness','scripts/db/migration-parity']) {mkdirSync(join(source,dir),{recursive:true});cpSync(join(root,dir),join(source,dir),{recursive:true});}
    mkdirSync(join(source,'supabase/migrations'),{recursive:true});
    for(const path of expected) cpSync(join(root,path),join(source,path));
    mutate(source);
    const result=spawnSync('node',[join(root,'scripts/db/harness/plan.mjs'),source,work],{encoding:'utf8'});
    assert.equal(result.status,['baseline','orderedCandidates'].includes(name)?0:20,name);
    if(name==='orderedCandidates') assert.deepEqual(JSON.parse(readFileSync(join(work,'plan.json'))).candidates,['20990101000000_a.sql','20990102000000_b.sql','20990103000000_c.sql']);
    console.log(`[harness:plan-test] PASS: ${name}`);
  } finally {rmSync(temp,{recursive:true,force:true});}
}
