import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,realpathSync,existsSync} from 'node:fs';

export default async () => {
  const work=realpathSync(process.argv[3]);
  const project=readFileSync(work+'/owner','utf8').trim();
  assert(project.startsWith('wp-g1-p02a-'));
  assert(!existsSync(work+'/supabase/.temp/project-ref'));
  assert(readFileSync(work+'/supabase/config.toml','utf8').includes(`project_id = "${project}"`));
  // Both commands explicitly select the harness local project. Output stays
  // private; successful exit with fail-on=error is evidence of no error-level finding.
  for(const type of ['security','performance']) {
    try {
      execFileSync('supabase',['db','advisors','--local','--workdir',work,'--type',type,'--level','error','--fail-on','error'],
        {stdio:['ignore','pipe','pipe'],timeout:60000});
      console.log(`[memberships:advisors] PASS: local ${type}, no error-level findings`);
    } catch (error) {
      // CLI's advisor catalog may be unavailable offline; do not turn an actual
      // finding into SKIP. Only recognized availability errors allow that outcome.
      const diagnostic=String(error.stderr??'')+String(error.stdout??'');
      if(/ENOTFOUND|could not resolve host|network is unreachable|fetch failed|TLS handshake timeout|context deadline exceeded/i.test(diagnostic) &&
         !/\bERROR\b.*(?:rls|security|definer|view|policy)/i.test(diagnostic)) {
        console.log(`[memberships:advisors] UNAVAILABLE: local ${type} catalog/network; no advisor PASS claimed`);
      } else {
        console.error(`[memberships:advisors] FAIL: local ${type}; private details suppressed`);
        throw new Error('Local advisor did not pass');
      }
    }
  }
  try {
    execFileSync('supabase',['db','lint','--local','--workdir',work,'--schema','private','--level','error','--fail-on','error'],
      {stdio:['ignore','pipe','pipe'],timeout:60000});
    console.log('[memberships:lint] PASS: private functions, no error-level SQL lint findings');
  } catch {
    console.error('[memberships:lint] FAIL: private function lint; private details suppressed');
    throw new Error('Local SQL lint did not pass');
  }
};
