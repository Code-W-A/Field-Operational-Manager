import * as functions from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
// Stops/segments are computed on read; no additional location history is retained.
export const purgeExpiredTracking = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 540 })
  .pubsub.schedule("every 24 hours")
  .timeZone("Europe/Bucharest")
  .onRun(async () => {
    const db = getFirestore(),
      now = Date.now();
    for (const name of ["trackingPoints", "trackingLatest"]) {
      for (let page = 0; page < 200; page++) {
        const snapshot = await db
          .collection(name)
          .where("expiresAt", "<=", now)
          .limit(400)
          .get();
        if (snapshot.empty) break;
        const batch = db.batch();
        snapshot.docs.forEach((doc) =>
          batch.delete(doc.ref, { lastUpdateTime: doc.updateTime }),
        );
        await batch.commit();
        if (snapshot.size < 400) break;
      }
    }
    // Health heartbeats may outlive the last coordinate. Remove expired coordinates separately.
    for (let page = 0; page < 200; page++) {
      const oldPoints = await db
        .collection("trackingLatest")
        .where("point.capturedAt", "<=", now - 90 * 86400000)
        .limit(400)
        .get();
      if (oldPoints.empty) break;
      const batch = db.batch();
      oldPoints.docs.forEach((doc) =>
        batch.update(
          doc.ref,
          { point: FieldValue.delete() },
          { lastUpdateTime: doc.updateTime },
        ),
      );
      await batch.commit();
      if (oldPoints.size < 400) break;
    }
    return null;
  });
