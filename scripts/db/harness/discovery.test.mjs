// Test the production discoverer/executor without replacing Auth or claiming RLS.
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,renameSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {sandbox} from './test-support.mjs';
const discovery=pathToFileURL(join(import.meta.dirname,'discovery.mjs')).href;
function moduleAt(dir,name='probe.test.mjs',code="export default async()=>console.log('RUN:'+"+JSON.stringify(dir.split('/').at(-1))+");") {
  mkdirSync(dir,{recursive:true});writeFileSync(join(dir,name),code);
  writeFileSync(join(dir,'db-suite.json'),JSON.stringify({version:1,tests:[name]}));
}
const cases={
  noModules:()=>{},
  reservedOnly:(r,w,t,db)=>{for(const name of ['harness','migration-parity']) {mkdirSync(join(db,name));writeFileSync(join(db,name,'db-suite.json'),'not a suite');}},
  validModule:(r,w,t,db)=>moduleAt(join(db,'memberships')),
  failingModule:(r,w,t,db)=>moduleAt(join(db,'memberships'),'probe.test.mjs',"export default async()=>{console.log('RUN:failing');throw Error('deliberate failure');}"),
  twoModules:(r,w,t,db)=>{moduleAt(join(db,'zeta'));moduleAt(join(db,'alpha'));},
  linkedModule:(r,w,t,db)=>{const outside=join(t,'external-module');moduleAt(outside,'probe.test.mjs',`import {writeFileSync} from 'node:fs'; export default ()=>{writeFileSync(${JSON.stringify(join(t,'external-executed'))},'bad');throw Error('must not execute');};`);symlinkSync(outside,join(db,'memberships'));},
  invalidName:(r,w,t,db)=>moduleAt(join(db,'memberships_v1')),
  linkedManifest:(r,w,t,db)=>{const dir=join(db,'memberships');moduleAt(dir);const outside=join(t,'external.json');renameSync(join(dir,'db-suite.json'),outside);symlinkSync(outside,join(dir,'db-suite.json'));},
  linkedTest:(r,w,t,db)=>{const dir=join(db,'memberships');moduleAt(dir);const outside=join(t,'external.test.mjs');renameSync(join(dir,'probe.test.mjs'),outside);symlinkSync(outside,join(dir,'probe.test.mjs'));},
  linkedIntermediate:()=>{},
  danglingModuleLink:(r,w,t,db)=>symlinkSync(join(t,'nonexistent'),join(db,'memberships')),
  incompleteModule:(r,w,t,db)=>mkdirSync(join(db,'memberships')),
  corruptManifest:(r,w,t,db)=>{const dir=join(db,'memberships');moduleAt(dir);writeFileSync(join(dir,'db-suite.json'),'not JSON');},
  emptyTests:(r,w,t,db)=>{const dir=join(db,'memberships');moduleAt(dir);writeFileSync(join(dir,'db-suite.json'),JSON.stringify({version:1,tests:[]}));},
  duplicateModule:(r,w,t,db)=>{moduleAt(join(db,'memberships'));moduleAt(join(w,'modules/memberships'));},
  duplicateTest:(r,w,t,db)=>{const dir=join(db,'memberships');moduleAt(dir);writeFileSync(join(dir,'db-suite.json'),JSON.stringify({version:1,tests:['probe.test.mjs','probe.test.mjs']}));},
  traversal:(r,w,t,db)=>{const dir=join(db,'memberships');moduleAt(dir);writeFileSync(join(dir,'db-suite.json'),JSON.stringify({version:1,tests:['../outside.test.mjs']}));},
  absoluteExternal:(r,w,t,db)=>{const dir=join(db,'memberships');moduleAt(dir);writeFileSync(join(dir,'db-suite.json'),JSON.stringify({version:1,tests:[join(t,'outside.test.mjs')]}));},
  nonDirectoryEntry:(r,w,t,db)=>writeFileSync(join(db,'memberships'),'not a module'),
  missingTest:(r,w,t,db)=>{const dir=join(db,'memberships');moduleAt(dir);rmSync(join(dir,'probe.test.mjs'));},
  testWithoutExport:(r,w,t,db)=>moduleAt(join(db,'memberships'),'probe.test.mjs','export const wrong=true;')
};
// Parent symlinks need an existing nested test so no external target is inspected.
cases.linkedIntermediate=(r,w,t,db)=>{
  const dir=join(db,'memberships');mkdirSync(join(dir,'nested'),{recursive:true});
  writeFileSync(join(dir,'nested/probe.test.mjs'),'export default async()=>{};');
  writeFileSync(join(dir,'db-suite.json'),JSON.stringify({version:1,tests:['nested/probe.test.mjs']}));
  const outside=join(t,'external-tests');renameSync(join(dir,'nested'),outside);symlinkSync(outside,join(dir,'nested'));
};
for(const [name,prepare] of Object.entries(cases)) {
  const temp=mkdtempSync(join(tmpdir(),'wp-r1-discovery-'));
  try {
    const root=join(temp,'source with spaces'), db=join(root,'scripts/db'), work=sandbox(temp);mkdirSync(db,{recursive:true});
    prepare(root,work,temp,db);
    const program=`import {discoverSuites,executeSuites} from ${JSON.stringify(discovery)};
      let stage='discovery';try {const suites=discoverSuites(${JSON.stringify(root)},${JSON.stringify(work)});
      console.log(suites.length?'FOUND:'+suites.map(s=>s.name).join(','):'NONE');stage='execution';
      await executeSuites(suites,Object.freeze({}),()=>{throw Error('unexpected SQL execution');});}
      catch {console.error('FAIL:'+stage);process.exitCode=30;}`;
    const result=spawnSync('node',['--input-type=module','-e',program],{encoding:'utf8'});
    const successes=['noModules','reservedOnly','validModule','twoModules'];
    const wanted=successes.includes(name)?0:30;
    assert.equal(result.status,wanted,name+': '+result.stderr);
    if(wanted===30) {assert(!result.stdout.includes('NONE'),name+' disappeared as NONE');assert.match(result.stderr,/FAIL:(discovery|execution)/);}
    if(!['failingModule','testWithoutExport'].includes(name) && wanted===30) assert.match(result.stderr,/FAIL:discovery/,name+' must fail BEFORE execution');
    if(name==='failingModule') {assert.match(result.stdout,/RUN:failing/);assert.match(result.stderr,/FAIL:execution/);}
    if(name==='validModule') assert.match(result.stdout,/RUN:memberships/);
    if(name==='twoModules') {assert.match(result.stdout,/FOUND:alpha,zeta/);assert(result.stdout.indexOf('RUN:alpha')<result.stdout.indexOf('RUN:zeta'));}
    if(['noModules','reservedOnly'].includes(name)) assert.match(result.stdout,/^NONE\n$/);
    assert(!existsSync(join(temp,'external-executed')),'external symlink module executed');
    console.log(`[harness:discovery-test] PASS: ${name} -> ${wanted}`);
  } finally {rmSync(temp,{recursive:true,force:true});}
}
