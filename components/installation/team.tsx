"use client";
import { useEffect, useState } from "react";
import { installationTimeLines } from "@/packages/fom-domain/installation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InstallationSheet } from "@/types/installation";
import {
  sheetParticipants,
  pendingSignatureMessage,
} from "@/lib/installations/team";
export function InstallationTeam({
  sheet,
  compact = false,
}: {
  sheet: InstallationSheet;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sheet.timeIntervals?.some((i) => !i.endedAt)) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [sheet.timeIntervals]);
  const timing = (
    <div className="space-y-2 text-sm break-words">
      {installationTimeLines(sheet, now).map((line, index) => (
        <p key={index}>{line}</p>
      ))}
    </div>
  );
  if (compact)
    return (
      <div className="space-y-2">
        {timing}
        {sheet.state === "awaiting_signature" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {pendingSignatureMessage}
          </p>
        )}
        {sheet.allocationWarnings?.map((message) => (
          <p key={message} className="text-sm text-muted-foreground">
            {message}
          </p>
        ))}
      </div>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Echipa fișei</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {timing}
        <div className="flex flex-wrap gap-2">
          {sheetParticipants(sheet).map((p) => (
            <Badge
              key={p.uid}
              variant="secondary"
              className="whitespace-normal"
            >
              {p.name} · {p.role === "principal" ? "principal" : "secundar"}
              {p.moved ? " · mutat pe altă fișă" : ""}
            </Badge>
          ))}
        </div>
        {sheet.state === "awaiting_signature" && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {pendingSignatureMessage}
          </p>
        )}
        {sheet.allocationWarnings?.map((message) => (
          <p key={message} className="text-sm text-muted-foreground">
            {message}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
export const sheetStateLabel = (sheet: InstallationSheet) =>
  sheet.state === "closed"
    ? "Semnată"
    : sheet.state === "awaiting_signature"
      ? "În așteptarea semnăturilor"
      : "Ciornă";
