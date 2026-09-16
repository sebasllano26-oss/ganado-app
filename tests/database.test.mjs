import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
const userA = "00000000-0000-4000-8000-000000000001",
  userB = "00000000-0000-4000-8000-000000000002";
test("database: migration, tenant isolation, subscription enforcement, transactions and RLS", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;grant usage on schema public,auth to authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant execute on function auth.uid() to authenticated;insert into auth.users values('${userA}'),('${userB}');`,
    );
    const initial = fs.readFileSync(
      new URL(
        "../supabase/migrations/20260915202332_ganax_cloud_initial.sql",
        import.meta.url,
      ),
      "utf8",
    );
    // PGlite exercises the application schema; Supabase owns the storage schema.
    await db.exec(initial.split("commit;")[0] + "commit;");
    await db.exec(
      fs.readFileSync(
        new URL(
          "../supabase/migrations/20260915202723_ganax_record_validation.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
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
    assert.equal(
      (await db.query("select * from public.organizaciones")).rows.length,
      1,
    );
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
  } finally {
    await db.close();
  }
});
