import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { versionOf } from "../../packages/fom-domain";
const enabled = process.env.FOM_TEST_HTTP === "true";
const uid = `web-http-${Date.now()}`, id = `${uid}-work`, base = "http://127.0.0.1:3000";
let app: any, db: any, token = "", seq = 0;
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=";
const headers = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
async function json(channel: string, body: any) {
  const r = await fetch(`${base}/api/${channel}/commands`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
async function command(action: string, payload: any = {}) {
  return { action, payload, entityId: id, mutationId: `${uid}-${++seq}`, occurredAt: new Date().toISOString(), baseVersion: versionOf((await db.doc(`lucrari/${id}`).get()).data()!) };
}
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8189");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9199");
  app = initializeApp({ projectId: "demo-fom-mobile-auth" }, uid); db = getFirestore(app);
  await getAuth(app).createUser({ uid, email: `${uid}@fom.test`, password: "FomTest123!", displayName: uid });
  await db.doc(`users/${uid}`).set({ uid, role: "tehnician", displayName: uid, email: `${uid}@fom.test` });
  await db.doc(`clienti/${uid}`).set({ nume: "Client HTTP web", locatii: [{ id: "loc", nume: "Sediu web", echipamente: [{ id: "eq", cod: "WEB-QR", denumire: "Unitate" }] }] });
  await db.doc(`lucrari/${id}`).set({ clientId: uid, client: "Client HTTP web", locationId: "loc", locatie: "Sediu web", equipmentId: "eq", echipamentCod: "WEB-QR", echipament: "Unitate", tehnicieni: [uid], statusLucrare: "Atribuită", tipLucrare: "Intervenție", updatedAt: Timestamp.now() });
  const response = await fetch("http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${uid}@fom.test`, password: "FomTest123!", returnSecureToken: true }) });
  token = (await response.json() as any).idToken; assert.ok(token);
});
after(async () => { if (app) await deleteApp(app); });

test("web gateway requires authenticated active technician", { skip: !enabled }, async () => {
  const c = await command("verify", { code: "WEB-QR" });
  const unauth = await fetch(`${base}/api/technician/commands`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
  assert.equal(unauth.status, 401);
  await db.doc(`users/${uid}`).update({ disabled: true });
  assert.equal((await json("technician", c)).status, 403);
  await db.doc(`users/${uid}`).update({ disabled: false });
});
test("web QR/save and mobile replay share receipts without requiring web attendance", { skip: !enabled }, async () => {
  const verified = await json("technician", await command("verify", { code: "WEB-QR" }));
  assert.equal(verified.status, 200, JSON.stringify(verified.data));
  const c = await command("intervention.save", { descriereInterventie: "Salvat din web", notaInternaTehnician: "Privat", cauzaPrincipalaDefectId: "uzura" });
  const web = await json("technician", c), mobile = await json("mobile", c);
  assert.equal(web.status, 200, JSON.stringify(web.data));
  assert.equal(mobile.status, 200, JSON.stringify(mobile.data));
  assert.deepEqual(web.data, mobile.data);
});
test("both upload gateways allocate the same owned file, and unready/foreign metadata is rejected", { skip: !enabled }, async () => {
  const fileId = `${uid}-photo`;
  async function upload(channel: string) {
    const form = new FormData(); form.set("fileId", fileId); form.set("workId", id); form.set("purpose", "photo");
    form.set("file", new File([Buffer.from(png, "base64")], "test.png", { type: "image/png" }));
    const r = await fetch(`${base}/api/${channel}/files`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: r.status, data: await r.json() };
  }
  const web = await upload("technician"), mobile = await upload("mobile");
  assert.equal(web.status, 200, JSON.stringify(web.data)); assert.equal(mobile.status, 200);
  assert.equal(web.data.url, mobile.data.url); assert.equal(web.data.path, mobile.data.path);
  const c = await command("intervention.save", { imaginiDefecte: [web.data] });
  assert.equal((await json("technician", c)).status, 200);
  const forged = await command("intervention.save", { imaginiDefecte: [{ ...web.data, url: "https://example.test/foreign.jpg" }] });
  assert.equal((await json("technician", forged)).status, 403);
});
test("web finalization persists before email and both gateways return the same immutable PDF", { skip: !enabled }, async () => {
  const c = await command("report.finalize", { numeBeneficiar: "Beneficiar", products: [{ name: "Serviciu", quantity: 1, price: 50 }] });
  const first = await json("technician", c);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(first.data.work.raportGenerat, true);
  assert.equal(first.data.work.raportSnapshot.notaInternaTehnician, undefined);
  assert.equal(first.data.delivery.status, "failed"); // Isolated emulator: mail transport disabled.
  assert.deepEqual((await json("mobile", c)).data, first.data);
  for (const channel of ["technician", "mobile"]) {
    const r = await fetch(`${base}/api/${channel}/document?workId=${id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(r.status, 200, await r.clone().text());
    const bytes = Buffer.from(await r.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    assert.ok(bytes.length > 1000);
  }
});
