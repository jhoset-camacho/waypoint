import {readdirSync, lstatSync, readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalRoot, ownedSandbox, inside, optionalDirectory, components, makeDirectory, copyInside} from './paths.mjs';
export const RESERVED_MODULES=Object.freeze(['harness','migration-parity']);
export const MODULE_NAME=/^[a-z][a-z0-9-]*$/;
// Every nonreserved entry declares a module. Nothing malformed disappears as NONE.
export function discoverSuites(checkoutInput,workInput,includeTemporary=true) {
  const checkout=canonicalRoot(checkoutInput), work=ownedSandbox(workInput);
  const roots=[inside(checkout,'scripts/db','directory')];
  const temporary=includeTemporary ? optionalDirectory(work,'modules') : null;
  if(temporary) roots.push(temporary);
  const suites=[], names=new Set();
  for(const db of roots) {
    for(const name of readdirSync(db).sort()) {
      if(db===roots[0] && RESERVED_MODULES.includes(name)) continue;
      // lstat BEFORE readdir/read/realpath of the entry: never inspect a link target.
      if(!lstatSync(join(db,name)).isDirectory() || !MODULE_NAME.test(name) || RESERVED_MODULES.includes(name)) throw Error('invalid module entry');
      const root=inside(db,name,'directory');
      if(names.has(name)) throw Error('duplicate module');
      names.add(name);
      const spec=JSON.parse(readFileSync(inside(root,'db-suite.json'),'utf8'));
      if(!spec || Array.isArray(spec) || (Object.hasOwn(spec,'setup') && !Array.isArray(spec.setup)) || spec.version!==1 || !Array.isArray(spec.tests) || !spec.tests.length || Object.keys(spec).some(k=>!['version','setup','tests'].includes(k))) throw Error('invalid suite manifest');
      const seen=new Set();
      const files=(list,setup)=>{
        if(!Array.isArray(list)) throw Error('suite list required');
        return [...list].sort().map(file=>{
          components(file);
          if(!/^[A-Za-z0-9_./-]+$/.test(file) || !(setup ? file.endsWith('.setup.sql') : /\.test\.(sql|mjs)$/.test(file)) || seen.has(file.toLowerCase())) throw Error('invalid/ambiguous suite file');
          seen.add(file.toLowerCase());
          inside(root,file);
          return file;
        });
      };
      suites.push({name,root,setup:files(spec.setup??[],true),tests:files(spec.tests,false)});
    }
  }
  return suites.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
}
export async function executeSuites(suites,context,sql,report=console.log) {
  for(const suite of suites) {
    for(const file of suite.setup) sql(readFileSync(inside(suite.root,file),'utf8'));
    for(const file of suite.tests) {
      const path=inside(suite.root,file); // Recheck containment immediately before execution.
      if(file.endsWith('.sql')) sql(readFileSync(path,'utf8'));
      else {
        const test=(await import(pathToFileURL(path).href)).default;
        if(typeof test!=='function') throw Error('test export required');
        await test(context);
      }
    }
    report(`[database:module] PASS: ${suite.name}`);
  }
}

// Validate before infrastructure, then execute only the private declared snapshot.
export function snapshotSuites(checkout,workInput) {
  const work=ownedSandbox(workInput), suites=discoverSuites(checkout,work);
  makeDirectory(work,'suite-snapshot/scripts/db');
  for(const suite of suites) {
    const target='suite-snapshot/scripts/db/'+suite.name;
    makeDirectory(work,target);
    for(const file of [...suite.setup,...suite.tests]) {
      if(dirname(file)!=='.') makeDirectory(work,target+'/'+dirname(file));
      copyInside(suite.root,file,work,target+'/'+file);
    }
    writeFileSync(join(work,target,'db-suite.json'),JSON.stringify({version:1,setup:suite.setup,tests:suite.tests}),{flag:'wx'});
  }
  const snapshot=inside(work,'suite-snapshot','directory');
  return discoverSuites(snapshot,work,false);
}
export function stagedSuites(workInput) {
  const work=ownedSandbox(workInput);
  return discoverSuites(inside(work,'suite-snapshot','directory'),work,false);
}
