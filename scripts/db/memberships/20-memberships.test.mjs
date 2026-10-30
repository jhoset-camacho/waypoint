import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export default async ({sql,api,users,createUser}) => {
  let phase='fixtures';
  const check=(ok)=>assert(ok,`memberships: ${phase}`);
  try {
    const [a1,b1]=users;
    const [a2,a3,a4,c]=await Promise.all(Array.from({length:4},()=>createUser()));
    const A=randomUUID(),B=randomUUID(),extra=randomUUID(),a2person=randomUUID(),a3person=randomUUID();
    const id=(kind,value)=>kind+'_'+value.replaceAll('-','');
    // Only privileged fixture setup opens the capability, in a transaction that
    // closes it before any HTTP request. No client INSERT grant is introduced.
    sql(`BEGIN;
      UPDATE private.schema_capabilities SET enabled=true WHERE name='trip_bootstrap_v1_ready';
      SELECT set_config('request.jwt.claim.sub','${a1.id}',true);
      INSERT INTO public.trips(id,user_id,title,contract_id) VALUES ('${A}','${a1.id}','Fixture A','trip_tokyo');
      SELECT set_config('request.jwt.claim.sub','${b1.id}',true);
      INSERT INTO public.trips(id,user_id,title,contract_id) VALUES ('${B}','${b1.id}','Fixture B','trip_other');
      INSERT INTO public.travelers(id,trip_id,name,role,contract_id) VALUES
        ('${a2person}','${A}','Coorganizer','friend','person_jhoset'),
        ('${a3person}','${A}','Participant','friend','person_carms'),
        ('${extra}','${A}','Without account','child','person_lucian');
      INSERT INTO public.trip_memberships(trip_id,user_id,traveler_id,role,created_by_user_id) VALUES
        ('${A}','${a2.id}','${a2person}','organizer','${a1.id}'),
        ('${A}','${a3.id}','${a3person}','participant','${a1.id}'),
        ('${A}','${a4.id}',NULL,'viewer','${a1.id}');
      UPDATE private.schema_capabilities SET enabled=false WHERE name='trip_bootstrap_v1_ready';
      COMMIT;
      NOTIFY pgrst, 'reload schema';`);
    // NOTIFY is asynchronous; retry only a stale schema cache, bounded, no assertions retried.
    for(let n=0;n<20;n++) {
      const ready=await api(a1,'trip_memberships?select=id&limit=0');
      if(ready.status===200) break;
      check(ready.body?.code==='PGRST205');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    phase='real JWT role matrix';
    for(const [actor,trip,members,people] of [[a1,A,4,4],[a2,A,4,4],[a3,A,4,4],[a4,A,4,4],[b1,B,1,1],[c,null,0,0]]) {
      const trips=await api(actor,'trips?select=id&order=id');
      check(trips.status===200); check(JSON.stringify(trips.body)===JSON.stringify(trip?[{id:trip}]:[]));
      const memberships=await api(actor,'trip_memberships?select=id,trip_id');
      const travelers=await api(actor,'travelers?select=id,trip_id');
      check(memberships.status===200 && memberships.body.length===members && memberships.body.every(r=>r.trip_id===trip));
      check(travelers.status===200 && travelers.body.length===people && travelers.body.every(r=>r.trip_id===trip));
      const foreign=trip===B?A:B;
      for(const path of [`trips?id=eq.${foreign}&select=id`,`trips?contract_id=eq.${foreign===A?'trip_tokyo':'trip_other'}&select=id`,
        `travelers?trip_id=eq.${foreign}&select=id`,`trip_memberships?trip_id=eq.${foreign}&select=id`,
        'trips?contract_id=eq.nonexistent&select=id',`trips?contract_id=eq.${A}&select=id`,
        'trips?contract_id=eq.person_jhoset&select=id','travelers?contract_id=eq.trip_tokyo&select=id']) {
        const response=await api(actor,path); check(response.status===200 && response.body.length===0);
      }
      for(const table of ['trips','travelers','trip_memberships']) {
        for(const [method,body] of [['POST',{}],['PATCH',{role:'organizer'}],['DELETE',undefined]]) {
          if(table!=='trip_memberships' && method==='PATCH') continue;
          const result=await api(actor,table+(method==='POST'?'':`?${table==='trips'?'id':'trip_id'}=eq.${A}`),{method,body});
          // PATCH uses only existing columns so permission checking is the controlled stage.
          check([401,403].includes(result.status) && result.body.code==='42501');
        }
      }
    }
    for(const actor of [a1,a2,a3,a4,b1,c]) for(const table of ['trips','travelers']) {
      const result=await api(actor,table+`?${table==='trips'?'id':'trip_id'}=eq.${A}`,{method:'PATCH',body:{contract_id:'client_supplied'}});
      check([401,403].includes(result.status) && result.body.code==='42501');
    }
    for(const table of ['trips','travelers','trip_memberships']) {
      const denied=await api('anon',table+'?select=id');
      check([401,403].includes(denied.status) && denied.body.code==='42501');
    }
    phase='private helper role semantics (structural SQL, not JWT evidence)';
    for(const [actor,role,converse] of [[a1,'organizer','t'],[a2,'organizer','t'],[a3,'participant','t'],[a4,'viewer','f'],[c,'','f']]) {
      const result=sql(`BEGIN; SELECT set_config('request.jwt.claim.sub','${actor.id}',true);
        SELECT coalesce(private.trip_role('${A}'),'')||'|'||private.can_converse('${A}')::text; ROLLBACK;`);
      check(result.includes(`${role}|${converse==='t'?'true':'false'}`));
    }
    phase='legacy creator is not authority';
    sql(`UPDATE public.trips SET user_id='${c.id}' WHERE id='${A}';`);
    check((await api(c,`trips?id=eq.${A}&select=id`)).body.length===0);
    for(const key of [A,B,randomUUID()]) {
      const compatibility=await api(c,'rpc/is_trip_owner',{method:'POST',body:{p_trip_id:key}});
      check(compatibility.status===200 && compatibility.body===false);
    }
    const anonymousCompatibility=await api('anon','rpc/is_trip_owner',{method:'POST',body:{p_trip_id:A}});
    check([401,403].includes(anonymousCompatibility.status) && anonymousCompatibility.body.code==='42501');

    check((await api(a1,`trips?id=eq.${A}&select=id`)).body.length===1);
    phase='42501 before guard / 55000 privileged second barrier';
    const refused=randomUUID();
    for(const actor of [a1,a2,a3,a4,b1,c,'anon']) {
      const result=await api(actor,'trips',{method:'POST',body:{id:refused,user_id:actor==='anon'?a1.id:actor.id,title:'Denied'}});
      check([401,403].includes(result.status) && result.body.code==='42501');
    }
    // Instrument trigger reach using a nontransactional sequence: zero advances
    // proves authenticated POST never ran the BEFORE trigger.
    sql(`CREATE SEQUENCE private.p03_guard_probe MINVALUE 0 START 0;
      CREATE FUNCTION private.p03_guard_probe() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
        PERFORM pg_catalog.nextval('private.p03_guard_probe'); RETURN NEW; END $$;
      REVOKE ALL ON FUNCTION private.p03_guard_probe() FROM PUBLIC,anon,authenticated,service_role;
      CREATE TRIGGER trg_00_a_probe BEFORE INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION private.p03_guard_probe();`);
    const denied=await api(c,'trips',{method:'POST',body:{id:refused,user_id:c.id,title:'Denied'}});
    check(denied.body.code==='42501');
    check(sql('SELECT is_called FROM private.p03_guard_probe;').trim()==='f');
    sql(`DO $$ BEGIN
      BEGIN SET LOCAL ROLE service_role;
        INSERT INTO public.trips(id,user_id,title) VALUES ('${refused}','${c.id}','Denied');
        RAISE EXCEPTION 'Privileged insert unexpectedly succeeded';
      EXCEPTION WHEN SQLSTATE '55000' THEN RESET ROLE; END;
      IF EXISTS (SELECT 1 FROM public.trips WHERE id='${refused}') OR EXISTS (SELECT 1 FROM public.travelers WHERE trip_id='${refused}') OR EXISTS (SELECT 1 FROM public.trip_memberships WHERE trip_id='${refused}') THEN RAISE EXCEPTION 'Partial denial'; END IF;
      END $$;`);
    check(sql('SELECT is_called FROM private.p03_guard_probe;').trim()==='t');
    sql('DROP TRIGGER trg_00_a_probe ON public.trips; DROP FUNCTION private.p03_guard_probe(); DROP SEQUENCE private.p03_guard_probe;');
    console.log('[memberships:gate] PASS: real JWT 42501 before trigger; service_role 55000 at guard; zero trip/traveler/membership rows');
    phase='private helpers inaccessible via Data API';
    for(const actor of [a1,c,'anon']) for(const helper of ['trip_role','is_trip_member','can_converse','bootstrap_trip_core','guard_trip_creation']) {
      const result=await api(actor,'rpc/'+helper,{method:'POST',body:{p_trip_id:A}});
      check([401,403,404].includes(result.status));
    }
    phase='catalog constraints, identifiers and last organizer';
    const a1person=sql(`SELECT traveler_id FROM public.trip_memberships WHERE trip_id='${A}' AND user_id='${a1.id}';`).trim();
    check(sql(`SELECT contract_id FROM public.travelers WHERE id='${a1person}';`).trim()===id('person',a1person));
    const expect=(statement,code)=>sql(`DO $$ BEGIN BEGIN ${statement}; RAISE EXCEPTION 'Expected ${code}'; EXCEPTION WHEN SQLSTATE '${code}' THEN NULL; END; END $$;`);
    expect(`UPDATE public.trips SET contract_id='changed' WHERE id='${A}'`,'23514');
    expect(`UPDATE public.travelers SET contract_id='changed' WHERE id='${extra}'`,'23514');
    expect(`UPDATE public.trip_memberships SET traveler_id='${extra}' WHERE trip_id='${B}'`,'23503');
    expect(`UPDATE public.trip_memberships SET role='invalid' WHERE user_id='${a3.id}'`,'23514');
    expect(`UPDATE public.trip_memberships SET traveler_id=NULL WHERE user_id='${a3.id}'`,'23514');
    expect(`UPDATE public.trip_memberships SET removed_at=now() WHERE user_id='${a3.id}'`,'23514');
    expect(`INSERT INTO public.trip_memberships(trip_id,user_id,role) VALUES ('${A}','${a4.id}','viewer')`,'23505');
    expect(`INSERT INTO public.trip_memberships(trip_id,user_id,traveler_id,role) VALUES ('${A}','${c.id}','${a3person}','participant')`,'23505');
    expect(`UPDATE public.trip_memberships SET role='viewer' WHERE trip_id='${B}'`,'23514');
    expect(`UPDATE public.trip_memberships SET status='removed',removed_at=now() WHERE trip_id='${B}'`,'23514');
    expect(`DELETE FROM public.trip_memberships WHERE trip_id='${B}'`,'23514');
    sql(`BEGIN; UPDATE public.trip_memberships SET role='viewer' WHERE trip_id='${A}' AND user_id='${a2.id}';
      DO $$ BEGIN BEGIN UPDATE public.trip_memberships SET role='viewer' WHERE trip_id='${A}' AND user_id='${a1.id}'; RAISE EXCEPTION 'Last organizer allowed'; EXCEPTION WHEN check_violation THEN NULL; END; END $$; ROLLBACK;`);
    for(const value of ['', 'x'.repeat(161)]) expect(`INSERT INTO public.travelers(trip_id,name,contract_id) VALUES ('${A}','Fixture','${value}')`,'23514');
    expect(`INSERT INTO public.travelers(trip_id,name,contract_id) VALUES ('${A}','Fixture','person_jhoset')`,'23505');
    sql(`BEGIN; INSERT INTO public.travelers(trip_id,name,contract_id) VALUES ('${A}','One','x'),('${A}','Max','${'x'.repeat(160)}'); ROLLBACK;`);
    // A non-prefix ID is valid; lookups stay exact, scoped by the row's trip.
    check((await api(a1,'travelers?contract_id=eq.person_jhoset&select=id')).body[0]?.id===a2person);
    check((await api(b1,'travelers?contract_id=eq.person_jhoset&select=id')).body.length===0);
    phase='removed membership loses access immediately';
    sql(`UPDATE public.trip_memberships SET status='removed',removed_at=now() WHERE trip_id='${A}' AND user_id='${a3.id}';`);
    check((await api(a3,'trips?select=id')).body.length===0);
    check((await api(a3,'trip_memberships?select=id')).body.length===0);
    sql(`UPDATE public.trip_memberships SET status='active',removed_at=NULL WHERE trip_id='${A}' AND user_id='${a3.id}';`);
    phase='bootstrap idempotence and atomic rollback';
    const successful=randomUUID(),failed=randomUUID(),mismatch=randomUUID();
    sql(`BEGIN; UPDATE private.schema_capabilities SET enabled=true;
      SELECT set_config('request.jwt.claim.sub','${c.id}',true);
      DO $$ DECLARE bad text; BEGIN
        FOREACH bad IN ARRAY ARRAY['',repeat('x',161)] LOOP
          BEGIN INSERT INTO public.trips(user_id,title,contract_id) VALUES ('${c.id}','Invalid contract ID',bad);
            RAISE EXCEPTION 'Invalid trip contract ID allowed'; EXCEPTION WHEN check_violation THEN NULL; END;
        END LOOP;
        BEGIN INSERT INTO public.trips(user_id,title,contract_id) VALUES ('${c.id}','Duplicate contract ID','trip_tokyo');
          RAISE EXCEPTION 'Duplicate trip contract ID allowed'; EXCEPTION WHEN unique_violation THEN NULL; END;
      END $$;
      CREATE TRIGGER trg_11_core_repeat AFTER INSERT ON public.trips FOR EACH ROW EXECUTE FUNCTION private.bootstrap_trip_core();
      INSERT INTO public.trips(id,user_id,title) VALUES ('${successful}','${c.id}','Core repeat');
      DO $$ BEGIN IF (SELECT count(*) FROM public.travelers WHERE trip_id='${successful}')<>1 OR
        (SELECT count(*) FROM public.trip_memberships WHERE trip_id='${successful}' AND role='organizer')<>1 THEN RAISE EXCEPTION 'Duplicate core'; END IF; END $$;
      DROP TRIGGER trg_11_core_repeat ON public.trips;
      ALTER TABLE public.trip_memberships ADD CONSTRAINT p03_injected_failure CHECK(trip_id<>'${failed}');
      DO $$ BEGIN BEGIN INSERT INTO public.trips(id,user_id,title) VALUES ('${failed}','${c.id}','Injected fail');
        RAISE EXCEPTION 'Failure injection missed'; EXCEPTION WHEN check_violation THEN NULL; END;
        BEGIN INSERT INTO public.trips(id,user_id,title) VALUES ('${mismatch}','${a1.id}','Wrong creator');
        RAISE EXCEPTION 'Wrong creator allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        IF EXISTS(SELECT 1 FROM public.trips WHERE id IN ('${failed}','${mismatch}')) OR
          EXISTS(SELECT 1 FROM public.travelers WHERE trip_id IN ('${failed}','${mismatch}')) OR
          EXISTS(SELECT 1 FROM public.trip_memberships WHERE trip_id IN ('${failed}','${mismatch}')) THEN RAISE EXCEPTION 'Partial bootstrap'; END IF;
      END $$; ROLLBACK;`);
    check(sql("SELECT enabled FROM private.schema_capabilities WHERE name='trip_bootstrap_v1_ready';").trim()==='f');
    check(sql("SELECT has_table_privilege('authenticated','public.trips','INSERT');").trim()==='f');
    sql(`DELETE FROM public.trips WHERE id IN ('${A}','${B}');`);
    console.log('[memberships:jwt] PASS: A1/A2/A3/A4/B1/C/anon, exact IDs, direct DML denied, removal, owner is not authority');
    console.log('[memberships:core] PASS: constraints, last organizer, repeated bootstrap, injected rollback, capability/grant remain closed');
  } catch {
    // Do not render Auth errors, SQL exception objects or HTTP bodies.
    console.error(`[memberships] FAIL: ${phase}`);
    throw new Error('Membership suite failed; sensitive details suppressed');
  }
};
