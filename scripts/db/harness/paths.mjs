// Canonical anchors tolerate host aliases (/var -> /private/var). Every controlled
// component BELOW an anchor must be inspectable, nonlinked and canonical.
import {lstatSync, realpathSync, mkdirSync, readFileSync, copyFileSync, constants} from 'node:fs';
import {isAbsolute, join, basename, sep} from 'node:path';
export function canonicalRoot(input) {
  if (typeof input !== 'string' || !isAbsolute(input) || input.includes('\0') || input.split(sep).includes('..')) throw Error('invalid root');
  if (!lstatSync(input).isDirectory()) throw Error('root must be a nonlinked directory');
  const root=realpathSync(input);
  if (!lstatSync(root).isDirectory()) throw Error('invalid canonical root');
  return root;
}
export function components(path) {
  if (typeof path !== 'string' || isAbsolute(path) || !path || path.includes('\\') || path.includes('\0')) throw Error('relative path required');
  const parts=path.split('/');
  if (parts.some(p=>!p || p==='.' || p==='..')) throw Error('ambiguous path');
  return parts;
}
export function inside(root, path, kind='file') {
  if(!lstatSync(root).isDirectory() || realpathSync(root)!==root) throw Error('invalid canonical anchor');
  const parts=components(path);
  let current=root;
  for (let i=0;i<parts.length;i++) {
    current=join(current,parts[i]);
    const stat=lstatSync(current);
    if (stat.isSymbolicLink() || realpathSync(current)!==current || !current.startsWith(root+sep)) throw Error('path escape/link');
    if (i<parts.length-1 || kind==='directory') {if (!stat.isDirectory()) throw Error('directory required');}
    else if (!stat.isFile()) throw Error('regular file required');
  }
  return current;
}
export function optionalDirectory(root,path) {
  // ENOENT only means absent at the first missing component; links/errors never
  // become absence. Check existing ancestors before allowing a missing leaf.
  const parts=components(path);
  let prefix='';
  for (let i=0;i<parts.length;i++) {
    prefix=prefix ? prefix+'/'+parts[i] : parts[i];
    try {inside(root,prefix,'directory');}
    catch(error) {if(error.code==='ENOENT' && i===parts.length-1) return null; throw error;}
  }
  return inside(root,path,'directory');
}
export function makeDirectory(root,path) {
  let prefix='';
  for (const part of components(path)) {
    prefix=prefix ? prefix+'/'+part : part;
    try {lstatSync(join(root,prefix));} catch(error) {if(error.code!=='ENOENT') throw error; mkdirSync(join(root,prefix),{mode:0o700});}
    inside(root,prefix,'directory');
  }
  return inside(root,path,'directory');
}
export function ownedSandbox(input) {
  const root=canonicalRoot(input), stat=lstatSync(root);
  if (!/^wp-g1-p02a\.[A-Za-z0-9]+$/.test(basename(root)) || (stat.mode & 0o077)!==0 || stat.uid!==process.getuid()) throw Error('unowned sandbox');
  const owner=readFileSync(inside(root,'owner'),'utf8').trim();
  const expected='wp-g1-p02a-'+basename(root).toLowerCase().replaceAll('.','-');
  if(owner!==expected) throw Error('sandbox owner mismatch');
  return root;
}
export function copyInside(sourceRoot,source,targetRoot,target) {
  const from=inside(sourceRoot,source);
  // All destination ancestors must already exist and be nonlinked. Refuse
  // existing targets: no overwrites through a hardlink or stale destination.
  const parts=components(target), parent=parts.slice(0,-1).join('/');
  if(parent) inside(targetRoot,parent,'directory');
  const destination=join(targetRoot,...parts);
  try {lstatSync(destination); throw Error('destination exists');} catch(error) {if(error.code!=='ENOENT') throw error;}
  copyFileSync(from,destination,constants.COPYFILE_EXCL); // Exclusive destination; lstat/canonical checks precede copy.
  return inside(targetRoot,target);
}
