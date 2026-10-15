import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { build } from "esbuild";
import Module from "node:module";
import { technicianService } from "../../lib/technician/service";
import { mobileAccessService } from "../../lib/mobile/access";
import { MOBILE_TERMS_VERSION } from "../../packages/fom-domain";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw Error("Local emulator only");
const prefix = `history-${Date.now()}`;
const code = `H${Date.now().toString().slice(-6)}`;
const app = initializeApp({ projectId: "demo-fom-mobile-auth" }, prefix);
const db = getFirestore(app);
const service = technicianService(db);
let route: any;
const kinds = [
  "Intervenție",
  "Intervenție în garanție",
  "Revizie",
  "Instalare",
];
before(async () => {
  await db
    .doc(`users/${prefix}`)
    .set({ role: "tehnician", displayName: prefix });
  await db.doc(`users/${prefix}-no-terms`).set({ role: "tehnician" });
  await db.doc(`users/${prefix}-client`).set({ role: "client" });
  await mobileAccessService(db).accept(prefix, {
    version: MOBILE_TERMS_VERSION,
    accepted: true,
  });
  await db
    .doc(`attendance/${prefix}`)
    .set({ userId: prefix, status: "active", sessionStart: new Date() });
  await db.doc(`clienti/${prefix}`).set({
    nume: "Client istoric",
    privateAccountNotes: "PRIVATE-CLIENT",
    locatii: [
      {
        id: "loc",
        nume: "Sediu",
        echipamente: [{ id: "eq", cod: code, denumire: "Barieră" }],
      },
    ],
  });
  for (const [i, tipLucrare] of kinds.entries()) {
    await db.doc(`lucrari/${prefix}-${i}`).set({
      clientId: prefix,
      client: "Client istoric",
      locationId: "loc",
      locatie: "Sediu",
      equipmentId: "eq",
      equipmentIds: ["eq"],
      echipamentCod: code,
      echipament: "Barieră",
      nrLucrare: `#00${i}`,
      tipLucrare,
      statusLucrare: i ? "Atribuită" : "Finalizată",
      tehnicieni: ["Alt tehnician", "Al doilea tehnician"], // Deliberately not assigned to the caller.
      dataEmiterii: `2026-10-${10 + i}`,
      ...(i ? { dataInterventie: `2026-10-${10 + i}` } : {}),
      timpSosire: Timestamp.fromDate(new Date("2026-10-10T08:00:00Z")),
      timpPlecare: Timestamp.fromDate(new Date("2026-10-10T09:43:00Z")),
      raportGenerat: i === 0,
      numarRaport: "REPORT-123",
      defectReclamat: "Defect test",
      descriereInterventie: "Descriere lungă ".repeat(40),
      constatareLaLocatie: "Constatare",
      raportSnapshot: { secret: "PRIVATE-SNAPSHOT" },
      beneficiarSignature: "PRIVATE-SIGNATURE",
      internalCredentials: "PRIVATE-CREDENTIALS",
      ...(tipLucrare === "Instalare"
        ? {
            installation: {
              schemaVersion: 1,
              equipment: [
                {
                  id: "eq",
                  code,
                  name: "Barieră",
                  internalSecret: "PRIVATE-EQUIPMENT",
                },
              ],
            },
          }
        : {}),
    });
  }
  (globalThis as any).__historyDb = db;
  const mocks: Record<string, string> = {
    "@/lib/firebase/admin": `export const adminDb=globalThis.__historyDb; export const adminAuth={getUser:async()=>({disabled:false})};`,
    "@/lib/auth/require-role": `export class RequireRoleError extends Error {constructor(message,status=403){super(message);this.status=status;}} export async function requireVerifiedRole(roles,request){const uid=request.headers.get('x-test-uid');if(!uid)throw new RequireRoleError('Neautentificat',401);const role=(await globalThis.__historyDb.doc('users/'+uid).get()).data()?.role;if(!roles.includes(role))throw new RequireRoleError('Interzis',403);return {uid,role};}`,
  };
  const output = await build({
    entryPoints: ["app/api/mobile/history/[id]/route.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
    plugins: [
      {
        name: "isolated-identity",
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
  const module = new (Module as any)(`${process.cwd()}/history-route-test.cjs`);
  module.paths = (Module as any)._nodeModulePaths(process.cwd());
  module._compile(
    output.outputFiles[0].text,
    `${process.cwd()}/history-route-test.cjs`,
  );
  route = module.exports;
});
after(async () => {
  delete (globalThis as any).__historyDb;
  await deleteApp(app);
});
function get(uid = prefix, workId = `${prefix}-0`, historyCode = code) {
  return route.GET(
    new NextRequest(
      `http://localhost/api/mobile/history/${workId}?code=${encodeURIComponent(historyCode)}`,
      { headers: { "x-test-uid": uid } },
    ),
    { params: Promise.resolve({ id: workId }) },
  );
}
test("history lists all matching works, including unassigned and no-report, newest first", async () => {
  const records = await service.history(prefix, code);
  assert.deepEqual(
    records.map((w: any) => w.id),
    [3, 2, 1, 0].map((i) => `${prefix}-${i}`),
  );
  assert.equal(records[0].raportGenerat, false);
  assert.equal(records[3].nrLucrare, "#000");
  assert.equal(records[3].numarRaport, "REPORT-123");
  assert.equal(records[0].durataInterventie, "1h 43m");
  assert.deepEqual(records[0].tehnicieni, [
    "Alt tehnician",
    "Al doilea tehnician",
  ]);
  assert.equal(JSON.stringify(records).includes("PRIVATE-"), false);
  assert.deepEqual(await service.history(prefix, "UNKNOWN1"), []);
});
test("GET returns read-only details for all work types without leaking raw documents or writing to works", async () => {
  assert.equal(route.POST, undefined);
  for (const [i, kind] of kinds.entries()) {
    const ref = db.doc(`lucrari/${prefix}-${i}`),
      before = await ref.get();
    const response = await get(prefix, ref.id);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.work.tipLucrare, kind);
    assert.equal(data.work.mobileEquipment[0].name, "Barieră");
    assert.equal(JSON.stringify(data).includes("PRIVATE-"), false);
    assert.deepEqual((await ref.get()).data(), before.data());
  }
});
test("HTTP rejects missing authentication, wrong role, missing terms, wrong equipment, missing works and missing attendance", async () => {
  assert.equal((await get("")).status, 401);
  assert.equal((await get(`${prefix}-client`)).status, 403);
  const noTerms = await get(`${prefix}-no-terms`);
  assert.equal(noTerms.status, 403);
  assert.equal((await noTerms.json()).code, "MOBILE_TERMS_REQUIRED");
  assert.equal((await get(prefix, `${prefix}-0`, "OTHER1")).status, 403);
  assert.equal((await get(prefix, `${prefix}-missing`)).status, 403);
  assert.equal((await get(prefix, `${prefix}-0`, "")).status, 400);
  await db
    .doc(`attendance/${prefix}`)
    .update({ status: "completed", sessionEnd: new Date() });
  const response = await get();
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "MOBILE_ATTENDANCE_REQUIRED");
});
