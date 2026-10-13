import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as pause } from "node:timers/promises";

// These tests ERASE every table and file in the configured Supabase project
// and replace the admin account. Point .env at a separate, disposable test
// project and set SUPABASE_TEST_PROJECT=true to run them.
const enabled = process.env.SUPABASE_TEST_PROJECT === "true";

test(
  "production application workflows",
  {
    timeout: 180000,
    skip: enabled
      ? false
      : "set SUPABASE_TEST_PROJECT=true with a disposable Supabase project",
  },
  async (t) => {
  assert.ok(existsSync(".next/BUILD_ID"), "Run npm run build first.");
  const { supabase, BUCKET } = await import("../lib/supabase.mjs"),
    { passwordHash } = await import("../lib/security.mjs");
  const sb = supabase();
  async function bucketFiles() {
    const { data, error } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
    assert.ifError(error);
    return data.filter((f) => f.id).map((f) => f.name);
  }
  // start from an empty project
  for (const [table, key] of [
    ["groups", "id"],
    ["assets", "id"],
    ["entries", "id"],
    ["messages", "id"],
    ["sessions", "token"],
    ["limits", "key"],
  ])
    assert.ifError((await sb.from(table).delete().neq(key, "__none__")).error);
  assert.ifError((await sb.from("settings").delete().eq("id", 1)).error);
  const leftovers = await bucketFiles();
  if (leftovers.length) await sb.storage.from(BUCKET).remove(leftovers);

  const password = "Portfolio test password 123!",
    changed = "Updated test password 456!";
  assert.ifError(
    (
      await sb.from("admin").upsert({
        id: 1,
        email: "admin@example.test",
        password: await passwordHash(password),
      })
    ).error,
  );
  const listener = createServer();
  await new Promise((r) => listener.listen(0, "127.0.0.1", r));
  const port = listener.address().port;
  await new Promise((r) => listener.close(r));
  const base = `http://127.0.0.1:${port}`;
  let output = "";
  const server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_ORIGIN: base,
        TRUST_PROXY: "false",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (v) => (output += v));
  server.stderr.on("data", (v) => (output += v));
  t.after(async () => {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((r) => server.once("exit", r)),
      pause(3000),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(base + "/admin/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await pause(250);
  }
  assert.ok(ready, output);
  let cookie = "",
    gid,
    gid2,
    a1,
    a2;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cS2cAAAAASUVORK5CYII=",
    "base64",
  );
  async function req(url, method = "GET", data, auth = true, origin = base) {
    const headers = {};
    if (auth && cookie) headers.Cookie = cookie;
    if (method !== "GET") headers.Origin = origin;
    let body;
    if (Buffer.isBuffer(data)) body = data;
    else if (data) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    }
    return fetch(base + url, { method, headers, body, redirect: "manual" });
  }
  async function ok(url, method = "GET", data) {
    const r = await req(url, method, data),
      v = await r.json();
    assert.ok(r.ok, JSON.stringify(v));
    return v;
  }
  await t.test(
    "public site renders and admin access requires authentication",
    async () => {
      assert.match(await (await req("/")).text(), /Esaint Mjay/);
      assert.equal((await req("/api/admin")).status, 401);
      assert.equal((await req("/admin")).status, 307);
      assert.equal(
        (await req("/api/admin/groups", "POST", { name: "No" })).status,
        401,
      );
    },
  );
  await t.test("login and cross-origin write protection", async () => {
    assert.equal(
      (
        await req("/api/auth", "POST", {
          email: "admin@example.test",
          password: "wrong",
        })
      ).status,
      401,
    );
    const r = await req("/api/auth", "POST", {
      email: "admin@example.test",
      password,
    });
    assert.equal(r.status, 200);
    const h = r.headers.get("set-cookie");
    assert.match(h, /HttpOnly/i);
    assert.match(h, /SameSite=strict/i);
    cookie = h.split(";")[0];
    assert.equal(
      (
        await req(
          "/api/admin/groups",
          "POST",
          { name: "No" },
          true,
          "https://evil.example",
        )
      ).status,
      403,
    );
  });
  await t.test(
    "separate groups, draft previews, duplicate-slug validation",
    async () => {
      gid = (
        await ok("/api/admin/groups", "POST", {
          name: "Company Alpha",
          slug: "company-alpha",
        })
      ).id;
      gid2 = (
        await ok("/api/admin/groups", "POST", {
          name: "Company Beta",
          slug: "company-beta",
        })
      ).id;
      assert.equal(
        (await req("/work/company-alpha", "GET", null, false)).status,
        404,
      );
      assert.equal((await req("/work/company-alpha")).status, 200);
      assert.equal(
        (
          await req("/api/admin/groups", "POST", {
            name: "Duplicate",
            slug: "company-alpha",
          })
        ).status,
        400,
      );
    },
  );
  await t.test("group uploads and private draft media", async () => {
    a1 = (
      await ok(
        `/api/admin/upload?kind=work&groupId=${gid}&name=first.png`,
        "POST",
        png,
      )
    ).id;
    a2 = (
      await ok(
        `/api/admin/upload?kind=work&groupId=${gid}&name=second.png`,
        "POST",
        png,
      )
    ).id;
    assert.equal((await req(`/media/${a1}`, "GET", null, false)).status, 404);
    const draft = await req(`/media/${a1}`);
    assert.equal(draft.status, 200);
    assert.equal(draft.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await draft.arrayBuffer()), png);
    const d = await ok("/api/admin");
    assert.equal(d.groups.find((g) => g.id === gid).image_count, 2);
    assert.equal(d.groups.find((g) => g.id === gid2).image_count, 0);
    assert.equal(
      (
        await req(
          `/api/admin/upload?kind=work&groupId=${gid}&name=bad.svg`,
          "POST",
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        )
      ).status,
      400,
    );
  });
  await t.test(
    "image editing/order, cover ownership, public gallery rendering",
    async () => {
      await ok("/api/admin/assets/" + a1, "PUT", {
        title: "Identity artwork",
        alt: "<script>alert(1)</script>",
        caption: "Visual identity",
        sort_order: 0,
      });
      await ok("/api/admin/reorder", "POST", {
        resource: "assets",
        ids: [a2, a1],
      });
      assert.equal(
        (await ok("/api/admin")).assets.filter((a) => a.group_id === gid)[0].id,
        a2,
      );
      assert.equal(
        (
          await req("/api/admin/groups/" + gid2, "PUT", {
            name: "Company Beta",
            slug: "company-beta",
            cover_id: a1,
          })
        ).status,
        400,
      );
      await ok("/api/admin/groups/" + gid, "PUT", {
        name: "Company Alpha",
        slug: "company-alpha",
        published: true,
        cover_id: a1,
      });
      const r = await req("/work/company-alpha", "GET", null, false);
      assert.equal(r.status, 200, output);
      const h = await r.text();
      assert.match(h, /Identity artwork/);
      assert.doesNotMatch(h, /<script>alert\(1\)<\/script>/);
      assert.equal((await req(`/media/${a1}`, "GET", null, false)).status, 200);
      const home = await req("/");
      assert.equal(home.status, 200, output);
    },
  );
  await t.test(
    "CV replacement/download/removal and portrait upload",
    async () => {
      const pdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
      );
      const first = (
        await ok("/api/admin/upload?kind=cv&name=cv.pdf", "POST", pdf)
      ).id;
      assert.match(
        (await req("/media/" + first, "GET", null, false)).headers.get(
          "content-disposition",
        ),
        /attachment/,
      );
      const second = (
        await ok("/api/admin/upload?kind=cv&name=new.pdf", "POST", pdf)
      ).id;
      assert.equal(
        (await req("/media/" + first, "GET", null, false)).status,
        404,
      );
      await ok("/api/admin/assets/" + second, "DELETE");
      assert.equal((await ok("/api/admin")).settings.cvId, "");
      const portrait = (
        await ok("/api/admin/upload?kind=portrait&name=me.png", "POST", png)
      ).id;
      assert.equal((await ok("/api/admin")).settings.portraitId, portrait);
      await ok("/api/admin/assets/" + portrait, "DELETE");
    },
  );
  await t.test(
    "editable settings, safe social links, service/article CRUD",
    async () => {
      await ok("/api/admin/settings", "PUT", {
        heroTitle: "Design with intention.",
      });
      assert.match(await (await req("/")).text(), /Design with intention/);
      assert.equal(
        (
          await req("/api/admin/settings", "PUT", {
            socialLinks: [{ label: "Bad", url: "javascript:alert(1)" }],
          })
        ).status,
        400,
      );
      await ok("/api/admin/entries", "POST", {
        kind: "service",
        title: "Brand identity",
        body: "Visual systems",
        published: true,
      });
      await ok("/api/admin/entries", "POST", {
        kind: "article",
        title: "Design story",
        body: "A paragraph.",
        published: false,
      });
      const id = (await ok("/api/admin")).entries.find(
        (e) => e.kind === "article",
      ).id;
      assert.equal(
        (await req("/journal/" + id, "GET", null, false)).status,
        404,
      );
      await ok("/api/admin/entries/" + id, "PUT", {
        kind: "article",
        title: "Design story",
        body: "A paragraph.",
        published: true,
      });
      assert.equal(
        (await req("/journal/" + id, "GET", null, false)).status,
        200,
      );
      await ok("/api/admin/entries/" + id, "DELETE");
      assert.equal(
        (await req("/journal/" + id, "GET", null, false)).status,
        404,
      );
    },
  );
  await t.test(
    "contact inbox storage, read status, deletion and honeypot",
    async () => {
      await ok("/api/contact", "POST", {
        name: "Visitor",
        email: "visitor@example.test",
        subject: "Project",
        message: "Let us discuss design.",
      });
      const m = (await ok("/api/admin")).messages[0];
      assert.equal(m.is_read, false);
      await ok("/api/admin/messages/" + m.id, "PUT", { is_read: true });
      assert.equal((await ok("/api/admin")).messages[0].is_read, true);
      await ok("/api/admin/messages/" + m.id, "DELETE");
      await ok("/api/contact", "POST", { website: "spam" });
      assert.equal((await ok("/api/admin")).messages.length, 0);
    },
  );
  await t.test(
    "unpublishing blocks subsequent public page and image access",
    async () => {
      await ok("/api/admin/groups/" + gid, "PUT", {
        name: "Company Alpha",
        slug: "company-alpha",
        published: false,
      });
      assert.equal(
        (await req("/work/company-alpha", "GET", null, false)).status,
        404,
      );
      assert.equal((await req("/media/" + a1, "GET", null, false)).status, 404);
      assert.match(
        (await req("/media/" + a1)).headers.get("cache-control"),
        /no-store/,
      );
    },
  );
  await t.test(
    "group deletion removes image records and actual files",
    async () => {
      await ok("/api/admin/groups/" + gid, "DELETE");
      assert.equal(
        (await ok("/api/admin")).assets.some((a) => a.group_id === gid),
        false,
      );
      assert.equal(
        (await bucketFiles()).some(
          (f) => f.startsWith(a1) || f.startsWith(a2),
        ),
        false,
      );
    },
  );
  await t.test(
    "password changes revoke sessions; logout revokes the new session",
    async () => {
      await ok("/api/admin/password", "PUT", {
        current: password,
        password: changed,
        email: "admin@example.test",
      });
      assert.equal((await req("/api/admin")).status, 401);
      assert.equal(
        (
          await req("/api/auth", "POST", {
            email: "admin@example.test",
            password,
          })
        ).status,
        401,
      );
      const r = await req("/api/auth", "POST", {
        email: "admin@example.test",
        password: changed,
      });
      assert.equal(r.status, 200);
      cookie = r.headers.get("set-cookie").split(";")[0];
      await ok("/api/auth", "DELETE");
      assert.equal((await req("/api/admin")).status, 401);
    },
  );
  await t.test("contact form is rate limited per window", async () => {
    // 2 submissions were already made above; the limit is 5 per 15 minutes
    const codes = [];
    for (let i = 0; i < 4; i++)
      codes.push(
        (await req("/api/contact", "POST", { website: "spam" }, false)).status,
      );
    assert.deepEqual(codes, [200, 200, 200, 429]);
  });
  },
);
