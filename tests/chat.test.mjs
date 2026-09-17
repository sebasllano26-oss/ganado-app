import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/chat.mjs";

async function call(body, { method = "POST", headers = {} } = {}) {
  const out = { statusCode: 200, headers: {} };
  const res = {
    setHeader: (key, value) => (out.headers[key] = value),
    status: (code) => {
      out.statusCode = code;
      return res;
    },
    json: (data) => {
      out.body = data;
      return res;
    },
  };
  await handler({ method, body, headers }, res);
  return out;
}

test("assistant provides useful guidance in the public demo", async () => {
  const response = await call({
    demo: true,
    messages: [{ role: "user", content: "¿Cómo registro un animal?" }],
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body.reply, /Nuevo animal/i);
  assert.equal(response.body.mode, "guided");
});

test("assistant validates requests and protects private workspaces", async () => {
  assert.equal((await call({}, { method: "GET" })).statusCode, 405);
  assert.equal((await call({ demo: true, messages: [] })).statusCode, 400);
  assert.equal(
    (
      await call({
        org: "00000000-0000-4000-8000-000000000001",
        messages: [{ role: "user", content: "Resume mi hato" }],
      })
    ).statusCode,
    503,
  );
});
