import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/rpc.mjs";
async function call(body, method = "POST") {
  const out = { statusCode: 200, headers: {} };
  const res = {
    setHeader: (k, v) => (out.headers[k] = v),
    status: (n) => {
      out.statusCode = n;
      return res;
    },
    json: (data) => {
      out.body = data;
      return res;
    },
  };
  await handler({ method, body, headers: {} }, res);
  return out;
}
test("public demonstration exposes only fixed sample data and cannot write", async () => {
  const read = await call({ demo: true, fn: "listAnimales" });
  assert.equal(read.statusCode, 200);
  assert.equal(read.body.data.length, 28);
  assert.ok(read.body.data.every((a) => a.codigo.startsWith("DEMO-")));
  for (const fn of [
    "saveAnimal",
    "ganax_commit",
    "crearGanaderia",
    "cuenta",
    "exportarDatos",
    "constructor",
  ])
    assert.equal((await call({ demo: true, fn, args: [] })).statusCode, 403);
});
test("API rejects malformed inputs, unsupported verbs and missing authentication", async () => {
  assert.equal((await call({ fn: "listAnimales", args: {} })).statusCode, 400);
  assert.equal((await call({}, "GET")).statusCode, 405);
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  assert.equal((await call({ fn: "listAnimales" })).statusCode, 401);
});
