// Snapshot inputs before any database operation. Never edit migration sources.
import {readFileSync, readdirSync, lstatSync, mkdirSync, copyFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, basename} from 'node:path';
const [root, work, scenario = 'verify'] = process.argv.slice(2);
try {
  const digest = p => createHash('sha256').update(readFileSync(p)).digest('hex');
  const manifest = readFileSync(join(root, 'scripts/db/harness/baseline.sha256'), 'utf8').trim().split('\n');
  const expected = readFileSync(join(root, 'scripts/db/migration-parity/expected-migrations.txt'), 'utf8').trim().split('\n');
  if (manifest.length !== 9 || expected.length !== 9) throw Error('baseline manifest count');
  const baseline = manifest.map((line, i) => {
    const [hash, path] = line.split('  ');
    if (path !== expected[i] || !basename(path).startsWith(String(i + 1).padStart(14, '0') + '_')) throw Error('baseline order/name');
    const source = join(root, path);
    if (!lstatSync(source).isFile() || digest(source) !== hash) throw Error('baseline source hash');
    return {name: basename(path), source, hash};
  });
  const destination = join(work, 'supabase/migrations');
  mkdirSync(destination, {recursive: true});
  for (const b of baseline) copyFileSync(b.source, join(destination, b.name));
  // Negative fixtures affect disposable copies, never the source.
  if (scenario === 'modified-baseline') writeFileSync(join(destination, baseline[0].name), '-- changed baseline\n');
  if (scenario === 'missing-baseline') baseline.pop();
  if (baseline.length !== 9 || baseline.some(b => digest(join(destination, b.name)) !== b.hash)) throw Error('baseline snapshot invalid');
  console.log('[database:baseline] PASS: exact names/order and all nine source hashes');
  const names = new Set(baseline.map(b => b.name));
  const candidates = [];
  for (const name of readdirSync(join(root, 'supabase/migrations')).sort()) {
    if (names.has(name)) continue;
    if (/^(00000000000010_|00000000000011_|20260925172808_)/.test(name)) throw Error('unauthorized historical migration');
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(name) || name.slice(0,14) <= '00000000000009') throw Error('invalid candidate name');
    const source = join(root, 'supabase/migrations', name);
    if (!lstatSync(source).isFile()) throw Error('candidate must be a regular file');
    candidates.push({name, source});
  }
  if (['valid-candidate','invalid-migration','valid-module','invalid-module'].includes(scenario)) {
    candidates.push({name:'20990101000000_harness_probe.sql', source:join(root, 'scripts/db/harness/fixtures', scenario === 'invalid-migration' ? 'invalid.sql' : 'probe.sql')});
  }
  candidates.sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const versions = candidates.map(c => c.name.slice(0,14));
  if (new Set(versions).size !== versions.length) throw Error('duplicate candidate version');
  const snapshots = join(work, 'candidates'); mkdirSync(snapshots);
  for (const c of candidates) copyFileSync(c.source, join(snapshots, c.name));
  if (['valid-module','invalid-module'].includes(scenario)) {
    const fixture = join(work,'modules','harness-fixture'); mkdirSync(fixture,{recursive:true});
    copyFileSync(join(root,'scripts/db/harness/fixtures',scenario==='valid-module'?'valid.test.mjs':'invalid.test.mjs'),join(fixture,'probe.test.mjs'));
    writeFileSync(join(fixture,'db-suite.json'),JSON.stringify({version:1,tests:['probe.test.mjs']}));
  }
  writeFileSync(join(work, 'plan.json'), JSON.stringify({candidates:candidates.map(c=>c.name), scenario}));
  console.log(`[database:candidates] ${candidates.length ? candidates.map(c=>c.name).join(', ') : 'NONE (baseline only)'}`);
} catch {
  console.error('[database:plan] FAIL: baseline/candidate integrity or unauthorized history');
  process.exitCode = 20;
}
