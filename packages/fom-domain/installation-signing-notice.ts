import type { InstallationSheet } from "./installation";

export const installationPendingSignatureMessage =
  "Echipa este liberă. Pentru o fișă nouă pe acest echipament sau replanificare, fișa în așteptare trebuie semnată de un tehnician participant.";

type SigningSheet = Partial<Pick<
  InstallationSheet,
  "state" | "canSign" | "participants" | "principalUid" | "principalName"
>>;

/** Presentation only: never use this explanation to authorize a command. */
export function installationSigningNotice(
  sheet: SigningSheet,
  viewer: {
    uid?: string;
    role?: string;
    inactive?: boolean;
    accessAvailable?: boolean;
  },
): { message: string; summary: string; participants: string } | null {
  if (sheet.state !== "awaiting_signature") return null;
  if (viewer.inactive) {
    return {
      message: "Semnarea nu este disponibilă deoarece tichetul este închis, arhivat sau anulat.",
      summary: "Tichet inactiv: semnarea nu este disponibilă.",
      participants: "",
    };
  }
  if (viewer.accessAvailable === false) {
    return {
      message: "Semnarea nu este disponibilă momentan. Verifică accesul la aplicație, conexiunea și pontajul activ.",
      summary: "Semnare indisponibilă momentan. Verifică accesul și pontajul.",
      participants: "",
    };
  }
  // Match the server's legacy fallback. An explicitly empty array stays empty.
  const members = sheet.participants ?? (sheet.principalUid
    ? [{ uid: sheet.principalUid, name: sheet.principalName }]
    : []);
  const names = [...new Set(members
    .map(p => typeof p?.name === "string" ? p.name.trim() : "")
    .filter(Boolean))];
  const completeNames = members.length > 0 && members.every(
    p => typeof p?.name === "string" && p.name.trim(),
  );
  const participants = completeNames
    ? `${members.length === 1 ? "Participant înregistrat" : "Participanți înregistrați"}: ${names.join(", ")}.`
    : "Informațiile despre participanții fișei sunt incomplete.";
  const nonparticipant =
    viewer.role === "tehnician" && !!viewer.uid &&
    sheet.canSign === false && completeNames &&
    members.every(p => typeof p?.uid === "string" && !!p.uid) &&
    !members.some(p => p.uid === viewer.uid);
  return {
    message: nonparticipant
      ? "Nu poți semna această fișă deoarece nu ești înregistrat ca participant. Atribuirea pe tichet nu acordă automat drept de semnare."
      : "Semnarea acestei fișe se face de un tehnician participant. Atribuirea pe tichet nu acordă automat drept de semnare.",
    summary: nonparticipant
      ? "Semnare indisponibilă: nu ești participant la această fișă."
      : "Semnarea se face de un tehnician participant la fișă.",
    participants,
  };
}
