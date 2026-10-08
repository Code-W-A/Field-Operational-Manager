"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QRCodeScanner } from "@/components/qr-code-scanner";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { DashboardHeader } from "@/components/dashboard-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  installationApi,
  installationRequest,
} from "@/lib/installations/client";
import type {
  InstallationListResponse,
  InstallationSheet,
} from "@/types/installation";
import {
  InstallationSummary,
  InstallationContext,
  InstallationEquipmentList,
  InstallationHistory,
  InstallationDocuments,
} from "./installation/overview";
import {
  InstallationSheetForm,
  InstallationCompletionForm,
} from "./installation/forms";
import { InstallationTeam } from "./installation/team";
import { sheetParticipants } from "@/lib/installations/team";
import { pageUrl, StatusBadge, dateLabel } from "./installation/shared";

export function InstallationWorkspace({
  workId,
  equipmentId,
  sheetId,
  compact = false,
  complete = false,
  ticketDetails,
  onEdit,
}: {
  workId: string;
  equipmentId?: string;
  sheetId?: string;
  compact?: boolean;
  complete?: boolean;
  ticketDetails?: ReactNode;
  onEdit?: () => void;
}) {
  const { userData } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const requestedTab = search.get("tab");
  const tab = complete
    ? "documents"
    : ["equipment", "sheets", "documents"].includes(requestedTab || "")
      ? requestedTab!
      : "equipment";
  const [data, setData] = useState<InstallationListResponse | null>(null);
  const [history, setHistory] = useState<InstallationSheet[]>([]);
  const [selected, setSelected] = useState<InstallationSheet | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanEquipmentId, setScanEquipmentId] = useState<string>();
  const autoScanOpened = useRef("");
  const [filter, setFilter] = useState<string>();
  const scanRequest = useRef<string | null>(null);
  const scanningRequest = useRef(false);
  const load = useCallback(async () => {
    const result: InstallationListResponse = await installationRequest(
      installationApi(workId),
    );
    setHistory(result.sheets);
    const activeId =
      sheetId ||
      (equipmentId
        ? result.work.installation.activeSheetByEquipment[equipmentId] ||
          result.work.installation.awaitingSheetByEquipment?.[equipmentId]
        : undefined);
    if (activeId) {
      const selection: InstallationListResponse = await installationRequest(
        `${installationApi(workId)}?sheetId=${encodeURIComponent(activeId)}`,
      );
      const found = selection.sheets[0];
      const needsQr =
        !sheetId &&
        equipmentId &&
        result.canStart &&
        found?.state === "draft" &&
        !sheetParticipants(found).some(
          (p) => p.uid === userData?.uid && p.active,
        );
      setSelected(needsQr ? null : found || null);
      if (!selection.sheets.length)
        throw new Error("Fișa solicitată nu este disponibilă.");
    } else setSelected(null);
    setData(result);
  }, [workId, sheetId, equipmentId, userData?.uid]);
  useEffect(() => {
    setData(null);
    setSelected(null);
    setScanEquipmentId(undefined);
    setError("");
    scanRequest.current = null;
    autoScanOpened.current = "";
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operația a eșuat.");
    } finally {
      setBusy(false);
    }
  }
  function chooseTab(value: string) {
    const query = new URLSearchParams(search.toString());
    query.set("tab", value);
    query.delete("complete");
    router.replace(`${pathname}?${query}`, { scroll: false });
  }
  function beginEquipment(id: string) {
    const activeId = data?.work.installation.activeSheetByEquipment[id];
    if (
      activeId &&
      (!data?.canStart || data?.currentSession?.sheetId === activeId)
    ) {
      router.push(
        `${pageUrl(workId)}?tab=sheets&sheetId=${encodeURIComponent(activeId)}`,
      );
      return;
    }
    if (data?.currentSession?.role === "principal") {
      setError(
        "Ai o fișă în lucru ca principal. Oprește lucrul pe aceasta înainte de a începe alta.",
      );
      return;
    }
    scanRequest.current = null;
    setError("");
    setScanEquipmentId(id);
  }
  useEffect(() => {
    if (
      !data ||
      !equipmentId ||
      selected ||
      !data.canStart ||
      data.work.installation.closedReason ||
      data.work.installation.equipmentStatus[equipmentId] === "done" ||
      data.work.installation.awaitingSheetByEquipment?.[equipmentId]
    )
      return;
    const key = `${workId}:${equipmentId}`;
    if (autoScanOpened.current === key) return;
    autoScanOpened.current = key;
    beginEquipment(equipmentId);
  }, [data, equipmentId, selected, workId]);
  async function scan(qrRaw: string) {
    if (scanningRequest.current || !scanEquipmentId)
      throw new Error("Verificarea este deja în curs.");
    scanningRequest.current = true;
    scanRequest.current ||= crypto.randomUUID();
    setBusy(true);
    try {
      const result = await installationRequest(installationApi(workId), {
        action: "start",
        equipmentId: scanEquipmentId,
        qrRaw,
        requestId: scanRequest.current,
      });
      setScanEquipmentId(undefined);
      router.push(
        `${pageUrl(workId)}?tab=sheets&sheetId=${encodeURIComponent(result.sheet.id)}`,
      );
    } finally {
      scanningRequest.current = false;
      setBusy(false);
    }
  }
  const manager = ["admin", "dispecer"].includes(userData?.role || "");
  const meta = data?.work.installation;
  const technician = userData?.role === "tehnician";
  const scanEquipment = meta?.equipment.find((e) => e.id === scanEquipmentId);
  const equipment = meta?.equipment.find(
    (e) => e.id === (selected?.equipmentId || equipmentId),
  );
  const allDone =
    !!data?.work.equipmentIds.length &&
    data.work.equipmentIds.every((id) => meta?.equipmentStatus[id] === "done");
  const canComplete =
    data?.canStart &&
    allDone &&
    !Object.keys(meta?.activeSheetByEquipment || {}).length &&
    !Object.keys(meta?.awaitingSheetByEquipment || {}).length &&
    !meta?.closedReason &&
    !data?.completion;
  const content = (
    <div className="space-y-5 pb-6">
      <DashboardHeader
        heading={
          <span className="flex flex-wrap items-center gap-3">
            <span>Instalare {data?.work.nrLucrare || ""}</span>
            {data && <StatusBadge status={data.work.statusLucrare} />}
          </span>
        }
        text={
          data
            ? `${data.work.client} · ${data.work.locatie}`
            : "Se încarcă datele tichetului…"
        }
      >
        <Button asChild variant="outline">
          <Link
            href={
              compact ? "/dashboard/lucrari" : `/dashboard/lucrari/${workId}`
            }
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {compact ? "Înapoi la tichete" : "Înapoi la tichet"}
          </Link>
        </Button>
        {manager &&
          data &&
          !meta?.closedReason &&
          (onEdit ? (
            <Button variant="outline" onClick={onEdit}>
              Editează tichetul / echipamentele
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href={`/dashboard/lucrari/${workId}?edit=1`}>
                Editează tichetul / echipamentele
              </Link>
            </Button>
          ))}
        <Button
          variant="outline"
          size="icon"
          aria-label="Reîncarcă datele"
          disabled={busy || selected?.state === "draft"}
          onClick={() => void run(load)}
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        </Button>
      </DashboardHeader>
      {scanEquipment && data && (
        <QRCodeScanner
          key={scanEquipment.id}
          open={Boolean(scanEquipmentId)}
          onOpenChange={(open) => {
            if (!open && !scanningRequest.current)
              setScanEquipmentId(undefined);
          }}
          hideTrigger
          expectedEquipmentCode={scanEquipment.code}
          expectedClientName={data.work.client}
          expectedLocationName={data.work.locatie}
          onValidateRaw={scan}
        />
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {!data ? (
        error ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(load)}
          >
            Reîncarcă
          </Button>
        ) : (
          <div aria-label="Se încarcă instalarea" className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <Skeleton className="h-64" />
          </div>
        )
      ) : (
        <>
          {!compact && selected ? (
            <>
              <Button asChild variant="ghost" className="px-0">
                <Link href={pageUrl(workId) + "?tab=sheets"}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Înapoi la fișele zilnice
                </Link>
              </Button>
              {!technician && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        Fișă zilnică · {dateLabel(selected.workDate)}
                      </CardTitle>
                      <CardDescription>
                        {equipment?.name} · Model: {equipment?.model || "—"} ·
                        Cod: {equipment?.code || "—"}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                  <InstallationTeam sheet={selected} />
                </>
              )}
              {technician && <InstallationTeam sheet={selected} compact />}
              {data.canStart &&
                selected.state === "draft" &&
                !sheetParticipants(selected).some(
                  (p) => p.uid === userData?.uid && p.active,
                ) && (
                  <Button
                    variant="outline"
                    onClick={() => beginEquipment(selected.equipmentId)}
                  >
                    Alătură-te prin QR
                  </Button>
                )}
              <InstallationSheetForm
                key={selected.id}
                workId={workId}
                sheet={selected}
                onSheet={setSelected}
                onRefresh={async () => {
                  const refreshed: InstallationListResponse =
                    await installationRequest(installationApi(workId));
                  setData(refreshed);
                  setHistory(refreshed.sheets);
                }}
              />
              {selected.state === "closed" && canComplete && (
                <Button
                  onClick={() =>
                    router.push(pageUrl(workId) + "?tab=documents&complete=1")
                  }
                >
                  Proces-verbal de terminare
                </Button>
              )}
            </>
          ) : (
            <>
              {ticketDetails}
              <InstallationSummary data={data} hideStats={technician} />
              {!ticketDetails && <InstallationContext data={data} />}
              <Tabs value={tab} onValueChange={chooseTab} className="space-y-5">
                <TabsList className="grid h-auto w-full grid-cols-3 p-1 sm:w-fit">
                  <TabsTrigger value="equipment" className="px-2 py-2 sm:px-6">
                    Echipamente
                  </TabsTrigger>
                  <TabsTrigger value="sheets" className="px-2 py-2 sm:px-6">
                    Fișe zilnice
                  </TabsTrigger>
                  <TabsTrigger value="documents" className="px-2 py-2 sm:px-6">
                    Documente
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="equipment" className="space-y-4">
                  <InstallationEquipmentList
                    data={data}
                    workId={workId}
                    onStart={beginEquipment}
                    busy={busy}
                    onHistory={(id) => {
                      setFilter(id);
                      chooseTab("sheets");
                    }}
                  />
                </TabsContent>
                <TabsContent value="sheets">
                  <InstallationHistory
                    data={data}
                    history={history}
                    workId={workId}
                    busy={busy}
                    run={run}
                    filter={filter}
                    onClear={() => setFilter(undefined)}
                    onMore={async () => {
                      const result: InstallationListResponse =
                        await installationRequest(
                          `${installationApi(workId)}?cursor=${encodeURIComponent(data.nextCursor!)}`,
                        );
                      setHistory((previous) => [
                        ...previous,
                        ...result.sheets.filter(
                          (s) => !previous.some((old) => old.id === s.id),
                        ),
                      ]);
                      setData((previous) =>
                        previous
                          ? { ...previous, nextCursor: result.nextCursor }
                          : previous,
                      );
                    }}
                  />
                </TabsContent>
                <TabsContent value="documents" className="space-y-4">
                  <InstallationDocuments
                    data={data}
                    workId={workId}
                    manager={manager}
                    busy={busy}
                    run={run}
                    onContinue={async () => {
                      await installationRequest(installationApi(workId), {
                        action: "continue",
                      });
                      await load();
                    }}
                    onComplete={() =>
                      router.push(pageUrl(workId) + "?tab=documents&complete=1")
                    }
                  />
                  {complete && canComplete && (
                    <InstallationCompletionForm
                      workId={workId}
                      onComplete={load}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </>
      )}
    </div>
  );
  return compact ? content : <DashboardShell>{content}</DashboardShell>;
}
