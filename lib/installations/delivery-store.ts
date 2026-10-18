import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  installationDeliveryId,
  installationDeliveryResult,
  type DeliveryClaim,
  type InstallationDeliveryStore,
} from "./delivery";

export function installationDeliveryStore(
  db: Firestore,
  workId: string,
  effectId: string,
): InstallationDeliveryStore {
  const ref = db.collection("mobileEffects").doc(effectId);
  const store: InstallationDeliveryStore = {
    claim: () =>
      db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) return null;
        const value = snapshot.data()!;
        if (
          value.action !== "installation.complete" ||
          value.workId !== workId ||
          effectId !== installationDeliveryId(value.rootWorkId)
        )
          throw new Error("Operație de trimitere invalidă.");
        const delivery = installationDeliveryResult(value);
        if (value.status === "processing" && delivery.status === "uncertain") {
          tx.update(ref, {
            ...delivery,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return {
            ...value,
            ...delivery,
            claimed: false,
          } as DeliveryClaim;
        }
        if (value.status !== "pending")
          return { ...value, claimed: false } as DeliveryClaim;
        tx.update(ref, {
          status: "processing",
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { ...value, claimed: true } as DeliveryClaim;
      }),
    finish: (result) =>
      ref
        .update({ ...result, updatedAt: FieldValue.serverTimestamp() })
        .then(() => {}),
  };
  return store;
}
