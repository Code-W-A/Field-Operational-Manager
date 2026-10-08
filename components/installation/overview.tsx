"use client";
import Link from "next/link";
import {
  Box,
  CheckCircle2,
  Clock3,
  FileText,
  QrCode,
  Users,
  CalendarDays,
  ArrowRight,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EquipmentQRCode } from "@/components/equipment-qr-code";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import type {
  InstallationListResponse,
  InstallationSheet,
} from "@/types/installation";
import { pendingSignatureMessage } from "@/lib/installations/team";
import { sheetStateLabel } from "./team";
import { pageUrl, pdf, StatusBadge, dateLabel } from "./shared";
type Run = (action: () => Promise<void>) => Promise<void>;
export function InstallationSummary({
  data,
  hideStats = false,
}: {
  data: InstallationListResponse;
  hideStats?: boolean;
}) {
  const { work } = data;
  const meta = work.installation;
  const total = work.equipmentIds.length;
  const done = work.equipmentIds.filter(
    (id) => meta.equipmentStatus[id] === "done",
  ).length;
  const stats = [
    { title: "Echipamente totale", value: total, icon: Box },
    { title: "Finalizate", value: done, icon: CheckCircle2 },
    { title: "Rămase", value: total - done, icon: Clock3 },
    {
      title: "Fișe active",
      value: Object.keys(meta.activeSheetByEquipment).length,
      icon: FileText,
    },
  ];
  return (
    <div className="space-y-4">
      {!hideStats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ title, value, icon: Icon }) => (
            <Card key={title}>
              <CardContent className="flex items-start justify-between gap-2 p-4 sm:p-5">
                <div>
                  <p className="text-xs font-medium text-muted-foreground sm:text-sm">
                    {title}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    {value}
                  </p>
                  {title === "Fișe active" &&
                    !!Object.keys(meta.awaitingSheetByEquipment || {})
                      .length && (
                      <p className="mt-1 text-xs text-amber-800">
                        {
                          Object.keys(meta.awaitingSheetByEquipment || {})
                            .length
                        }{" "}
                        în așteptarea semnăturilor
                      </p>
                    )}
                </div>
                <Icon className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex justify-between gap-2 text-sm">
            <span className="font-medium">Progresul instalării</span>
            <span className="text-muted-foreground">
              {done} din {total} finalizate
            </span>
          </div>
          <Progress
            aria-label="Progresul instalării"
            value={total ? (done / total) * 100 : 0}
            className="h-2"
          />
        </CardContent>
      </Card>
    </div>
  );
}
export function InstallationContext({
  data,
}: {
  data: InstallationListResponse;
}) {
  const work = data.work;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Contextul tichetului</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-5 text-sm sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <p className="mb-2 flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            Tehnicieni atribuiți
          </p>
          <div className="flex flex-wrap gap-2">
            {work.tehnicieni.length ? (
              work.tehnicieni.map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))
            ) : (
              <span>Neatribuit</span>
            )}
          </div>
        </div>
        {[
          ["Data emiterii", work.dataEmiterii],
          ["Intervenție planificată", work.dataInterventie],
        ].map(([title, value]) => (
          <div key={title}>
            <p className="mb-2 flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {title}
            </p>
            <p className="font-medium">{value || "Nespecificată"}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
export function InstallationEquipmentList({
  data,
  workId,
  onHistory,
  onStart,
  busy,
}: {
  data: InstallationListResponse;
  workId: string;
  onHistory: (id: string) => void;
  onStart: (id: string) => void;
  busy?: boolean;
}) {
  const meta = data.work.installation;
  const { userData } = useAuth();
  const canGenerateQr =
    Boolean(userData?.role) && userData?.role !== "tehnician";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Echipamentele lucrării</CardTitle>
        <CardDescription>
          Pornește o fișă prin scanarea QR sau reia fișa activă a
          echipamentului.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!meta.equipment.length && (
          <p className="py-8 text-center text-muted-foreground">
            Nu există echipamente în acest tichet.
          </p>
        )}
        {meta.equipment.map((e) => (
          <div
            key={e.id}
            className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Box className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="break-words font-semibold">{e.name}</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  Model: {e.model || "—"} · Cod: {e.code || "—"}
                </p>
                <div className="mt-2">
                  <StatusBadge
                    status={meta.equipmentStatus[e.id] || "pending"}
                  />
                </div>
                {meta.awaitingSheetByEquipment?.[e.id] && (
                  <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                    {pendingSignatureMessage}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              {canGenerateQr && (
                <EquipmentQRCode
                  equipment={{
                    id: e.id,
                    nume: e.name,
                    cod: e.code,
                    model: e.model,
                  }}
                  clientName={data.work.client}
                  locationName={data.work.locatie}
                  showLabel={false}
                  useSimpleFormat
                  className="h-9 w-9 p-0"
                />
              )}
              {meta.awaitingSheetByEquipment?.[e.id] && (
                <Button asChild variant="outline">
                  <Link
                    href={`${pageUrl(workId)}?tab=sheets&sheetId=${encodeURIComponent(meta.awaitingSheetByEquipment[e.id])}`}
                  >
                    Vezi fișa în așteptare
                  </Link>
                </Button>
              )}
              {!meta.awaitingSheetByEquipment?.[e.id] &&
                !meta.closedReason &&
                meta.equipmentStatus[e.id] !== "done" &&
                (meta.activeSheetByEquipment[e.id] || data.canStart) && (
                  <Button
                    disabled={busy}
                    onClick={() => onStart(e.id)}
                    variant={
                      meta.activeSheetByEquipment[e.id] ? "outline" : "default"
                    }
                  >
                    <QrCode className="mr-2 h-4 w-4" />
                    {meta.activeSheetByEquipment[e.id]
                      ? "Deschide fișa activă"
                      : "Începe instalarea"}
                  </Button>
                )}
              <Button variant="outline" onClick={() => onHistory(e.id)}>
                Vezi fișele
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
export function InstallationHistory({
  data,
  history,
  workId,
  busy,
  run,
  onMore,
  filter,
  onClear,
}: {
  data: InstallationListResponse;
  history: InstallationSheet[];
  workId: string;
  busy: boolean;
  run: Run;
  onMore: () => Promise<void>;
  filter?: string;
  onClear: () => void;
}) {
  const sheets = filter
    ? history.filter((s) => s.equipmentId === filter)
    : history;
  const equipmentName = (s: InstallationSheet) =>
    data.work.installation.equipment.find((e) => e.id === s.equipmentId)
      ?.name || s.equipmentId;
  const actions = (s: InstallationSheet) => (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <Link
          href={`${pageUrl(workId)}?tab=sheets&sheetId=${encodeURIComponent(s.id)}`}
        >
          {s.canSign
            ? "Semnează fișa"
            : s.state === "closed"
              ? "Consultă fișa"
              : "Deschide"}
        </Link>
      </Button>
      {s.documentSnapshot && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run(() => pdf(s.documentSnapshot!, workId, s.id))}
        >
          <Download className="mr-2 h-4 w-4" />
          Descarcă PDF
        </Button>
      )}
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Istoric fișe zilnice</CardTitle>
        <CardDescription>
          Fișele sunt afișate de la cea mai recentă. Încarcă paginile următoare
          pentru istoricul anterior.
        </CardDescription>
        {filter && (
          <div>
            <Badge variant="secondary">
              {data.work.installation.equipment.find((e) => e.id === filter)
                ?.name || filter}
            </Badge>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Toate echipamentele
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!sheets.length && (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {data.nextCursor
              ? "Nicio fișă pentru acest echipament în paginile încărcate. Poți încărca mai multe fișe."
              : "Nu există încă fișe de montaj pentru această selecție."}
          </p>
        )}
        {!!sheets.length && (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      "Dată",
                      "Echipament",
                      "Principal",
                      "Fișă",
                      "Rezultat",
                      "Acțiuni",
                    ].map((t) => (
                      <TableHead key={t}>{t}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheets.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="whitespace-nowrap">
                        {dateLabel(s.workDate)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {equipmentName(s)}
                      </TableCell>
                      <TableCell>{s.principalName}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{sheetStateLabel(s)}</Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.installationStatus} />
                      </TableCell>
                      <TableCell>{actions(s)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="space-y-3 md:hidden">
              {sheets.map((s) => (
                <div key={s.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex justify-between gap-2">
                    <p className="font-medium">{equipmentName(s)}</p>
                    <Badge variant="secondary">{sheetStateLabel(s)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {dateLabel(s.workDate)} · {s.principalName}
                  </p>
                  <StatusBadge status={s.installationStatus} />
                  {actions(s)}
                </div>
              ))}
            </div>
          </>
        )}
        {data.nextCursor && (
          <div className="mt-5 border-t pt-4">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(onMore)}
            >
              Mai multe fișe
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export function InstallationDocuments({
  data,
  workId,
  manager,
  busy,
  run,
  onContinue,
  onComplete,
}: {
  data: InstallationListResponse;
  workId: string;
  manager: boolean;
  busy: boolean;
  run: Run;
  onContinue: () => Promise<void>;
  onComplete: () => void;
}) {
  const meta = data.work.installation;
  const active = Object.keys(meta.activeSheetByEquipment).length;
  const awaiting = Object.keys(meta.awaitingSheetByEquipment || {}).length;
  const allDone =
    data.work.equipmentIds.length > 0 &&
    data.work.equipmentIds.every((id) => meta.equipmentStatus[id] === "done");
  const canComplete =
    data.canStart &&
    allDone &&
    !active &&
    !awaiting &&
    !meta.closedReason &&
    !data.completion;
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="mb-2 w-fit rounded-lg bg-muted p-3">
            <FileText className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg">Proces-verbal final</CardTitle>
          <CardDescription>
            Predarea lucrării către beneficiar, după finalizarea tuturor
            echipamentelor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.completion ? (
            <>
              <Badge
                className="bg-green-100 text-green-800"
                variant="secondary"
              >
                Semnat și disponibil
              </Badge>
              <p className="text-sm text-muted-foreground">
                {data.completion.documentSnapshot.technicianName} ·{" "}
                {data.completion.documentSnapshot.beneficiaryName}
              </p>
              {data.completion.documentSnapshot.observations && (
                <p className="whitespace-pre-wrap text-sm">
                  {data.completion.documentSnapshot.observations}
                </p>
              )}
              <Button
                disabled={busy}
                onClick={() =>
                  void run(() => pdf(data.completion!.documentSnapshot, workId))
                }
              >
                Descarcă procesul-verbal final
              </Button>
            </>
          ) : (
            <>
              <ul className="space-y-2 text-sm">
                <li>
                  {allDone ? "✓" : "○"} Toate echipamentele acestui tichet sunt
                  finalizate
                </li>
                <li>
                  {!active && !awaiting ? "✓" : "○"} Toate fișele active sunt
                  închise și semnate
                </li>
                <li>
                  {data.canStart ? "✓" : "○"} Semnează un tehnician atribuit
                  tichetului terminal
                </li>
              </ul>
              {!!awaiting && (
                <p className="text-sm text-amber-800">
                  Semnează fișele în așteptare înainte de procesul-verbal final.
                </p>
              )}
              {meta.continuationWorkId && (
                <p className="text-sm text-muted-foreground">
                  Procesul-verbal se întocmește pe tichetul terminal al
                  lucrării.
                </p>
              )}
              {canComplete && (
                <Button disabled={busy} onClick={onComplete}>
                  Proces-verbal de terminare
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Continuitatea lucrării</CardTitle>
          <CardDescription>
            Istoricul lucrării și replanificarea echipamentelor rămase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {workId !== meta.rootWorkId ? (
            <Button asChild variant="outline">
              <Link href={pageUrl(meta.rootWorkId) + "?tab=sheets"}>
                Istoricul lucrării inițiale
              </Link>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Acesta este tichetul inițial al lucrării.
            </p>
          )}
          {meta.continuationWorkId && (
            <Button asChild variant="outline">
              <Link href={`/dashboard/lucrari/${meta.continuationWorkId}`}>
                Deschide tichetul de continuare
              </Link>
            </Button>
          )}
          {!meta.continuationWorkId && !allDone && (
            <p className="text-sm text-muted-foreground">
              Continuarea se poate crea după închiderea tuturor fișelor active.
              Echipamentele neterminate revin în listă fără tehnicieni
              atribuiți.
            </p>
          )}
          {!!awaiting && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {pendingSignatureMessage}
            </p>
          )}
          {manager &&
            !meta.closedReason &&
            !active &&
            !allDone &&
            meta.startedEquipmentIds.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={busy || !!awaiting} variant="outline">
                    Trimite restul spre replanificare
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Replanifici echipamentele rămase?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Se creează un tichet de instalare cu status „Listată”,
                      fără tehnicieni atribuiți. Fișele și documentele existente
                      rămân în istoricul lucrării.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Renunță</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void run(onContinue)}>
                      Confirmă replanificarea
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
