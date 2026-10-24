"use client";

import { useAuth } from "@/contexts/AuthContext";
import { installationSigningNotice } from "@/packages/fom-domain/installation-signing-notice";
import type { InstallationSheet } from "@/types/installation";

export function InstallationSigningNotice({
  sheet,
  inactive = false,
  compact = false,
}: {
  sheet: InstallationSheet;
  inactive?: boolean;
  compact?: boolean;
}) {
  const { userData } = useAuth();
  const notice = installationSigningNotice(sheet, {
    uid: userData?.uid,
    role: userData?.role,
    inactive,
    accessAvailable: !!userData,
  });
  if (!notice || (compact && sheet.canSign === true && !inactive && userData)) return null;
  return (
    <div
      data-testid="installation-signing-notice"
      className={compact
        ? "mt-2 max-w-lg space-y-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]"
        : "space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 [overflow-wrap:anywhere]"}
    >
      <p>{compact ? notice.summary : notice.message}</p>
      {notice.participants && <p>{notice.participants}</p>}
    </div>
  );
}
