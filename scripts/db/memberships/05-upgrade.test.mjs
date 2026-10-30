import assert from 'node:assert/strict';
import {readFileSync,realpathSync,existsSync,readdirSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

// Rehearse the exact historical SQL + candidate inside the runner's OWNED local
// database. Snapshot/restore public/private in memory; Auth JWTs stay untouched.
// Never accept a DB URL, hosted connection, or arbitrary container from env.
export default async ({sql,users,api}) => {
  const work=realpathSync(process.argv[3]), container=process.argv[4];
  const project=readFileSync(work+'/owner','utf8').trim();
  assert(project.startsWith('wp-g1-p02a-') && container==='supabase_db_'+project);
  assert(!existsSync(work+'/supabase/.temp/project-ref'));
  const config=readFileSync(work+'/supabase/config.toml','utf8');
  assert(config.includes(`project_id = "${project}"`));
  assert(!/^schemas\s*=.*private/m.test(config));
  const dir=work+'/supabase/migrations/';
  const names=readdirSync(dir).sort();
  const baseline=names.filter(n=>/^0000000000000[1-9]_/.test(n));
  assert.equal(baseline.length,9);
  const plan=JSON.parse(readFileSync(work+'/plan.json','utf8'));
  const candidate=plan.candidates.find(n=>n.endsWith('_g1_p03_memberships_roles_rls.sql'));
  assert(candidate);
  const migration=readFileSync(dir+candidate,'utf8');
  assert.equal(createHash('sha256').update(migration).digest('hex'),plan.hashes[candidate]);
  const rawDump=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-d','postgres','--schema=public','--schema=private','--no-owner'],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
  // Keep schema ownership/default ACLs in place. Supabase's managed default
  // privileges cannot be recreated by the local postgres role after DROP SCHEMA.
  const dump=rawDump.split('\n').filter(line=>!line.startsWith('CREATE SCHEMA ') && !line.startsWith('ALTER DEFAULT PRIVILEGES ')).join('\n');
  const aclObjects=`WITH objects AS (
    SELECT c.relacl AS acl,c.relowner AS owner,CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END AS kind,
      CASE WHEN c.relkind='S' THEN 'SEQUENCE ' ELSE 'TABLE ' END||format('%I.%I',n.nspname,c.relname) AS target
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','S','f')
    UNION ALL
    SELECT p.proacl,p.proowner,'f'::"char",'FUNCTION '||format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private') AND NOT EXISTS
      (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
    ), entries AS (SELECT target,a.* FROM objects o CROSS JOIN LATERAL aclexplode(coalesce(o.acl,acldefault(o.kind,o.owner))) a)
    `;
  const aclGrants=sql(aclObjects+`SELECT 'GRANT '||privilege_type||' ON '||target||' TO '||
    CASE WHEN grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grantee)) END||
    CASE WHEN is_grantable THEN ' WITH GRANT OPTION' ELSE '' END||';' FROM entries ORDER BY target,grantee,privilege_type;`);
  const authTrigger=sql("SELECT pg_get_triggerdef(oid)||';' FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='on_auth_user_created';").trim();
  const storagePolicies=sql(`SELECT 'CREATE POLICY '||quote_ident(policyname)||' ON storage.objects FOR '||cmd||
    ' TO '||(SELECT string_agg(quote_ident(x),',') FROM unnest(roles) x)||
    COALESCE(' USING ('||qual||')','')||COALESCE(' WITH CHECK ('||with_check||')','')||';'
    FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname IN ('attachments_upload','attachments_read','attachments_delete') ORDER BY policyname;`);
  const erase=`DO $erase$ DECLARE obj record; BEGIN
    FOR obj IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','private') LOOP
      EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE',obj.schemaname,obj.tablename);
    END LOOP;
    FOR obj IN SELECT p.oid::regprocedure AS identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN ('public','private') AND NOT EXISTS
        (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') LOOP
      EXECUTE format('DROP ROUTINE IF EXISTS %s CASCADE',obj.identity);
    END LOOP;
    FOR obj IN SELECT n.nspname,t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' LOOP
      EXECUTE format('DROP TYPE %I.%I CASCADE',obj.nspname,obj.typname);
    END LOOP;
    END $erase$;
    DROP POLICY IF EXISTS attachments_upload ON storage.objects;
    DROP POLICY IF EXISTS attachments_read ON storage.objects;
    DROP POLICY IF EXISTS attachments_delete ON storage.objects;`;
  let phase='rebuild baseline';
  const asynchronous=(text,expectedFailure=false)=>new Promise((resolve,reject)=>{
    let diagnostic='';
    const child=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-At'],{stdio:['pipe','ignore','pipe']});
    child.on('error',()=>reject(new Error('Local SQL child failed')));
    child.stderr.on('data',chunk=>{diagnostic+=chunk;});
    child.on('close',code=>code===0?resolve('success'):(expectedFailure && /23514|40001/.test(diagnostic) && !/40P01/.test(diagnostic))?resolve('safely-rejected'):reject(new Error('Local SQL assertion failed')));
    child.stdin.on('error',()=>{}); child.stdin.end(text);
  });
  const until=async predicate=>{
    for(let n=0;n<80;n++) {if(predicate()) return; await new Promise(r=>setTimeout(r,50));}
    throw new Error('Local concurrency rendezvous timed out');
  };
  const A='10300000-0000-4000-8000-000000000001',M='10300000-0000-4000-8000-000000000002',F='10300000-0000-4000-8000-000000000003';
  const committed='10300000-0000-4000-8000-000000000004',reverted='10300000-0000-4000-8000-000000000005';
  const self1='10300000-0000-4000-8000-000000000011',self2='10300000-0000-4000-8000-000000000012';
  const children=[];
  try {
    sql(erase+"BEGIN; SET LOCAL session_replication_role='replica'; DELETE FROM storage.buckets WHERE id='attachments'; COMMIT;\n"+baseline.map(n=>readFileSync(dir+n,'utf8')).join('\n'));
    sql(`UPDATE public.users SET name='Fixture Owner' WHERE id='${users[0].id}';
      UPDATE public.users SET name=NULL WHERE id='${users[1].id}';
      INSERT INTO public.trips(id,user_id,title) VALUES ('${A}','${users[0].id}','Duplicate self'),('${M}','${users[0].id}','Missing self'),('${F}','${users[1].id}','Fallback name');
      DELETE FROM public.travelers;
      INSERT INTO public.travelers(id,trip_id,name,role,created_at) VALUES
        ('${self2}','${A}','Second','self','2000-01-01'),('${self1}','${A}','First','self','2000-01-01'),
        ('10300000-0000-4000-8000-000000000013','${M}','No account','friend','2000-01-01');`);
    assert.equal(sql('SELECT count(*) FROM public.trips;').trim(),'3');
    assert.equal(sql('SELECT count(*) FROM public.travelers;').trim(),'3');
    phase='inconsistent historical owner aborts atomically';
    sql(`ALTER TABLE public.trips ALTER COLUMN user_id DROP NOT NULL;
      INSERT INTO public.trips(id,title) VALUES ('10300000-0000-4000-8000-000000000099','Invalid owner');`);
    let aborted=false; try {sql(migration);} catch {aborted=true;}
    assert(aborted);
    assert.equal(sql("SELECT to_regclass('public.trip_memberships') IS NULL;").trim(),'t');
    sql("DELETE FROM public.trips WHERE id='10300000-0000-4000-8000-000000000099'; ALTER TABLE public.trips ALTER COLUMN user_id SET NOT NULL;");
    phase='real inserts before migration lock';
    for(const [name,key,ending] of [['p03_commit',committed,'COMMIT'],['p03_rollback',reverted,'ROLLBACK']]) {
      children.push(asynchronous(`SET application_name='${name}'; BEGIN;
        INSERT INTO public.trips(id,user_id,title) VALUES ('${key}','${users[0].id}','Concurrent fixture');
        SELECT pg_sleep(6); ${ending};`));
    }
    await until(()=>sql("SELECT count(*) FROM pg_stat_activity WHERE application_name IN ('p03_commit','p03_rollback') AND wait_event='PgSleep';").trim()==='2');
    const applying=asynchronous("SET application_name='p03_migration';\n"+migration);
    children.push(applying);
    await until(()=>sql(`SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
      WHERE a.application_name='p03_migration' AND l.relation='public.trips'::regclass AND l.mode='AccessExclusiveLock' AND NOT l.granted;`).trim()==='1');
    await Promise.all(children);
    phase='backfill counts and deterministic vectors';
    assert.equal(sql('SELECT count(*) FROM public.trips;').trim(),'4');
    assert.equal(sql('SELECT count(*) FROM public.travelers;').trim(),'6');
    assert.equal(sql('SELECT count(*) FROM public.trip_memberships;').trim(),'4');
    assert.equal(sql(`SELECT traveler_id FROM public.trip_memberships WHERE trip_id='${A}';`).trim(),self1);
    assert.equal(sql(`SELECT count(*) FROM public.travelers WHERE trip_id='${A}' AND role='self';`).trim(),'2');
    for(const trip of [M,F]) {
      assert.equal(sql(`SELECT traveler_id=md5('gustave:p03:self:'||'${trip}')::uuid FROM public.trip_memberships WHERE trip_id='${trip}';`).trim(),'t');
    }
    assert.equal(sql(`SELECT v.name FROM public.travelers v JOIN public.trip_memberships m ON m.traveler_id=v.id WHERE m.trip_id='${M}';`).trim(),'Fixture Owner');
    assert.equal(sql(`SELECT v.name FROM public.travelers v JOIN public.trip_memberships m ON m.traveler_id=v.id WHERE m.trip_id='${F}';`).trim(),'Viajero');
    assert.equal(sql(`SELECT count(*) FROM public.trips WHERE id='${reverted}';`).trim(),'0');
    assert.equal(sql(`SELECT count(*) FROM public.travelers WHERE trip_id='${reverted}';`).trim(),'0');
    assert.equal(sql(`SELECT count(*) FROM public.trip_memberships WHERE trip_id='${committed}' AND role='organizer' AND status='active';`).trim(),'1');
    assert.equal(sql(`SELECT count(*) FROM public.trips WHERE contract_id<>'trip_'||replace(id::text,'-','');`).trim(),'0');
    assert.equal(sql(`SELECT count(*) FROM public.travelers WHERE contract_id<>'person_'||replace(id::text,'-','');`).trim(),'0');
    assert.equal(sql(`SELECT count(*) FROM public.trips t WHERE (SELECT count(*) FROM public.trip_memberships m WHERE m.trip_id=t.id AND role='organizer' AND status='active')<>1;`).trim(),'0');
    phase='historical owner real JWT and exact foreign IDs';
    for(const key of [A,M,committed]) {
      const response=await api(users[0],`trips?id=eq.${key}&select=id`);
      assert.equal(response.status,200); assert.equal(response.body[0]?.id,key);
      const foreign=await api(users[1],`trips?contract_id=eq.trip_${key.replaceAll('-','')}&select=id`);
      assert.equal(foreign.status,200); assert.equal(foreign.body.length,0);
    }
    phase='concurrent organizer transitions';
    sql(`INSERT INTO public.trip_memberships(trip_id,user_id,traveler_id,role) VALUES ('${A}','${users[1].id}','${self2}','organizer');`);
    const transitions=await Promise.all(users.map(actor=>asynchronous(`BEGIN ISOLATION LEVEL REPEATABLE READ;
      SELECT count(*) FROM public.trip_memberships WHERE trip_id='${A}'; SELECT pg_sleep(0.3);
      UPDATE public.trip_memberships SET role='viewer' WHERE trip_id='${A}' AND user_id='${actor.id}'; COMMIT;`,true)));
    assert.equal(transitions.filter(x=>x==='success').length,1);
    assert.equal(transitions.filter(x=>x==='safely-rejected').length,1);
    assert.equal(sql(`SELECT count(*) FROM public.trip_memberships WHERE trip_id='${A}' AND role='organizer' AND status='active';`).trim(),'1');
    console.log('[memberships:concurrency] PASS: concurrent organizer demotions serialize; one succeeds, one safely fails; no deadlock or lost last organizer');
    // Historical owner access is credited to real JWTs, never to the fixture connection.
    console.log('[memberships:upgrade] PASS: exact 001–009 replay; before=3 trips/3 travelers; drained commit => after=4 trips/6 travelers/4 memberships; rollback absent');
    console.log(`[memberships:duplicates] preserved=${self2}; selected=${self1}; order=(created_at,id)`);
    console.log('[memberships:race] PASS: observed pending ACCESS EXCLUSIVE lock against two real pre-lock insert transactions; committed row backfilled; rolled-back row absent');
  } catch (error) {
    const cause=String(error.stderr??'').match(/ERROR: ([^\r\n]+)/)?.[1]??'assertion';
    const safe=cause.replace(/"[^"]*"/g,'[identifier]').replace(/[A-Za-z0-9_@./:-]{20,}/g,'[redacted]');
    console.error(`[memberships:upgrade] FAIL: ${phase}; ${safe}`);
    throw new Error('Upgrade assertion failed; private SQL output suppressed');
  } finally {
    await Promise.allSettled(children);
    // Restore every original public/private object, fixture and grant before the
    // next module. No Auth rows/sessions, history, or central harness files change.
    try {
      sql(erase+dump+'\nSET search_path=public,extensions;\n'+authTrigger+'\n'+storagePolicies);
      // CREATE object re-applies live default ACLs. Clear those privileges before
      // replaying the original effective object ACLs, including default functions.
      const aclRevokes=sql(aclObjects+`SELECT DISTINCT 'REVOKE ALL ON '||target||' FROM '||
        CASE WHEN grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(grantee)) END||';' FROM entries;`);
      sql(aclRevokes+'\n'+aclGrants+"\nNOTIFY pgrst, 'reload schema';");
    } catch (error) {
      const cause=String(error.stderr??'').match(/ERROR: ([^\r\n]+)/)?.[1]??'assertion';
      console.error('[memberships:restore] FAIL: '+cause.replace(/"[^"]*"/g,'[identifier]').replace(/[A-Za-z0-9_@./:-]{20,}/g,'[redacted]'));
      throw new Error('Fixture restore failed');
    }
  }
};
