// A separate, empty Docker config is mandatory for the runtime phase.
import assert from 'node:assert/strict';
import {existsSync,lstatSync,readFileSync,readdirSync,mkdirSync,writeFileSync,realpathSync} from 'node:fs';
import {isAbsolute,delimiter,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const forbiddenEnv=['GITHUB_TOKEN','GHCR_TOKEN','GH_TOKEN','DOCKER_AUTH_CONFIG','REGISTRY_AUTH_FILE'];
export function assertNoHelpers(env=process.env) {
 const dirs=(env.PATH??'').split(delimiter);
 for(const dir of dirs) assert(dir&&isAbsolute(dir),'Absolute helper-free PATH required');
 for(const dir of dirs)
  for(const helper of ['pass','secretservice','osxkeychain','wincred'])
   assert(!existsSync(join(dir,'docker-credential-'+helper)),'Implicit Docker credential helper rejected');
}
export function assertCredentialFree(env=process.env) {
 assertNoHelpers(env);
 assert(!env.DOCKER_CONTEXT,'Inherited Docker context rejected');
 for(const key of forbiddenEnv) assert(!Object.hasOwn(env,key),'Registry credential environment input rejected');
 const path=env.DOCKER_CONFIG;
 assert(path&&isAbsolute(path),'Dedicated empty DOCKER_CONFIG required');
 const stat=lstatSync(path);
 assert(stat.isDirectory()&&!stat.isSymbolicLink()&&stat.uid===process.getuid()&&(stat.mode&0o077)===0,'Private config required');
 assert.deepEqual(readdirSync(path),['config.json'],'Unexpected Docker config material');
 const file=path+'/config.json',fileStat=lstatSync(file);
 assert(fileStat.isFile()&&!fileStat.isSymbolicLink(),'Regular config required');
 const config=JSON.parse(readFileSync(file,'utf8'));
 assert.deepEqual(config,{},'Auths, credential helpers and inherited config are forbidden');
 if(env.WP_PREFETCH_CONFIG) assert(!existsSync(env.WP_PREFETCH_CONFIG),'Authenticated phase config still exists');
 return true;
}
export function prepareCredentialFree(env=process.env) {
 assertNoHelpers(env);
 for(const key of forbiddenEnv) assert(!Object.hasOwn(env,key));
 if(env.WP_PREFETCH_CONFIG) assert(!existsSync(env.WP_PREFETCH_CONFIG),'Prefetch cleanup not complete');
 assert(env.DOCKER_CONFIG&&isAbsolute(env.DOCKER_CONFIG));
 mkdirSync(env.DOCKER_CONFIG,{mode:0o700});
 writeFileSync(env.DOCKER_CONFIG+'/config.json','{}\n',{mode:0o600,flag:'wx'});
 return assertCredentialFree(env);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
 try {if(process.argv[2]==='--prepare') prepareCredentialFree();else if(process.argv[2]==='--check') assertCredentialFree();else throw Error('Invalid credential mode');
  console.log('[database:registry-isolation] PASS: no token, auths or credential helper; authenticated config absent');
 } catch {console.error('[database:registry-isolation] FAIL: residual credential/config input (private details suppressed)');process.exitCode=20;}
}
