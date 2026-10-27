// Manifest provenance: immutable CLI 2.106.0 sources, not latest service tags.
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const cliCommit='bd39bcf5e613be87943f8bb8fe4ce75c8dfd84de';
export const sources={
 'apps/cli-go/internal/db/start/start.go':'7ab27e66d133e842e06b8eccf02449813a670d5692ca544a87a5145b1b9a6215',
 'apps/cli-go/pkg/config/templates/Dockerfile':'4077ff1eda17254a590609b69bcc4be93347b37ee3882b335afad9b277109041',
 'apps/cli-go/internal/utils/config.go':'7ae929de9538dbf0bbfba033504287636891c0fc7801175f53da6a6ef2eabe52',
 'apps/cli-go/internal/utils/docker.go':'f2e0156855c141ef59d8a4600f4ac8a4206e0afd7bd67eb8c2afa43406e766c5',
};
export const excluded='edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,storage-api,studio,supavisor,vector';
export const images=readFileSync(new URL('./images.txt',import.meta.url),'utf8').trim().split('\n');
const hash=s=>createHash('sha256').update(s).digest('hex');
export function verifyManifest(dockerfile) {
 assert.equal(hash(readFileSync(new URL('./config.toml',import.meta.url))),'54f8cef50857a26e5a2c032ff514c309faaa08a3121c5bea95d972dd9661e9a4');
 // Storage is excluded as a running service but required by initSchema15's job.
 const aliases=['pg','kong','postgrest','gotrue','storage'];
 const entries=[...dockerfile.matchAll(/^FROM (\S+) AS (\S+)$/gm)];
 const resolved=aliases.map(alias=>{
  const rows=entries.filter(row=>row[2]===alias);assert.equal(rows.length,1);
  return 'ghcr.io/supabase/'+rows[0][1].split('/').at(-1);
 });
 assert.deepEqual(images,resolved);assert.equal(new Set(images).size,5);
 for(const image of images) assert.match(image,/^ghcr\.io\/supabase\/[a-z-]+:(?!latest$)[a-zA-Z0-9.-]+$/);
}
export async function verifyUpstream() {
 let dockerfile;
 for(const [path,sha] of Object.entries(sources)) {
  const r=await fetch(`https://raw.githubusercontent.com/supabase/cli/${cliCommit}/${path}`,{signal:AbortSignal.timeout(30000)});
  assert(r.ok,'Pinned CLI source unavailable');const s=await r.text();assert.equal(hash(s),sha,'Pinned source changed');
  if(path.endsWith('Dockerfile')) dockerfile=s;
 }
 verifyManifest(dockerfile);
 console.log('[database:images] PASS: five exact images verified against immutable CLI 2.106.0 sources/config');
}
export function requireLocalImages() {
 const allowed=new Set(images);
 for(const image of images) {
  const r=spawnSync('docker',['image','inspect','--format','{{.Id}}',image],{encoding:'utf8'});
  if(r.status!==0 || !/^sha256:[a-f0-9]{64}\s*$/.test(r.stdout)) throw Error('Required precached image missing: '+image);
  allowed.add(r.stdout.trim());
 }
 console.log('[database:images] PASS: all manifest images present locally');
 return allowed;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(process.argv[1])).href) {
 try {if(process.argv[2]==='--upstream') await verifyUpstream();else if(process.argv[2]==='--local') requireLocalImages();else throw Error('Unknown image verification mode');}
 catch {console.error('[database:images] FAIL: source/manifest/local image verification');process.exitCode=20;}
}
