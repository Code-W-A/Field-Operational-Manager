/** Read-only by default. --apply <report.json> applies only its manufacturer additions. */
import { loadEnvFile } from "node:process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { equipmentCatalogService } from "@/lib/equipment-catalog/service";
import { inventoryManufacturers } from "@/lib/equipment-catalog/migration";
import { EQUIPMENT_CATALOG_ROOTS } from "@/packages/fom-domain/equipment-catalog";

try {
  loadEnvFile(path.resolve(".env"));
} catch {
  /* environment may already be supplied */
}
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (
  !projectId ||
  process.env.FIRESTORE_EMULATOR_HOST ||
  projectId !== "field-operational-manager"
)
  throw new Error(
    "Migrarea este limitată la proiectul FOM configurat, fără emulator.",
  );
const app = initializeApp(
  {
    projectId,
    credential: cert({
      projectId,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
        /\\\\n/g,
        "\n",
      ).replace(/\\n/g, "\n"),
    }),
  },
  "manufacturer-migration",
);
const db = getFirestore(app);
const args = process.argv.slice(2),
  applyIndex = args.indexOf("--apply"),
  outputIndex = args.indexOf("--output");
const output = path.resolve(
  outputIndex >= 0
    ? args[outputIndex + 1]
    : `/private/tmp/fom-manufacturers-${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
const fingerprint = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
async function snapshot() {
  const [settings, clients] = await Promise.all([
    db.collection("settings").get(),
    db.collection("clienti").get(),
  ]);
  const rows = settings.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
  const manufacturerRows = rows
    .filter(
      (row: any) =>
        row.id === EQUIPMENT_CATALOG_ROOTS.manufacturers ||
        row.parentId === EQUIPMENT_CATALOG_ROOTS.manufacturers,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const modelRows = rows
    .filter(
      (row: any) =>
        row.id === EQUIPMENT_CATALOG_ROOTS.models ||
        row.parentId === EQUIPMENT_CATALOG_ROOTS.models,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    manufacturerRows,
    modelRows,
    modelHash: fingerprint(modelRows),
    manufacturerHash: fingerprint(manufacturerRows),
    inventory: inventoryManufacturers(
      rows,
      clients.docs.map((doc) => doc.data()),
    ),
  };
}
async function main() {
  const before = await snapshot();
  if (applyIndex < 0) {
    await mkdir(output, { recursive: true, mode: 0o700 });
    const backupPath = path.join(output, "backup.json");
    await writeFile(
      backupPath,
      JSON.stringify(
        {
          projectId,
          manufacturers: before.manufacturerRows,
          models: before.modelRows,
        },
        null,
        2,
      ),
      { mode: 0o600, flag: "wx" },
    );
    const report = {
      version: 1,
      projectId,
      generatedAt: new Date().toISOString(),
      backupPath,
      manufacturerHash: before.manufacturerHash,
      modelHash: before.modelHash,
      ...before.inventory,
    };
    const reportPath = path.join(output, "report.json");
    await writeFile(reportPath, JSON.stringify(report, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      JSON.stringify(
        { mode: "read-only", reportPath, backupPath, ...before.inventory },
        null,
        2,
      ),
    );
    return;
  }
  const reportPath = path.resolve(args[applyIndex + 1] || "");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const backup = JSON.parse(await readFile(report.backupPath, "utf8"));
  const resultPath = path.join(path.dirname(reportPath), "result.json");
  const previousResult = await readFile(resultPath, "utf8")
    .then((value) => JSON.parse(value))
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
  if (previousResult) {
    const requestedNames = [...report.toCreate].sort();
    const completedNames = previousResult.addedManufacturers
      ?.map((entry: { name: string }) => entry.name)
      .sort();
    if (
      previousResult.projectId !== projectId ||
      JSON.stringify(requestedNames) !== JSON.stringify(completedNames)
    ) {
      throw new Error("Rezultatul existent nu corespunde acestui raport.");
    }
    console.log(
      JSON.stringify(
        { ...previousResult, resultPath, alreadyApplied: true },
        null,
        2,
      ),
    );
    return;
  }
  if (
    report.version !== 1 ||
    report.projectId !== projectId ||
    backup.projectId !== projectId ||
    fingerprint(backup.manufacturers) !== report.manufacturerHash ||
    fingerprint(backup.models) !== report.modelHash ||
    before.manufacturerHash !== report.manufacturerHash ||
    before.modelHash !== report.modelHash ||
    JSON.stringify(before.inventory.toCreate) !==
      JSON.stringify(report.toCreate)
  )
    throw new Error(
      "Inventarul sau catalogul s-a schimbat. Generează un raport nou înainte de aplicare.",
    );
  const service = equipmentCatalogService(db);
  const results: Array<Awaited<ReturnType<typeof service.add>>> = [];
  // No client, equipment, work or model write is made by this migration.
  for (const name of report.toCreate)
    results.push(
      await service.add(
        { uid: "migration-equipment-manufacturers", role: "admin" },
        "manufacturers",
        name,
      ),
    );
  const after = await snapshot();
  if (after.modelHash !== before.modelHash || after.inventory.toCreate.length)
    throw new Error(
      "Verificarea migrării a eșuat. Consultă backup-ul și starea curentă.",
    );
  const catalog = await service.list();
  if (
    catalog.models.some((model) =>
      results.some((manufacturer) => manufacturer.id === model.manufacturerId),
    )
  )
    throw new Error("Producătorii migrați nu au liste de modele goale.");
  const result = {
    projectId,
    completedAt: new Date().toISOString(),
    addedManufacturers: results,
    addedCount: results.length,
    modelDocumentsUnchanged: true,
    selectableModels: catalog.models.length,
    repeatInventoryAdditions: after.inventory.toCreate.length,
    stats: after.inventory.stats,
  };
  await writeFile(resultPath, JSON.stringify(result, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  console.log(JSON.stringify({ ...result, resultPath }, null, 2));
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Migrarea a eșuat.");
    process.exitCode = 1;
  })
  .finally(() => db.terminate());
