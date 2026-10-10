export const AMBIGUOUS_ATTENDANCE_HR = "Contul este asociat mai multor salariați HR. Solicită administratorului corectarea asocierii pentru pontaj și cereri.";
export const MISSING_ATTENDANCE_HR = "Contul nu este asociat unui salariat HR. Contactează administratorul.";
export function attendanceHrError(count: number): string {
  return count > 1 ? AMBIGUOUS_ATTENDANCE_HR : count === 0 ? MISSING_ATTENDANCE_HR : "";
}
