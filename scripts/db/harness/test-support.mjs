import {mkdtempSync,writeFileSync,mkdirSync,cpSync,readFileSync} from 'node:fs';
import {join,basename,resolve} from 'node:path';
export const checkout=resolve(import.meta.dirname,'../../..');
export const expected=readFileSync(join(checkout,'scripts/db/migration-parity/expected-migrations.txt'),'utf8').trim().split('\n');
export function sandbox(parent) {
  const work=mkdtempSync(join(parent,'wp-g1-p02a.'));
  writeFileSync(join(work,'owner'),'wp-g1-p02a-'+basename(work).toLowerCase().replaceAll('.','-')+'\n');
  return work;
}
export function sourceCopy(parent) {
  const root=join(parent,'source with spaces'); mkdirSync(root);
  for(const dir of ['scripts/db/harness','scripts/db/migration-parity']) {
    mkdirSync(join(root,dir),{recursive:true}); cpSync(join(checkout,dir),join(root,dir),{recursive:true});
  }
  mkdirSync(join(root,'supabase/migrations'),{recursive:true});
  for(const path of expected) cpSync(join(checkout,path),join(root,path));
  return root;
}
