"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  TicketClientInformation,
  TicketClientReadStatus,
} from "@/components/ticket-client-information";
import { TicketContactDetails } from "@/components/ticket-contact-details";
import type { Lucrare } from "@/lib/firebase/firestore";
import type { resolveTicketLiveDisplay } from "@/lib/work-documents/ticket-live-display";
import { getTicketEmitent } from "@/lib/utils/ticket-emitent";
import { dateLabel } from "./shared";

/** Presentation only: the ticket page owns the live client subscription and permissions. */
export function InstallationTicketDetails({
  work,
  display,
  clientId,
  role,
  unavailable,
  syncIssues,
}: {
  work: Lucrare;
  display: ReturnType<typeof resolveTicketLiveDisplay>;
  clientId?: string;
  role: string;
  unavailable: boolean;
  syncIssues: string[];
}) {
  const manager = role === "admin" || role === "dispecer";
  const offer =
    work.offerResponse?.status === "accept"
      ? "Da (acceptată)"
      : work.offerResponse?.status === "reject"
        ? "Da (refuzată)"
        : work.statusOferta || "N/A";
  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>
            <h2>Detalii instalare</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {[
              ["Data emiterii", work.dataEmiterii],
              ["Data intervenției", work.dataInterventie],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="mt-1 font-medium">
                  {value ? dateLabel(value) : "Nespecificată"}
                </dd>
              </div>
            ))}
          </dl>
          <div>
            <p className="mb-2 text-sm font-medium">Tehnicieni atribuiți</p>
            <div className="flex flex-wrap gap-2">
              {work.tehnicieni?.length ? (
                work.tehnicieni.map((name) => (
                  <Badge
                    key={name}
                    variant="secondary"
                    className="whitespace-normal"
                  >
                    {name}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">
                  Neatribuit
                </span>
              )}
            </div>
          </div>
          <Separator />
          <TicketClientReadStatus
            unavailable={unavailable}
            issues={display.issues}
          />
          {syncIssues.length > 0 && (
            <p role="alert" className="text-sm text-amber-700">
              Date de contact păstrate pentru verificare:{" "}
              {syncIssues.join("; ")}
            </p>
          )}
          <div className="grid gap-5 sm:grid-cols-2">
            <TicketContactDetails
              work={work}
              display={{
                ...display.contact,
                location: display.contact.location || "Nespecificată",
                name: display.contact.name || "Nespecificat",
              }}
            />
          </div>
          {!display.contact.address && (
            <p className="text-sm text-muted-foreground">
              Adresa locației nu este specificată.
            </p>
          )}
          {(!display.contact.email || !display.contact.phone) && (
            <p className="text-sm text-muted-foreground">
              {!display.contact.email &&
                "Emailul contactului nu este specificat. "}
              {!display.contact.phone &&
                "Telefonul contactului nu este specificat."}
            </p>
          )}
          <Separator />
          <div>
            <h3 className="mb-2 text-sm font-semibold">Cerințe de instalare</h3>
            <p className="whitespace-pre-wrap break-words text-sm">
              {work.defectReclamat ||
                "Nu au fost specificate cerințe de instalare."}
            </p>
          </div>
          {role !== "client" &&
            (work.descriere || work.notaInternaTehnician) && (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <h3 className="mb-2 font-semibold">
                  Note interne ale tichetului
                </h3>
                {work.descriere && (
                  <p className="whitespace-pre-wrap break-words">
                    <span className="font-medium">Dispecer: </span>
                    {work.descriere}
                  </p>
                )}
                {work.notaInternaTehnician && (
                  <p className="mt-2 whitespace-pre-wrap break-words">
                    <span className="font-medium">Tehnician: </span>
                    {work.notaInternaTehnician}
                  </p>
                )}
              </div>
            )}
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>
              <h2>Informații client</h2>
            </CardTitle>
            <p className="mt-2 break-words text-sm font-medium text-muted-foreground">
              {display.identity.name || "Nespecificat"}
            </p>
          </div>
          {clientId && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/clienti/${encodeURIComponent(clientId)}`}>
                Vezi detalii client
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="[&>div]:sm:grid-cols-2 [&>div]:2xl:grid-cols-4">
            <TicketClientInformation
              identity={display.identity}
              showRegistration={manager}
            />
          </div>
          {role !== "tehnician" && (
            <>
              <Separator />
              <div>
                <h3 className="mb-3 font-semibold">Statusuri</h3>
                <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                  {[
                    ["Emitent", getTicketEmitent(work)],
                    ["Tichet", work.statusLucrare || "Nespecificat"],
                    [
                      "Preluare",
                      work.preluatDispecer
                        ? `Preluat de ${work.preluatDe || "Dispecer"}`
                        : "Ne-preluat",
                    ],
                    ["Ofertare", offer],
                    ["Facturare", work.statusFacturare || "Nespecificată"],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="mb-1 text-xs text-muted-foreground">
                        {label}
                      </dt>
                      <dd>
                        <Badge
                          variant="outline"
                          className="whitespace-normal break-words"
                        >
                          {value}
                        </Badge>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
