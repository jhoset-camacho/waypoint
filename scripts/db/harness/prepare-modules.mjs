import {snapshotSuites} from './discovery.mjs';
try {
  const suites=snapshotSuites(...process.argv.slice(2));
  console.log(`[database:discovery] PASS: ${suites.length} validated module snapshots`);
} catch {
  console.error('[database:discovery] FAIL: discovery assertion (invalid module structure or snapshot)');
  process.exitCode=30;
}
