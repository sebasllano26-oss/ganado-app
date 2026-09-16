import test from "node:test";
import assert from "node:assert/strict";
import { createRuntime, diffRows, schemas } from "../server/runtime.mjs";
import { demoData } from "../server/demo.mjs";
test("demo exercises dashboard, animal file, planning and all operational readers", () => {
  const rt = createRuntime(demoData());
  for (const [fn, args] of [
    ["getDashboardFull", [{}]],
    ["listAnimales", [{}]],
    ["getAnimal", ["DEMO-001"]],
    ["getPlaneacion", [{}]],
    ["getTablero", [{}]],
    ["getNacimientos", []],
    ["getHistorialSanitario", []],
    ["listVentas", [{}]],
    ["getFinanzasCompleto", [{}]],
    ["listFacturas", [{}]],
    ["getLluvias", [{ anio: 2026 }]],
    ["listPrediosLotes", [false]],
  ])
    assert.ok(rt.call(fn, args), fn);
});
test("runtime isolation: mutating one request cannot affect another", () => {
  const a = createRuntime(demoData()),
    b = createRuntime(demoData());
  a.context.update("animales", "codigo", "DEMO-001", { peso_inicial: 999 });
  assert.notEqual(
    a.data.animales[0].peso_inicial,
    b.data.animales[0].peso_inicial,
  );
});
test("same-day measurement is rejected and unknown functions are inaccessible", () => {
  const rt = createRuntime(demoData());
  const m = rt.data.mediciones[0];
  const result = rt.call("saveMedicion", [
    { codigo: m.codigo, fecha: m.fecha, peso: 220 },
  ]);
  assert.equal(result.ok, false);
  assert.throws(() => rt.call("getAll", ["animales"]));
  assert.throws(() => rt.call("constructor", []));
});
test("renaming an animal carries its measurement relationships atomically", () => {
  const rt = createRuntime(demoData());
  const before = structuredClone(rt.data);
  assert.equal(rt.call("cambiarCodigo", ["DEMO-001", "NEW-001"]).ok, true);
  assert.ok(rt.data.mediciones.filter((m) => m.codigo === "NEW-001").length);
  const changes = diffRows(before, rt.data);
  assert.ok(changes.some((c) => c.remove && c.row.codigo === "DEMO-001"));
  assert.ok(
    changes.some((c) => c.table === "animales" && c.row.codigo === "NEW-001"),
  );
});
test("unchanged normalized snapshots have no writes", () => {
  const a = createRuntime(demoData()).data;
  assert.deepEqual(diffRows(a, structuredClone(a)), []);
  assert.equal(Object.keys(schemas).length, 10);
});
