export const EQUIPMENT_CATALOG_ROOTS = {
  manufacturers: "equipment-manufacturers",
  models: "equipment-models",
} as const;
export type EquipmentCatalogKind = keyof typeof EQUIPMENT_CATALOG_ROOTS;
export type EquipmentCatalogOption = { id: string; name: string };
export type EquipmentCatalog = {
  manufacturers: EquipmentCatalogOption[];
  models: EquipmentCatalogOption[];
};
export function catalogName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Introdu o denumire validă.");
  const name = value.trim().replace(/\s+/g, " ").normalize("NFC");
  if (!name || name.length > 120)
    throw new Error("Denumirea trebuie să aibă între 1 și 120 de caractere.");
  return name;
}
export function catalogKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFC")
    .toLocaleLowerCase("ro-RO");
}
export function equipmentCatalogFromSettings(
  rows: Array<{ id: string; [key: string]: any }>,
): EquipmentCatalog {
  const select = (kind: EquipmentCatalogKind) => {
    const root = EQUIPMENT_CATALOG_ROOTS[kind];
    if (rows.find((r) => r.id === root)?.hidden) return [];
    const seen = new Set<string>();
    return rows
      .filter(
        (r) =>
          r.parentId === root &&
          r.type === "variable" &&
          !r.hidden &&
          typeof r.name === "string" &&
          r.name.trim(),
      )
      .sort(
        (a, b) =>
          (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, "ro"),
      )
      .flatMap((r) => {
        const name = r.name.trim().replace(/\s+/g, " ").normalize("NFC"),
          key = catalogKey(name);
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ id: r.id, name }];
      });
  };
  return { manufacturers: select("manufacturers"), models: select("models") };
}
export function equipmentCatalogChoices(
  options: EquipmentCatalogOption[],
  current = "",
) {
  const choices = options.map((o) => ({ value: o.name, label: o.name }));
  if (current && !choices.some((o) => o.value === current))
    choices.unshift({ value: current, label: `${current} (valoare curentă)` });
  return [{ value: "", label: "Nespecificat" }, ...choices];
}
