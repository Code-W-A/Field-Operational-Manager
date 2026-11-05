export function revisionEquipmentIds(work: {
  equipmentIds?: string[];
  revision?: { equipmentStatus?: Record<string, unknown> };
}): string[] {
  return Array.from(
    new Set(
      (
        work.equipmentIds || Object.keys(work.revision?.equipmentStatus || {})
      ).map(String),
    ),
  );
}
