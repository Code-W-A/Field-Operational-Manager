import type { Firestore } from "firebase-admin/firestore";
import {
  MOBILE_TERMS_VERSION,
  emptyBundle,
  type Bundle,
  type MobileAccess,
} from "@/packages/fom-domain";
import { AMBIGUOUS_ATTENDANCE_HR } from "@/packages/fom-domain/attendance-hr";
import { serial, TechnicianError } from "../technician/service";

/** Mobile-only policy; the web service keeps its existing behavior. */
export class MobileAccessError extends TechnicianError {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message, 403);
  }
}
export function mobileAccessService(db: Firestore) {
  const receipt = (uid: string) =>
    db
      .collection("mobileTermsAcceptances")
      .doc(uid)
      .collection("versions")
      .doc(MOBILE_TERMS_VERSION);
  async function status(uid: string): Promise<MobileAccess> {
    const [accepted, sessions] = await Promise.all([
      receipt(uid).get(),
      db.collection("attendance").where("userId", "==", uid).get(),
    ]);
    const active = sessions.docs.find((s) => s.data().status === "active" && !s.data().sessionEnd);
    return {
      termsVersion: MOBILE_TERMS_VERSION,
      termsAccepted: accepted.data()?.version === MOBILE_TERMS_VERSION,
      activeSessionId: active?.id || null,
    };
  }
  async function accept(uid: string, input: unknown) {
    const value = input as { version?: unknown; accepted?: unknown } | null;
    if (value?.version !== MOBILE_TERMS_VERSION || value?.accepted !== true)
      throw new TechnicianError("Acceptă versiunea curentă a termenilor.", 400);
    await db.runTransaction(async (tx) => {
      const ref = receipt(uid),
        old = await tx.get(ref);
      if (!old.exists)
        tx.set(ref, {
          uid,
          version: MOBILE_TERMS_VERSION,
          acceptedAt: new Date(),
          source: "expo",
        });
    });
    return status(uid);
  }
  async function requireAccess(uid: string, attendanceRequired = true) {
    const access = await status(uid);
    if (!access.termsAccepted)
      throw new MobileAccessError(
        "Acceptă termenii pentru a continua.",
        "MOBILE_TERMS_REQUIRED",
      );
    if (attendanceRequired && !access.activeSessionId)
      throw new MobileAccessError(
        "Pontează-te pentru a continua.",
        "MOBILE_ATTENDANCE_REQUIRED",
      );
    return access;
  }
  async function attendanceBundle(uid: string): Promise<Bundle> {
    const [sessions, employees, defaults, holidays] = await Promise.all([
      db.collection("attendance").where("userId", "==", uid).get(),
      db.collection("hrEmployees").where("userUid", "==", uid).get(),
      db.collection("hrSettings").doc("defaults").get(),
      db.collection("hrHolidays").get(),
    ]);
    const employee = employees.size === 1 ? employees.docs[0] : undefined,
      e = employee?.data();
    return serial({
      ...emptyBundle(),
      attendance: sessions.docs.map((s) => ({
        ...s.data(),
        id: s.id,
      })) as Bundle["attendance"],
      employee: employee
        ? ({
            id: employee.id,
            userUid: uid,
            nume: e?.nume || "",
            prenume: e?.prenume || "",
            programLucru: e?.programLucru || {},
            programLucruStart: e?.programLucruStart || "",
            programLucruEnd: e?.programLucruEnd || "",
          } as Bundle["employee"])
        : null,
      ...(employees.size > 1
        ? { employeeAssociationError: AMBIGUOUS_ATTENDANCE_HR }
        : {}),
      attendanceSettings: {
        defaults: defaults.data() || {},
        holidays: holidays.docs.flatMap((h) => h.data().items || []),
      },
      downloadedAt: new Date().toISOString(),
    });
  }
  return { status, accept, requireAccess, attendanceBundle };
}
