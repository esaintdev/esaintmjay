import test from "node:test";
import assert from "node:assert/strict";
import {
  passwordHash,
  verifyPassword,
  safeUrl,
  email,
  text,
  fileType,
  readBody,
  HttpError,
} from "../lib/security.ts";
test("salted password hashes verify only the original password", async () => {
  const a = await passwordHash("Long test password 123!"),
    b = await passwordHash("Long test password 123!");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("Long test password 123!", a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  await assert.rejects(() => passwordHash("short"));
});
test("unsafe links and invalid form input are rejected", () => {
  assert.throws(() => safeUrl("javascript:alert(1)"));
  assert.throws(() => safeUrl("data:text/html,hello"));
  assert.equal(safeUrl("https://example.com/"), "https://example.com/");
  assert.throws(() => email("invalid"));
  assert.throws(() => text("123456", 5));
});
test("uploads are identified from bytes and SVG is rejected", () => {
  assert.equal(
    fileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    null,
  );
  assert.equal(
    fileType(Buffer.from("%PDF-1.7\nExample PDF bytes"))?.mime,
    "application/pdf",
  );
});
test("streaming size limits work without Content-Length", async () => {
  const r = new Request("http://localhost", {
    method: "POST",
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(100));
        c.close();
      },
    }),
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    () => readBody(r, 50),
    (e) => e instanceof HttpError && e.status === 413,
  );
});
