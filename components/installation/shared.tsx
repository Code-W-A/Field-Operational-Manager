"use client";
import { Badge } from "@/components/ui/badge";
import type { InstallationDocument } from "@/types/installation";
export const statuses = {
  pending: "Neînceput",
  in_progress: "În lucru",
  blocked: "Blocat",
  done: "Finalizat",
  completed: "Finalizat",
};
export const pageUrl = (id: string) =>
  `/dashboard/lucrari/${encodeURIComponent(id)}/instalare`;
export async function pdf(
  snapshot: InstallationDocument,
  workId: string,
  sheetId?: string,
) {
  const { downloadInstallationPdf } = await import("@/lib/pdf/installation");
  await downloadInstallationPdf(snapshot, workId, sheetId);
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={
        status === "done" || status === "completed" || status === "Finalizat"
          ? "border-green-200 bg-green-50 text-green-800"
          : status === "blocked"
            ? "border-red-200 bg-red-50 text-red-800"
            : status === "in_progress"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "bg-muted text-muted-foreground"
      }
    >
      {statuses[status as keyof typeof statuses] || status}
    </Badge>
  );
}

export const dateLabel = (value: string) =>
  value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3.$2.$1");
