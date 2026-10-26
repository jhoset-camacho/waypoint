import {readFileSync, readdirSync, lstatSync, realpathSync, existsSync} from 'node:fs';
import {join, resolve, sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const [root, work, container, scenario] = process.argv.slice(2);
const sql = text => execFileSync('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'], {input:text, encoding:'utf8', stdio:['pipe','pipe','pipe']});
const suites = [];
let stage = "discovery";
try {
  for (const db of [join(root,'scripts/db'),join(work,'modules')].filter(existsSync).map(p=>realpathSync(p))) {
  for (const entry of readdirSync(db).sort()) {
    if (['harness','migration-parity'].includes(entry)) continue;
    const dir = join(db, entry);
    if (!lstatSync(dir).isDirectory() || !/^[a-z][a-z0-9-]*$/.test(entry)) continue;
    const manifest = join(dir, 'db-suite.json');
    if (!readdirSync(dir).includes('db-suite.json')) continue;
    if (!lstatSync(manifest).isFile()) throw Error('manifest must be regular');
    const spec = JSON.parse(readFileSync(manifest, 'utf8'));
    if (spec.version !== 1 || !Array.isArray(spec.tests) || !spec.tests.length || Object.keys(spec).some(k=>!['version','tests','setup'].includes(k))) throw Error('suite contract');
    const files = (list, setup) => {
      if (!Array.isArray(list) || new Set(list).size !== list.length) throw Error('suite files');
      return [...list].sort().map(p => {
        if (typeof p !== 'string' || !/^[a-zA-Z0-9_./-]+$/.test(p) || p.split('/').some(x=>!x || x==='..' || x==='.') || !(setup ? p.endsWith('.setup.sql') : /\.test\.(sql|mjs)$/.test(p))) throw Error('suite filename');
        const file = resolve(dir, p);
        if (!lstatSync(file).isFile() || realpathSync(file) !== file || !file.startsWith(realpathSync(dir)+sep)) throw Error('suite path escape/symlink');
        return file;
      });
    };
    suites.push({name:entry, setup:files(spec.setup ?? [], true), tests:files(spec.tests, false)});
  }
  }
  console.log(`[database:modules] ${suites.length ? suites.map(s=>s.name).join(', ') : 'NONE (no db-suite.json manifests)'}`);
  stage = 'local-status';
  const status = JSON.parse(readFileSync(join(work,'status.json'),'utf8'));
  // Deliberately ignore service_role entirely; signup + password grant need only anon.
  const anon = status.ANON_KEY;
  assert.equal(typeof anon, 'string');
  const base = 'http://127.0.0.1:56321';
  const request = async (path, token, options={}) => {
    assert(path.startsWith('/') && !path.startsWith('//'));
    const response = await fetch(base+path, {method:options.method ?? 'GET', redirect:'error', signal:AbortSignal.timeout(15000), headers:{apikey:anon, Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, body:options.body === undefined ? undefined : JSON.stringify(options.body)});
    const text = await response.text();
    let body; try {body=JSON.parse(text);} catch {body=text;}
    return {status:response.status, body};
  };
  const users = [], tokens = new Map();
  const createUser = async () => {
    const password = randomBytes(24).toString('base64url');
    const email = `harness-${randomBytes(12).toString('hex')}@example.test`;
    stage = 'signup';
    const registered = await request('/auth/v1/signup', anon, {method:'POST',body:{email,password}});
    assert([200,201].includes(registered.status));
    stage = 'password-session';
    const session = await request('/auth/v1/token?grant_type=password', anon, {method:'POST',body:{email,password}});
    assert.equal(session.status,200);
    assert(session.body.access_token && session.body.refresh_token);
    stage = 'auth-identity';
    const identity = await request('/auth/v1/user',session.body.access_token);
    assert.equal(identity.status,200);
    assert.equal(identity.body.id,session.body.user.id);
    const user = Object.freeze({id:identity.body.id});
    tokens.set(user,session.body.access_token);
    return user;
  };
  users.push(await createUser(), await createUser());
  assert.notEqual(users[0].id,users[1].id);
  console.log('[database:auth] PASS: two real users, password sessions and Auth-verified JWTs');
  const api = (identity, path, options) => {
    const token = identity === 'anon' ? anon : tokens.get(identity);
    assert(token, 'unknown identity');
    assert(/^[a-zA-Z0-9_][a-zA-Z0-9_/?=&.,%*():!+-]*$/.test(path) && !path.includes('..'), 'Data API path required');
    return request('/rest/v1/'+path,token,options);
  };
  // Even without domain suites, exercise real HTTP for all three roles. Historical
  // grants are intentionally not patched: a permission denial is an expected response.
  stage = 'data-api';
  for (const identity of ['anon',...users]) {
    const response = await api(identity,'trips?select=id&limit=0');
    assert([200,401,403].includes(response.status));
    if (response.status !== 200) assert.equal(response.body.code,'42501');
  }
  console.log('[database:api] PASS: real local Data API requests for anon and both users');
  for (const suite of suites) {
    stage = 'module-' + suite.name;
    for (const file of suite.setup) sql(readFileSync(file,'utf8'));
    for (const file of suite.tests) {
      if (file.endsWith('.sql')) sql(readFileSync(file,'utf8'));
      else await (await import(pathToFileURL(file).href)).default(Object.freeze({sql,api,createUser,users:Object.freeze(users)}));
    }
    console.log(`[database:module] PASS: ${suite.name}`);
  }
} catch {
  // Never render exception objects, SQL output, HTTP bodies or sessions.
  console.error(`[database:module/auth/api] FAIL: ${stage} assertion (private details suppressed)`);
  process.exitCode=30;
}
