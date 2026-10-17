import { createHash, randomUUID } from "node:crypto";
import {
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import {
  EQUIPMENT_CATALOG_ROOTS,
  catalogName,
  catalogKey,
  equipmentCatalogFromSettings,
  type EquipmentCatalogKind,
} from "@/packages/fom-domain/equipment-catalog";
export class CatalogError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Actor = { uid: string; role: string };
function kindOf(kind: EquipmentCatalogKind) {
  if (!Object.hasOwn(EQUIPMENT_CATALOG_ROOTS, kind))
    throw new CatalogError("Listă invalidă.");
  return EQUIPMENT_CATALOG_ROOTS[kind];
}
function nameOf(raw: unknown) {
  try {
    return catalogName(raw);
  } catch (error) {
    throw new CatalogError((error as Error).message);
  }
}
export function equipmentCatalogService(db: Firestore) {
  const settings = db.collection("settings");
  const titles = {
    manufacturers: "Producători echipamente",
    models: "Modele echipamente",
  };
  async function catalogRows() {
    const [roots, children] = await Promise.all([
      db.getAll(
        ...Object.values(EQUIPMENT_CATALOG_ROOTS).map((id) => settings.doc(id)),
      ),
      settings
        .where("parentId", "in", Object.values(EQUIPMENT_CATALOG_ROOTS))
        .get(),
    ]);
    return [...roots.filter((doc) => doc.exists), ...children.docs].map(
      (doc) => ({ ...doc.data(), id: doc.id }),
    );
  }
  async function manufacturer(tx: Transaction, manufacturerId: unknown) {
    if (
      typeof manufacturerId !== "string" ||
      !/^[\w-]{1,200}$/.test(manufacturerId)
    )
      throw new CatalogError(
        "Selectează producătorul înainte de a adăuga un model.",
      );
    const [parent, root] = await tx.getAll(
      settings.doc(manufacturerId),
      settings.doc(EQUIPMENT_CATALOG_ROOTS.manufacturers),
    );
    if (
      !parent.exists ||
      parent.data()?.parentId !== EQUIPMENT_CATALOG_ROOTS.manufacturers ||
      parent.data()?.type !== "variable"
    )
      throw new CatalogError("Producător invalid.");
    if (parent.data()?.hidden || root.data()?.hidden)
      throw new CatalogError(
        "Producătorul este ascuns. Administratorul trebuie să îl reactiveze.",
        409,
      );
    return manufacturerId;
  }
  function history(
    tx: Transaction,
    actor: Actor,
    settingId: string,
    before: unknown,
    after: any,
  ) {
    tx.set(db.collection("settingsHistory").doc(), {
      settingId,
      settingPath: after.path,
      action: before ? "update" : "create",
      ...(before ? { before } : {}),
      after,
      modifiedBy: actor.uid,
      modifiedByName: actor.uid,
      timestamp: Timestamp.now(),
    });
  }
  async function add(
    actor: Actor,
    kind: EquipmentCatalogKind,
    raw: unknown,
    manufacturerId?: string,
  ) {
    if (!["admin", "dispecer"].includes(actor.role))
      throw new CatalogError("Nu ai permisiune să adaugi valori.", 403);
    const rootId = kindOf(kind),
      name = nameOf(raw);
    const optionId = `${rootId}-${createHash("sha256")
      .update(
        JSON.stringify([
          kind === "models" ? manufacturerId : "",
          catalogKey(name),
        ]),
      )
      .digest("hex")
      .slice(0, 32)}`;
    const fallbackId = `${rootId}-${randomUUID()}`;
    return db.runTransaction(async (tx) => {
      const [root, reserved] = await tx.getAll(
        settings.doc(rootId),
        settings.doc(optionId),
      );
      const siblings = await tx.get(settings.where("parentId", "==", rootId));
      if (root.data()?.hidden)
        throw new CatalogError(
          "Lista este ascunsă. Administratorul trebuie să o reactiveze.",
          409,
        );
      const parent =
        kind === "models" ? await manufacturer(tx, manufacturerId) : undefined;
      const existing = siblings.docs.find(
        (doc) =>
          typeof doc.data().name === "string" &&
          catalogKey(doc.data().name) === catalogKey(name) &&
          (kind !== "models" || doc.data().manufacturerId === parent),
      );
      if (existing) {
        if (existing.data().hidden)
          throw new CatalogError(
            "Valoarea există, dar este ascunsă. Administratorul trebuie să o reactiveze.",
            409,
          );
        return {
          id: existing.id,
          name: nameOf(existing.data().name),
          ...(parent ? { manufacturerId: parent } : {}),
        };
      }
      const now = Timestamp.now(),
        id = reserved.exists ? fallbackId : optionId;
      const data = {
        name,
        value: name,
        type: "variable",
        valueType: "string",
        parentId: rootId,
        path: `${rootId}.${id}`,
        ...(parent ? { manufacturerId: parent } : {}),
        order:
          siblings.docs.reduce(
            (max, doc) => Math.max(max, Number(doc.data().order) || 0),
            0,
          ) + 1,
        hidden: false,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        createdBy: actor.uid,
        updatedBy: actor.uid,
      };
      // Serializes catalog mutations, including name reuse after a rename.
      tx.set(
        settings.doc(rootId),
        root.exists
          ? { updatedAt: now, updatedBy: actor.uid }
          : {
              name: titles[kind],
              path: rootId,
              type: "category",
              parentId: null,
              order: 0,
              hidden: false,
              favorite: false,
              createdAt: now,
              updatedAt: now,
              createdBy: actor.uid,
              updatedBy: actor.uid,
            },
        { merge: true },
      );
      tx.create(settings.doc(id), data);
      history(tx, actor, id, undefined, data);
      return { id, name, ...(parent ? { manufacturerId: parent } : {}) };
    });
  }
  async function update(
    actor: Actor,
    kind: EquipmentCatalogKind,
    id: string,
    patch: { name?: unknown; hidden?: unknown },
  ) {
    if (actor.role !== "admin")
      throw new CatalogError(
        "Doar administratorul poate modifica listele.",
        403,
      );
    const rootId = kindOf(kind);
    if (typeof id !== "string" || !/^[\w-]{1,200}$/.test(id))
      throw new CatalogError("Identificator invalid.");
    if (patch.name === undefined && patch.hidden === undefined)
      throw new CatalogError("Nu există modificări.");
    if (patch.hidden !== undefined && typeof patch.hidden !== "boolean")
      throw new CatalogError("Stare invalidă.");
    return db.runTransaction(async (tx) => {
      const [entry, root] = await tx.getAll(
        settings.doc(id),
        settings.doc(rootId),
      );
      const siblings = await tx.get(settings.where("parentId", "==", rootId));
      const before = entry.data();
      if (!before || before.parentId !== rootId || before.type !== "variable")
        throw new CatalogError("Valoarea nu există.", 404);
      if (
        kind === "models" &&
        (typeof before.manufacturerId !== "string" || !before.manufacturerId)
      )
        throw new CatalogError(
          "Modelul vechi nu este asociat unui producător.",
          409,
        );
      const name =
        patch.name === undefined ? nameOf(before.name) : nameOf(patch.name);
      if (
        siblings.docs.some(
          (doc) =>
            doc.id !== id &&
            typeof doc.data().name === "string" &&
            catalogKey(doc.data().name) === catalogKey(name) &&
            (kind !== "models" ||
              doc.data().manufacturerId === before.manufacturerId),
        )
      )
        throw new CatalogError("Denumirea există deja în această listă.", 409);
      const now = Timestamp.now();
      const after = {
        ...before,
        name,
        value: name,
        ...(patch.hidden === undefined ? {} : { hidden: patch.hidden }),
        updatedAt: now,
        updatedBy: actor.uid,
      };
      tx.update(entry.ref, after);
      if (root.exists)
        tx.update(root.ref, { updatedAt: now, updatedBy: actor.uid });
      history(tx, actor, id, before, after);
      return {
        id,
        name,
        ...(before.manufacturerId
          ? { manufacturerId: before.manufacturerId }
          : {}),
        hidden: after.hidden === true,
      };
    });
  }
  return {
    list: async (includeHidden = false) =>
      equipmentCatalogFromSettings(await catalogRows(), { includeHidden }),
    add,
    update,
  };
}
