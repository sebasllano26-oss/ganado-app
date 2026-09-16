import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const userA = "00000000-0000-4000-8000-000000000001",
  userB = "00000000-0000-4000-8000-000000000002",
  userC = "00000000-0000-4000-8000-000000000003",
  userD = "00000000-0000-4000-8000-000000000004",
  userE = "00000000-0000-4000-8000-000000000005";
test("database: migration, tenant isolation, subscription enforcement, transactions and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb not null default '{}'::jsonb);create role anon;create role authenticated;grant usage on schema public,auth to authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to authenticated;insert into auth.users(id,email) values('${userA}','a@example.com'),('${userB}','b@example.com'),('${userE}','e@example.com');`,
    );
    const migrationsDir = fileURLToPath(
      new URL("../supabase/migrations/", import.meta.url),
    );
    for (const file of fs.readdirSync(migrationsDir).sort()) {
      let sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      // PGlite exercises the application schema; Supabase owns the storage schema.
      if (file.includes("cloud_initial"))
        sql = sql.split("commit;")[0] + "commit;";
      await db.exec(sql);
    }
    const asUser = async (id) => {
      await db.exec(
        `reset role;set request.jwt.claim.sub='${id}';set role authenticated;`,
      );
    };
    await asUser(userA);
    const orgA = (await db.query("select public.crear_ganaderia('Finca A') id"))
      .rows[0].id;
    await asUser(userB);
    const orgB = (await db.query("select public.crear_ganaderia('Finca B') id"))
      .rows[0].id;
    assert.notEqual(orgA, orgB);
    await asUser(userA);
    assert.equal(
      (
        await db.query(
          "select ganaderia_solicitada from public.perfiles where user_id=$1",
          [userA],
        )
      ).rows[0].ganaderia_solicitada,
      "Finca A",
    );
    await db.query("select public.actualizar_perfil('Persona A')");
    assert.equal(
      (await db.query("select nombre_mostrar from public.perfiles")).rows[0]
        .nombre_mostrar,
      "Persona A",
    );
    assert.equal(
      (
        await db.query("select * from public.perfiles where user_id=$1", [
          userB,
        ])
      ).rows.length,
      0,
    );
    await assert.rejects(
      () => db.query("update public.perfiles set nombre_mostrar='Otro'"),
      /permission denied/,
    );
    assert.equal(
      (await db.query("select * from public.organizaciones")).rows.length,
      1,
    );
    await asUser(userB);
    await assert.rejects(
      () => db.query("select public.ganax_snapshot($1)", [orgA]),
      /Acceso denegado/,
    );
    await asUser(userA);
    const changes = [
      {
        table: "animales",
        row: {
          codigo: "A1",
          estado: "ACTIVO",
          peso_inicial: 200,
          organizacion_id: orgB,
        },
      },
    ];
    await db.query("select public.ganax_commit($1,0,$2,'test')", [
      orgA,
      JSON.stringify(changes),
    ]);
    const rows = (await db.query("select * from public.animales")).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].organizacion_id, orgA);
    await assert.rejects(
      () =>
        db.query(
          "insert into public.animales(organizacion_id,codigo) values($1,'BYPASS')",
          [orgA],
        ),
      /permission denied/,
    );
    await assert.rejects(
      () => db.query("update public.suscripciones set estado='active'"),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        db.query("select public.ganax_commit($1,0,$2,'stale')", [
          orgA,
          JSON.stringify(changes),
        ]),
      /CONFLICT/,
    );
    await assert.rejects(
      () =>
        db.query("select public.ganax_commit($1,1,$2,'privilege')", [
          orgA,
          JSON.stringify([
            { table: "suscripciones", row: { estado: "active" } },
          ]),
        ]),
      /Tabla no permitida/,
    );
    await assert.rejects(
      () =>
        db.query("select public.ganax_commit($1,1,$2,'xss')", [
          orgA,
          JSON.stringify([
            {
              table: "animales",
              row: {
                codigo: "A2",
                estado: "ACTIVO",
                foto_url: "javascript:alert(1)",
              },
            },
          ]),
        ]),
      /Enlace de archivo inválido/,
    );
    await assert.rejects(
      () =>
        db.query("select public.ganax_commit($1,1,$2,'bad fk')", [
          orgA,
          JSON.stringify([
            {
              table: "mediciones",
              row: {
                id_medicion: "M1",
                codigo: "NO-EXISTE",
                fecha: "2026-09-15",
                peso: 200,
              },
            },
          ]),
        ]),
      /foreign key/,
    );
    assert.equal(
      (await db.query("select revision from public.organizaciones")).rows[0]
        .revision,
      1,
    );
    await db.exec(
      `reset role;update public.suscripciones set trial_ends_at=now()-interval '1 day' where organizacion_id='${orgA}';set role authenticated;`,
    );
    await assert.rejects(
      () =>
        db.query("select public.ganax_commit($1,1,$2,'expired')", [
          orgA,
          JSON.stringify(changes),
        ]),
      /no permite cambios/,
    );
    assert.ok(
      (await db.query("select public.ganax_snapshot($1) snapshot", [orgA]))
        .rows[0].snapshot.animales.length,
    );
    await asUser(userB);
    assert.equal(
      (await db.query("select * from public.animales")).rows.length,
      0,
    );

    await asUser(userE);
    const concurrent = await Promise.all([
      db.query("select public.crear_ganaderia('Finca concurrente') id"),
      db.query("select public.crear_ganaderia('Finca concurrente') id"),
    ]);
    assert.equal(concurrent[0].rows[0].id, concurrent[1].rows[0].id);
    assert.equal(
      (
        await db.query(
          "select count(*)::int total from public.organizaciones where owner_id=$1",
          [userE],
        )
      ).rows[0].total,
      1,
    );

    await asUser(userA);
    await db.query(
      "select public.invitar_miembro($1,'b@example.com','editor')",
      [orgA],
    );
    await asUser(userB);
    assert.equal(
      (
        await db.query(
          "select rol from public.miembros where organizacion_id=$1 and user_id=$2",
          [orgA, userB],
        )
      ).rows[0].rol,
      "editor",
    );
    await assert.rejects(
      () =>
        db.query(
          "update public.miembros set rol='viewer' where organizacion_id=$1 and user_id=$2",
          [orgA, userB],
        ),
      /permission denied/,
    );

    await db.exec("reset role;reset request.jwt.claim.sub");
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [
        userC,
        "propietaria@example.com",
        JSON.stringify({
          farm_name: "Ganadería La Esperanza",
          display_name: "María Pérez",
        }),
      ],
    );
    const provisioned = (
      await db.query(
        `select p.correo,p.nombre_mostrar,p.ganaderia_solicitada,o.id as org_id,m.rol,s.estado
         from public.perfiles p
         join public.organizaciones o on o.owner_id=p.user_id
         join public.miembros m on m.organizacion_id=o.id and m.user_id=p.user_id
         join public.suscripciones s on s.organizacion_id=o.id
         where p.user_id=$1`,
        [userC],
      )
    ).rows[0];
    assert.deepEqual(provisioned, {
      correo: "propietaria@example.com",
      nombre_mostrar: "María Pérez",
      ganaderia_solicitada: "Ganadería La Esperanza",
      org_id: provisioned.org_id,
      rol: "owner",
      estado: "trialing",
    });

    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
      [userD, null, JSON.stringify({ farm_name: "Ganadería sin correo" })],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int total from auth.users where id=$1",
          [userD],
        )
      ).rows[0].total,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int total from public.perfiles where user_id=$1",
          [userD],
        )
      ).rows[0].total,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int total from ganax_private.errores_alta where user_id=$1",
          [userD],
        )
      ).rows[0].total,
      1,
    );
    await assert.rejects(
      () =>
        db.query(
          "insert into public.organizaciones(nombre,owner_id) values('<b>Ganadería</b>',$1)",
          [userD],
        ),
      /texto simple/,
    );
  } finally {
    await db.close();
  }
});
