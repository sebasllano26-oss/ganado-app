import test from "node:test";
import assert from "node:assert/strict";
import { hasConfirmedEmail } from "../src/auth-session.js";

test("only sessions with a confirmed email can enter the application", () => {
  assert.equal(hasConfirmedEmail(null), false);
  assert.equal(
    hasConfirmedEmail({ user: { email: "new@example.com" } }),
    false,
  );
  assert.equal(
    hasConfirmedEmail({
      user: {
        email: "ready@example.com",
        email_confirmed_at: "2026-09-16T13:00:00.000Z",
      },
    }),
    true,
  );
});
