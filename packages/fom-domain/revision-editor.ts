import type { RevisionSection, RecordData } from "./index";
export const REVISION_PHOTO_LIMIT = 4;
export function revisionChecksComplete(sections: RevisionSection[]) {
  const items = sections.flatMap((s) => s.items);
  return (
    items.length > 0 &&
    items.every((i) =>
      ["functional", "nefunctional", "na"].includes(i.state || ""),
    )
  );
}
export function revisionCheck(
  sections: RevisionSection[],
  id: string,
  checked: boolean,
): RevisionSection[] {
  return sections.map((s) => ({
    ...s,
    items: s.items.map((i) =>
      i.id === id
        ? {
            ...i,
            state: checked
              ? ("functional" as const)
              : ("nefunctional" as const),
          }
        : i,
    ),
  }));
}
export function revisionStructure(sections: RevisionSection[]) {
  return JSON.stringify(
    sections.map((s) => ({
      id: s.id,
      items: s.items.map((i) => ({ id: i.id, label: i.label })),
    })),
  );
}
export function revisionDraftFingerprint(d: RecordData) {
  return JSON.stringify({
    sections: d.sections || [],
    finalObservations: d.finalObservations || "",
    photos: d.photos || [],
    files: d.files || [],
  });
}
export function revisionEquipmentVerified(
  work: RecordData,
  equipmentId: string,
) {
  const time = work.revisionEquipmentTimes?.[equipmentId];
  return !!(time?.verifiedAt || time?.startIso);
}

/** Extend an unfinished sheet without replacing saved answers or manual points.
 * Completed sheets must keep their frozen structure at the call site.
 */
export function completeRevisionSections(
  existing: RevisionSection[] | undefined,
  checklist: RevisionSection[],
): RevisionSection[] {
  if (!existing?.length) return checklist;
  const result = existing.map((section) => ({ ...section, items: [...section.items] }));
  const itemIds = new Set(result.flatMap((section) => section.items.map((item) => item.id)));
  for (const section of checklist) {
    const missing = section.items.filter((item) => !item.id.startsWith("manual-") && !itemIds.has(item.id));
    if (!missing.length) continue;
    const target = result.find((value) => value.id === section.id);
    if (target) target.items.push(...missing);
    else result.push({ ...section, items: [...missing] });
    for (const item of missing) itemIds.add(item.id);
  }
  return result;
}
