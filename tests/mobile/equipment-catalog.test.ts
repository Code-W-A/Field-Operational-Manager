import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { equipmentCatalogService } from "../../lib/equipment-catalog/service";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw Error("Local emulator required");
const app = initializeApp({ projectId: "demo-fom-catalog" }, "catalog-tests");
const db = getFirestore(app),
  service = equipmentCatalogService(db);
before(async () => {
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-fom-catalog/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.equal(response.status, 200);
});
after(() => deleteApp(app));
test("catalog creation is shared, audited, concurrent-safe and restricted", async () => {
  assert.deepEqual(await service.list(), { manufacturers: [], models: [] });
  await assert.rejects(
    () =>
      service.add({ uid: "tech", role: "tehnician" }, "manufacturers", "Nice"),
    /permisiune/,
  );
  const results = await Promise.all([
    service.add({ uid: "admin", role: "admin" }, "manufacturers", " Nice "),
    service.add({ uid: "dispatch", role: "dispecer" }, "manufacturers", "NICE"),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal((await service.list()).manufacturers.length, 1);
  assert(!(await db.doc("settings/equipment-models").get()).exists);
  assert.equal((await db.collection("settingsHistory").get()).size, 1);
  await assert.rejects(() => service.add({ uid: "dispatch", role: "dispecer" }, "models", "M400"), /producătorul/);
  await service.add({ uid: "dispatch", role: "dispecer" }, "models", "M400", results[0].id);
  await db.doc(`settings/${results[0].id}`).update({ hidden: true });
  assert.equal((await service.list()).manufacturers.length, 0);
  assert.equal((await service.list()).models.length, 0);
  await assert.rejects(
    () => service.add({ uid: "admin", role: "admin" }, "manufacturers", "Nice"),
    /ascunsă/,
  );
  await db
    .doc(`settings/${results[0].id}`)
    .update({ name: "Renamed", hidden: false });
  assert.equal((await service.list()).manufacturers[0].name, "Renamed");
});
test("models are scoped, concurrent-safe, renameable and hidden with their manufacturer", async () => {
  const admin = { uid: "admin", role: "admin" }, dispatch = { uid: "dispatch", role: "dispecer" };
  const first = await service.add(admin, "manufacturers", "First"), second = await service.add(admin, "manufacturers", "Second");
  await assert.rejects(() => service.add(admin, "models", "X", "missing"), /invalid/);
  const [a, same] = await Promise.all([service.add(admin, "models", " M1 ", first.id), service.add(dispatch, "models", "m1", first.id)]);
  assert.equal(a.id, same.id);
  const b = await service.add(admin, "models", "M1", second.id);
  assert.notEqual(a.id, b.id);
  await assert.rejects(() => service.update(dispatch, "models", a.id, { name: "No" }), /administratorul/);
  await service.update(admin, "models", a.id, { name: "Renamed model" });
  const [oldName, oldName2] = await Promise.all([service.add(admin, "models", "M1", first.id), service.add(dispatch, "models", "M1", first.id)]);
  assert.equal(oldName.id, oldName2.id);
  assert.notEqual(oldName.id, a.id);
  await service.update(admin, "manufacturers", first.id, { hidden: true });
  assert(!(await service.list()).models.some(model => model.manufacturerId === first.id));
  assert((await service.list(true)).models.some(model => model.id === a.id));
  await assert.rejects(() => service.add(admin, "models", "Blocked", first.id), /ascuns/);
  await service.update(admin, "manufacturers", first.id, { hidden: false });
  await service.update(admin, "models", a.id, { hidden: true });
  assert(!(await service.list()).models.some(model => model.id === a.id));
  await service.update(admin, "models", a.id, { hidden: false });
  assert((await service.list()).models.some(model => model.id === a.id));
  await assert.rejects(() => service.update(admin, "models", a.id, { name: "M1" }), /există deja/);
});
test("Firestore denies technician and dispatcher direct catalog writes, including moves/subcollections", async () => {
  await db.doc("users/admin").set({ role: "admin" });
  await db.doc("users/tech").set({ role: "tehnician" });
  await db.doc("users/dispatch").set({ role: "dispecer" });
  const projectId = "demo-fom-catalog";
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}:securityRules`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: {
          files: [
            {
              name: "firestore.rules",
              content: readFileSync("firestore.rules", "utf8"),
            },
          ],
        },
      }),
    },
  );
  assert.equal(response.status, 200, await response.text());
  const call = async (
    uid: string,
    path: string,
    fields?: Record<string, string>,
    method = "PATCH",
  ) => {
    const token = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: uid, user_id: uid, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, firebase: { sign_in_provider: "custom" } })).toString("base64url")}.`;
    return fetch(
      `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        ...(fields
          ? {
              body: JSON.stringify({
                fields: Object.fromEntries(
                  Object.entries(fields).map(([k, v]) => [
                    k,
                    { stringValue: v },
                  ]),
                ),
              }),
            }
          : {}),
      },
    );
  };
  for (const uid of ["tech", "dispatch"]) {
    assert.equal(
      (
        await call(uid, "settings/forged", {
          parentId: "equipment-models",
          type: "variable",
          name: "Forged",
        })
      ).status,
      403,
    );
    assert.equal(
      (await call(uid, "settings/equipment-models", { name: "Override" }))
        .status,
      403,
    );
    assert.equal(
      (await call(uid, "settings/equipment-models", undefined, "DELETE"))
        .status,
      403,
    );
    assert.equal(
      (
        await call(uid, "settings/equipment-models/children/forged", {
          name: "Forged",
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await call("admin", "settings/admin-option", {
        parentId: "equipment-models",
        type: "variable",
        name: "Admin option",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("tech", "settings/admin-option", { parentId: "elsewhere" }))
      .status,
    403,
  );
  assert.equal(
    (await call("tech", "settings/legacy-unrelated", { name: "Legacy" }))
      .status,
    200,
  );
});
