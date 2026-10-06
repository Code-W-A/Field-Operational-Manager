"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InstallationSheet } from "@/types/installation";
import {
  sheetParticipants,
  pendingSignatureMessage,
} from "@/lib/installations/team";
export function InstallationTeam({ sheet }: { sheet: InstallationSheet }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Echipa fișei</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
