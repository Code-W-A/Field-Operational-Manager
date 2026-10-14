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
