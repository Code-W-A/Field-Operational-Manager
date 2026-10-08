import type { Lucrare } from "../../packages/fom-domain/works";
import type { Lucrare as WebWork } from "../../lib/firebase/firestore";
import type { AttendanceSession as WebAttendance } from "../../types/attendance";
import type { AttendanceSession } from "../../packages/fom-domain/attendance";
// These assignments fail compilation if the legacy web contract drifts from the shared contract.
export const webWorkCompatible = (value: WebWork): Lucrare => value;
export const webAttendanceCompatible = (
  value: WebAttendance,
): AttendanceSession => value;
