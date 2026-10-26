import { privatePhotoPath, type SavedTicketDraft } from "@/packages/fom-domain";
import { TechnicianError } from "./service";
export type PrivatePhotoInput = {
  path: string;
  draftId: string;
  saveId: string;
};
/** Validate the receipt and exact photo before using Admin Storage (which bypasses rules). */
export function validatePrivatePhoto(
  input: unknown,
  saved: SavedTicketDraft | null,
  uid: string,
  workId: string,
  fileId: string,
  purpose: string,
  targetId: string,
) {
  const p = input as PrivatePhotoInput;
  if (
    !p ||
    typeof p.draftId !== "string" ||
    p.draftId.includes("/") ||
    typeof p.saveId !== "string" ||
    !/^[\w-]{8,120}$/.test(p.saveId) ||
    p.path !== privatePhotoPath(uid, p.draftId, fileId) ||
    !saved ||
    saved.ownerUid !== uid ||
    saved.workId !== workId ||
    saved.draftId !== p.draftId ||
    saved.saveId !== p.saveId ||
    !["photo", "installation"].includes(purpose) ||
    !saved.accepted ||
    (purpose === "installation" &&
      (saved.kind !== "installation" || saved.targetId !== targetId)) ||
    (purpose === "photo" &&
      (saved.kind === "installation" ||
        (saved.kind === "revision" && saved.targetId !== targetId)))
  )
    throw new TechnicianError(
      "Referința fotografiei private este invalidă.",
      403,
    );
  const photo = saved.photos.find((f) => f.id === fileId && f.path === p.path);
  if (
    !photo ||
    photo.size <= 0 ||
    photo.size > 3000000 ||
    !["image/jpeg", "image/png"].includes(photo.contentType)
  )
    throw new TechnicianError(
      "Fotografia nu aparține ciornei confirmate.",
      403,
    );
  return photo;
}
