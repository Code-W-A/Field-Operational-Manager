import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
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
export function equipmentCatalogService(db: Firestore) {
  const settings = db.collection("settings");
  const titles = {
    manufacturers: "Producători echipamente",
    models: "Modele echipamente",
  };
  const catalogRows = async () => {
    const [roots, children] = await Promise.all([
      db.getAll(
        ...Object.values(EQUIPMENT_CATALOG_ROOTS).map((id) => settings.doc(id)),
      ),
      settings
        .where("parentId", "in", Object.values(EQUIPMENT_CATALOG_ROOTS))
        .get(),
    ]);
    return [...roots.filter((d) => d.exists), ...children.docs].map((d) => ({
      ...d.data(),
      id: d.id,
    }));
  };
  async function add(
    actor: { uid: string; role: string },
    kind: EquipmentCatalogKind,
    raw: unknown,
  ) {
    if (!["admin", "dispecer"].includes(actor.role))
      throw new CatalogError("Nu ai permisiune să adaugi valori.", 403);
    if (!Object.hasOwn(EQUIPMENT_CATALOG_ROOTS, kind))
      throw new CatalogError("Listă invalidă.");
    let name: string;
    try {
      name = catalogName(raw);
    } catch (e) {
      throw new CatalogError((e as Error).message);
    }
    const rootId = EQUIPMENT_CATALOG_ROOTS[kind];
    const optionId = `${rootId}-${createHash("sha256").update(catalogKey(name)).digest("hex").slice(0, 32)}`;
    return db.runTransaction(async (tx) => {
      const roots = await tx.getAll(
        ...Object.values(EQUIPMENT_CATALOG_ROOTS).map((id) => settings.doc(id)),
      );
      const siblings = await tx.get(settings.where("parentId", "==", rootId));
      if (roots.find((r) => r.id === rootId)?.data()?.hidden)
        throw new CatalogError(
          "Lista este ascunsă. Administratorul trebuie să o reactiveze.",
          409,
        );
      const existing = siblings.docs.find(
        (d) =>
          typeof d.data().name === "string" &&
          catalogKey(d.data().name) === catalogKey(name),
      );
      if (existing) {
        if (existing.data().hidden)
          throw new CatalogError(
            "Valoarea există, dar este ascunsă. Administratorul trebuie să o reactiveze.",
            409,
          );
        return { id: existing.id, name: catalogName(existing.data().name) };
      }
      const now = Timestamp.now();
      for (const [rootKind, id] of Object.entries(EQUIPMENT_CATALOG_ROOTS)) {
        if (!roots.find((r) => r.id === id)?.exists)
          tx.create(settings.doc(id), {
            name: titles[rootKind as EquipmentCatalogKind],
            path: id,
            type: "category",
            parentId: null,
            order: 0,
            hidden: false,
            favorite: false,
            createdAt: now,
            updatedAt: now,
            createdBy: actor.uid,
            updatedBy: actor.uid,
          });
      }
      const data = {
        name,
        value: name,
        type: "variable",
        valueType: "string",
        parentId: rootId,
        path: `${rootId}.${optionId}`,
        order:
          siblings.docs.reduce(
            (max, d) => Math.max(max, Number(d.data().order) || 0),
            0,
          ) + 1,
        hidden: false,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        createdBy: actor.uid,
        updatedBy: actor.uid,
      };
      tx.create(settings.doc(optionId), data);
      tx.set(db.collection("settingsHistory").doc(), {
        settingId: optionId,
        settingPath: data.path,
        action: "create",
        after: data,
        modifiedBy: actor.uid,
        modifiedByName: actor.uid,
        timestamp: now,
      });
      return { id: optionId, name };
    });
  }
  return {
    list: async () => equipmentCatalogFromSettings(await catalogRows()),
    add,
  };
}
