// Mutations affect only private copies. These tests need no database or Auth mock.
import {mkdtempSync,mkdirSync,cpSync,rmSync,writeFileSync,renameSync,symlinkSync,readFileSync,existsSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {checkout,expected,sandbox,sourceCopy} from './test-support.mjs';
const planner=join(checkout,'scripts/db/harness/plan.mjs');
const outsideSQL='CREATE TABLE public.harness_external_marker(id integer); ALTER TABLE public.harness_external_marker ENABLE ROW LEVEL SECURITY;';
function linkDirectory(root,relative,temp) {
  const outside=join(temp,'external-directory');
  renameSync(join(root,relative),outside);
  const migrations=relative==='supabase' ? join(outside,'migrations') : outside;
  writeFileSync(join(migrations,'20990102000000_outside.sql'),outsideSQL);
  symlinkSync(outside,join(root,relative));
}
const cases={
  baseline:()=>{},
  modified:r=>writeFileSync(join(r,expected[0]),'-- modified'),
  missing:r=>rmSync(join(r,expected[8])),
  renamed:r=>renameSync(join(r,expected[0]),join(r,'supabase/migrations/00000000000001_renamed.sql')),
  duplicate:r=>writeFileSync(join(r,'supabase/migrations/00000000000001_duplicate.sql'),'select 1;'),
  historic010:r=>writeFileSync(join(r,'supabase/migrations/00000000000010_legacy.sql'),'select 1;'),
  historic011:r=>writeFileSync(join(r,'supabase/migrations/00000000000011_legacy.sql'),'select 1;'),
  historicC01:r=>writeFileSync(join(r,'supabase/migrations/20260925172808_legacy.sql'),'select 1;'),
  duplicateCandidate:r=>{for(const n of ['a','b']) writeFileSync(join(r,`supabase/migrations/20990101000000_${n}.sql`),'select 1;');},
  candidateFileLink:(r,w,t)=>{const file=join(t,'external.sql');writeFileSync(file,outsideSQL);symlinkSync(file,join(r,'supabase/migrations/20990102000000_link.sql'));},
  baselineFileLink:(r,w,t)=>{const file=join(t,'external.sql');renameSync(join(r,expected[0]),file);symlinkSync(file,join(r,expected[0]));},
  supabaseLink:(r,w,t)=>linkDirectory(r,'supabase',t),
  migrationsLink:(r,w,t)=>linkDirectory(r,'supabase/migrations',t),
  intermediateScriptsLink:(r,w,t)=>{const outside=join(t,'external-scripts');renameSync(join(r,'scripts'),outside);symlinkSync(outside,join(r,'scripts'));},
  coreSQLDirectoryLink:(r,w,t)=>{const outside=join(t,'external-sql');renameSync(join(r,'scripts/db/harness/sql'),outside);symlinkSync(outside,join(r,'scripts/db/harness/sql'));},
  sandboxDirectoryLink:(r,w,t)=>{const outside=join(t,'external-destination');mkdirSync(outside);symlinkSync(outside,join(w,'supabase'));},
  unorderedCandidates:r=>{for(const n of ['20990103000000_c.sql','20990101000000_a.sql','20990102000000_b.sql']) writeFileSync(join(r,'supabase/migrations',n),'select 1;');}
};
for(const [name,mutate] of Object.entries(cases)) {
  const temp=mkdtempSync(join(tmpdir(),'wp-r1-plan-'));
  try {
    const root=sourceCopy(temp), work=sandbox(temp); mutate(root,work,temp);
    const result=spawnSync('node',[planner,root,work],{encoding:'utf8'});
    const wanted=['baseline','unorderedCandidates'].includes(name)?0:20;
    assert.equal(result.status,wanted,name+': '+result.stderr);
    if(wanted===20) assert(!existsSync(join(work,'candidates/20990102000000_outside.sql')), 'external marker SQL copied');
    if(name==='unorderedCandidates') assert.deepEqual(JSON.parse(readFileSync(join(work,'plan.json'))).candidates,['20990101000000_a.sql','20990102000000_b.sql','20990103000000_c.sql']);
    console.log(`[harness:plan-test] PASS: ${name} -> ${wanted}`);
  } finally {rmSync(temp,{recursive:true,force:true});}
}
for(const attack of ['candidateSandboxLink','candidateSandboxFileLink','traversal','absoluteExternal','unownedSandbox','fixtureDirectoryLink']) {
  const temp=mkdtempSync(join(tmpdir(),'wp-r1-stage-'));
  try {
    const root=sourceCopy(temp), work=sandbox(temp), external=join(temp,'external.sql');writeFileSync(external,outsideSQL);
    if(attack==='fixtureDirectoryLink') {
      const target=join(root,'scripts/db/harness/fixtures'), outside=join(temp,'external-fixtures');
      renameSync(target,outside);symlinkSync(outside,target);
      assert.equal(spawnSync('node',[planner,root,work,'valid-candidate']).status,20);
    } else {
      assert.equal(spawnSync('node',[planner,root,work,'valid-candidate']).status,0);
      if(attack==='candidateSandboxLink') {rmSync(join(work,'candidates'),{recursive:true});mkdirSync(join(temp,'outside'));symlinkSync(join(temp,'outside'),join(work,'candidates'));}
      if(attack==='candidateSandboxFileLink') {const file=join(work,'candidates/20990101000000_harness_probe.sql');rmSync(file);symlinkSync(external,file);}
      if(['traversal','absoluteExternal'].includes(attack)) writeFileSync(join(work,'plan.json'),JSON.stringify({candidates:[attack==='traversal'?'../external.sql':external],hashes:{}}));
      if(attack==='unownedSandbox') rmSync(join(work,'owner'));
      const result=spawnSync('node',[planner,'--stage-candidates',work],{encoding:'utf8'});
      assert.equal(result.status,20,attack);
    }
    assert(!existsSync(join(work,'supabase/migrations/20990101000000_harness_probe.sql')));
    console.log(`[harness:plan-test] PASS: ${attack} -> 20; external marker SQL never staged`);
  } finally {rmSync(temp,{recursive:true,force:true});}
}
if(process.platform==='darwin') {
  const alias=tmpdir().replace(/^\/private\/var\//,'/var/');
  assert(alias.startsWith('/var/'),'macOS test requires its normal /var temp directory');
  const temp=mkdtempSync(join(alias,'wp-r1-macos-'));
  try {
    assert.notEqual(realpathSync(temp),temp,'must exercise the real /var alias');
    const root=sourceCopy(temp);
    for(const input of [root,realpathSync(root)]) assert.equal(spawnSync('node',[planner,input,sandbox(temp)]).status,0);
    console.log('[harness:plan-test] PASS: real macOS /var and /private/var aliases -> 0');
  } finally {rmSync(temp,{recursive:true,force:true});}
} else console.log('[harness:plan-test] SKIP: actual macOS /var alias is tested only on macOS');
