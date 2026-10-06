import type {
  InstallationParticipant,
  InstallationSheet,
} from "@/types/installation";

export const pendingSignatureMessage =
  "Echipa este liberă. Pentru o fișă nouă pe acest echipament sau replanificare, semnează mai întâi fișa în așteptare.";
export function sheetParticipants(
  sheet: Pick<
    InstallationSheet,
    "participants" | "principalUid" | "principalName" | "state"
  >,
): InstallationParticipant[] {
  return (
    sheet.participants || [
      {
        uid: sheet.principalUid,
        name: sheet.principalName,
        role: "principal",
        active: sheet.state === "draft",
      },
    ]
  );
}
export function visibleSheet(
  sheet: InstallationSheet,
  uid: string,
  manager = false,
): InstallationSheet {
  const result = {
    ...sheet,
    participants: sheetParticipants(sheet),
    canSign:
      !manager &&
      sheet.state === "awaiting_signature" &&
      sheetParticipants(sheet).some((p) => p.uid === uid),
  };
  if (!manager && sheet.principalUid !== uid)
    delete (result as Partial<InstallationSheet>).internalNote;
  return result;
}
