// Snapshot inputs before any database operation. Never edit migration sources.
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, basename} from 'node:path';
import {canonicalRoot, ownedSandbox, inside, makeDirectory, copyInside} from './paths.mjs';
const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
try {
  const [input, workInput, scenario = 'verify'] = process.argv.slice(2);
  if(input==='--stage-candidates') {
    const work=ownedSandbox(workInput);
    const plan=JSON.parse(readFileSync(inside(work,'plan.json'),'utf8'));
    inside(work,'supabase/migrations','directory');
    for(const candidate of plan.candidates) {
      if(!/^\d{14}_[a-z0-9_]+\.sql$/.test(candidate)) throw Error('candidate name');
      const source=inside(work,'candidates/'+candidate);
      if(digest(source)!==plan.hashes[candidate]) throw Error('candidate snapshot hash');
      copyInside(work,'candidates/'+candidate,work,'supabase/migrations/'+candidate);
    }
  } else if(input==='--check-sql') {
    inside(ownedSandbox(workInput),scenario);
  } else {
    const root=canonicalRoot(input), work=ownedSandbox(workInput);
    // Inspect supabase AND migrations from the canonical checkout, not just the leaf.
    const migrations=inside(root,'supabase/migrations','directory');
    const manifest=readFileSync(inside(root,'scripts/db/harness/baseline.sha256'),'utf8').trim().split('\n');
    const expected=readFileSync(inside(root,'scripts/db/migration-parity/expected-migrations.txt'),'utf8').trim().split('\n');
    if(manifest.length!==9 || expected.length!==9) throw Error('baseline manifest count');
    const baseline=manifest.map((line,i)=>{
      const [hash,path]=line.split('  ');
      if(path!==expected[i] || path!=='supabase/migrations/'+basename(path) || !basename(path).startsWith(String(i+1).padStart(14,'0')+'_')) throw Error('baseline order/name/path');
      const name=basename(path), source=inside(migrations,name);
      if(digest(source)!==hash) throw Error('baseline source hash');
      return {name,hash};
    });
    makeDirectory(work,'supabase/migrations');
    for(const b of baseline) copyInside(migrations,b.name,work,'supabase/migrations/'+b.name);
    if(scenario==='modified-baseline') writeFileSync(inside(work,'supabase/migrations/'+baseline[0].name),'-- changed baseline\n');
    if(scenario==='missing-baseline') baseline.pop();
    if(baseline.length!==9 || baseline.some(b=>digest(inside(work,'supabase/migrations/'+b.name))!==b.hash)) throw Error('baseline snapshot invalid');
    console.log('[database:baseline] PASS: exact names/order and all nine source hashes');
    const names=new Set(baseline.map(b=>b.name)), candidates=[];
    makeDirectory(work,'candidates');
    for(const name of readdirSync(migrations).sort()) {
      if(names.has(name)) continue;
      if(/^(00000000000010_|00000000000011_|20260925172808_)/.test(name)) throw Error('unauthorized historical migration');
      if(!/^\d{14}_[a-z0-9_]+\.sql$/.test(name) || name.slice(0,14)<='00000000000009') throw Error('candidate name');
      copyInside(migrations,name,work,'candidates/'+name);
      candidates.push(name);
    }
    if(['valid-candidate','invalid-migration','valid-module','invalid-module'].includes(scenario)) {
      const name='20990101000000_harness_probe.sql';
      copyInside(root,'scripts/db/harness/fixtures/'+(scenario==='invalid-migration'?'invalid.sql':'probe.sql'),work,'candidates/'+name);
      candidates.push(name);
    }
    candidates.sort();
    if(new Set(candidates.map(c=>c.slice(0,14))).size!==candidates.length) throw Error('duplicate candidate version');
    if(['valid-module','invalid-module'].includes(scenario)) {
      makeDirectory(work,'modules/harness-fixture');
      copyInside(root,'scripts/db/harness/fixtures/'+(scenario==='valid-module'?'valid.test.mjs':'invalid.test.mjs'),work,'modules/harness-fixture/probe.test.mjs');
      writeFileSync(join(work,'modules/harness-fixture/db-suite.json'),JSON.stringify({version:1,tests:['probe.test.mjs']}),{flag:'wx'});
    }
    const sqlRoot=inside(root,'scripts/db/harness/sql','directory');
    makeDirectory(work,'core-sql');
    for(const sql of readdirSync(sqlRoot).sort()) {
      if(!/^\d{3}-[a-z0-9-]+\.sql$/.test(sql)) throw Error('core SQL entry');
      copyInside(sqlRoot,sql,work,'core-sql/'+sql);
    }
    const hashes=Object.fromEntries(candidates.map(c=>[c,digest(inside(work,'candidates/'+c))]));
    writeFileSync(join(work,'plan.json'),JSON.stringify({candidates,hashes,scenario}),{flag:'wx'});
    console.log(`[database:candidates] ${candidates.length ? candidates.join(', ') : 'NONE (baseline only)'}`);
  }
} catch {
  console.error('[database:plan] FAIL: baseline/candidate integrity, path containment or unauthorized history');
  process.exitCode=20;
}
