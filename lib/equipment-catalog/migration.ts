import {
  catalogKey,
  catalogName,
  EQUIPMENT_CATALOG_ROOTS,
} from "@/packages/fom-domain/equipment-catalog";

/** Inventory only. Existing equipment and global models are never rewritten. */
export function inventoryManufacturers(
  settings: Array<Record<string, any>>,
  clients: Array<Record<string, any>>,
) {
  const existing = settings.filter(
    (row) =>
      row.parentId === EQUIPMENT_CATALOG_ROOTS.manufacturers &&
      row.type === "variable",
  );
  const known = new Set(
    existing
      .filter((row) => typeof row.name === "string")
      .map((row) => catalogKey(row.name)),
  );
  const candidates = new Map<string, string>();
  let equipmentCount = 0,
    populated = 0,
    invalid = 0;
  for (const client of clients) {
    const locations = Array.isArray(client.locatii) ? client.locatii : [];
    const equipment = [
      ...(Array.isArray(client.echipamente) ? client.echipamente : []),
      ...locations.flatMap((location: any) =>
        Array.isArray(location.echipamente) ? location.echipamente : [],
      ),
    ];
    for (const item of equipment) {
      equipmentCount++;
      if (
        item?.producator === undefined ||
        item?.producator === null ||
        item?.producator === ""
      )
        continue;
      try {
        const name = catalogName(item.producator),
          key = catalogKey(name);
        populated++;
        // Stable spelling independent of client enumeration order.
        if (
          !candidates.has(key) ||
          name.localeCompare(candidates.get(key)!, "ro") < 0
        )
          candidates.set(key, name);
      } catch {
        invalid++;
      }
    }
  }
  return {
    stats: {
      clients: clients.length,
      equipment: equipmentCount,
      populatedManufacturers: populated,
      invalidManufacturers: invalid,
      existingCatalogManufacturers: existing.length,
      distinctEquipmentManufacturers: candidates.size,
    },
    toCreate: [...candidates]
      .filter(([key]) => !known.has(key))
      .map(([, name]) => name)
      .sort((a, b) => a.localeCompare(b, "ro")),
  };
}
