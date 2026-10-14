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
  assert((await db.doc("settings/equipment-models").get()).exists);
  assert.equal((await db.collection("settingsHistory").get()).size, 1);
  await service.add({ uid: "dispatch", role: "dispecer" }, "models", "M400");
  await db.doc(`settings/${results[0].id}`).update({ hidden: true });
  assert.equal((await service.list()).manufacturers.length, 0);
  await assert.rejects(
    () => service.add({ uid: "admin", role: "admin" }, "manufacturers", "Nice"),
    /ascunsă/,
  );
  await db
    .doc(`settings/${results[0].id}`)
    .update({ name: "Renamed", hidden: false });
  assert.equal((await service.list()).manufacturers[0].name, "Renamed");
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
