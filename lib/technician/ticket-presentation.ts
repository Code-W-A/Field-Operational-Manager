import { getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator";
import type { Firestore } from "firebase-admin/firestore";
import {
  equipmentFor,
  workInstant,
  type RecordData,
  type MobileEquipment,
} from "@/packages/fom-domain";
import { resolveTicketLocation } from "@/firebase-functions/src/client-ticket-sync";
import { resolveTicketLiveDisplay } from "@/lib/work-documents/ticket-live-display";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** Retain the legacy Client location/equipment wire shape, restricted to this ticket. */
export function ticketClientLocation(work: RecordData, client: RecordData) {
  let source: RecordData | null = null;
  try {
    source = resolveTicketLocation(client, work);
  } catch {
    /* keep the ticket snapshot */
  }
  const contact = work.mobileContact || {};
  return {
    id:
      source?.id ||
      work.locationId ||
      work.clientInfo?.locationId ||
      contact.location,
    nume: contact.location,
    adresa: contact.address,
    echipamente: (work.mobileEquipment || []).map(
      (equipment: MobileEquipment) => {
        const original = source?.echipamente?.find(
          (item: RecordData) =>
            String(item.id || "") === equipment.id ||
            (!!equipment.code && item.cod === equipment.code),
        );
        return (
          original || {
            id: equipment.id,
            cod: equipment.code,
            denumire: equipment.name,
            model: equipment.model,
          }
        );
      },
    ),
  };
}

/** Read-only, ticket-scoped presentation. Never persist these fields in a work/PDF. */
export async function ticketPresentation(
  db: Firestore,
  work: RecordData,
  client?: RecordData,
) {
  const display = resolveTicketLiveDisplay(work, client);
  let location: RecordData | null = null;
  try {
    location = client ? resolveTicketLocation(client, work) : null;
  } catch {
    /* resolver reports ambiguity */
  }
  const equipment: MobileEquipment[] = await Promise.all(
    equipmentFor(work, location).map(async (item) => {
      const source =
        location?.echipamente?.find(
          (e: RecordData) =>
            String(e.id || "") === item.id ||
            (!!item.code && e.cod === item.code),
        ) || {};
      const result: MobileEquipment = {
        ...item,
        id: String(item.id),
        code: String(item.code),
        name: String(item.name),
        model: text(source.model || item.model || work.echipamentModel),
        producator: text(source.producator || (item as any).producator),
        documentation: [],
      };
      if (work.tipLucrare === "Intervenție în garanție" && Object.keys(source).length) {
        const info = getWarrantyDisplayInfo(source as any);
        result.warranty = {
          statusText: info.statusText,
          ...(info.installationDate ? { installationDate: info.installationDate } : {}),
          ...(info.warrantyExpires ? { warrantyExpires: info.warrantyExpires } : {}),
          warrantyMessage: info.warrantyMessage,
        };
      }
      const folderId = text(source.documentationFolderId);
      result.documentationAssociated = !!folderId;
      if (folderId) {
        try {
          const snapshot = await db
            .collection("documentatii_files")
            .where("folderId", "==", folderId)
            .where(
              "subfolderId",
              "==",
              text(source.documentationSubfolderId) || null,
            )
            .get();
          const selected = Array.isArray(source.documentationFileIds)
            ? source.documentationFileIds
            : [];
          result.documentation = snapshot.docs
            .filter((doc) => !selected.length || selected.includes(doc.id))
            .map((doc) => ({
              id: doc.id,
              name: text(doc.data().name) || "Document",
              url: text(doc.data().downloadUrl),
              ...(workInstant(doc.data().uploadedAt) ? {uploadedAt: workInstant(doc.data().uploadedAt)!.toISOString()} : {}),
            }))
            .filter((doc) => /^https?:\/\//.test(doc.url))
            .sort((a, b) => a.name.localeCompare(b.name, "ro"));
        } catch {
          result.documentationUnavailable = true;
        }
      }
      return result;
    }),
  );
  // Match the web technician's identity fields; registration/account metadata stays private.
  const { reg: _reg, ...identity } = display.identity;
  return {
    mobileClient: { ...identity, ...(client?.id ? { id: client.id } : {}) },
    mobileClientUnavailable: !client,
    mobileDataIssues: display.issues,
    mobileEquipment: equipment,
    mobileContact: {
      ...display.contact,
      ...(location?.lat !== undefined && location?.lng !== undefined
        ? { lat: location.lat, lng: location.lng }
        : {}),
    },
  };
}
