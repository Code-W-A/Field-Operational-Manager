import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import Module from "node:module";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw Error("Local emulator required");
test("catalog HTTP enforces role allowlists and validates payload; real service with isolated authentication", async () => {
  const app = initializeApp(
    { projectId: "demo-fom-catalog-http" },
    "catalog-http",
  );
  const db = getFirestore(app);
  (globalThis as any).__catalogDb = db;
  const mocks: Record<string, string> = {
    "@/lib/firebase/admin": `export const adminDb=globalThis.__catalogDb; export const adminAuth={getUser:async()=>({disabled:false})};`,
    "@/lib/auth/require-role": `export class RequireRoleError extends Error{constructor(message,status=403){super(message);this.status=status;}} export async function requireVerifiedRole(roles,request){const uid=request.headers.get('x-test-uid');if(!uid)throw new RequireRoleError('Neautentificat',401);const role=(await globalThis.__catalogDb.doc('users/'+uid).get()).data()?.role;if(!roles.includes(role))throw new RequireRoleError('Interzis',403);return{uid,role};}`,
  };
  try {
    for (const role of ["admin", "dispecer", "tehnician", "client"])
      await db.doc(`users/${role}`).set({ role });
    await db.doc("users/disabled").set({ role: "admin", disabled: true });
    const output = await build({
      entryPoints: ["app/api/equipment-catalog/route.ts"],
      bundle: true,
      write: false,
      platform: "node",
      format: "cjs",
      packages: "external",
      plugins: [
        {
          name: "auth-test",
          setup(b) {
            b.onResolve({ filter: /.*/ }, (a) =>
              mocks[a.path] ? { path: a.path, namespace: "mock" } : undefined,
            );
            b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
              contents: mocks[a.path],
              loader: "js",
            }));
          },
        },
      ],
    });
    const mod = new (Module as any)(`${process.cwd()}/catalog-http-test.cjs`);
    mod.paths = (Module as any)._nodeModulePaths(process.cwd());
    mod._compile(
      output.outputFiles[0].text,
      `${process.cwd()}/catalog-http-test.cjs`,
    );
    const route = mod.exports;
    const req = (uid: string, body?: any) =>
      new NextRequest("http://localhost/api/equipment-catalog", {
        method: body ? "POST" : "GET",
        headers: { "x-test-uid": uid, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await route.GET(req(""))).status, 401);
    assert.equal((await route.GET(req("client"))).status, 403);
    assert.equal((await route.GET(req("tehnician"))).status, 200);
    assert.equal((await route.GET(req("disabled"))).status, 403);
    assert.equal(
      (await route.POST(req("tehnician", { kind: "models", name: "X" })))
        .status,
      403,
    );
    assert.equal(
      (await route.POST(req("admin", { kind: "invalid", name: "X" }))).status,
      400,
    );
    assert.equal(
      (await route.POST(req("admin", { kind: "models", name: {} }))).status,
      400,
    );
    for (const role of ["admin", "dispecer"])
      assert.equal(
        (await route.POST(req(role, { kind: "models", name: "M400" }))).status,
        200,
      );
    const data = await (await route.GET(req("tehnician"))).json();
    assert.equal(data.models.length, 1);
    assert.equal(data.models[0].name, "M400");
  } finally {
    delete (globalThis as any).__catalogDb;
    await deleteApp(app);
  }
});
