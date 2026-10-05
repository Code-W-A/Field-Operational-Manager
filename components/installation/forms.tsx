"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "@/components/signature-pad";
import { useAuth } from "@/contexts/AuthContext";
import {
  installationApi,
  installationRequest,
} from "@/lib/installations/client";
import type {
  InstallationFields,
  InstallationSheet,
} from "@/types/installation";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { pdf, statuses, dateLabel } from "./shared";
export function InstallationSheetForm({
  workId,
  sheet,
  onSheet,
  onRefresh,
}: {
  workId: string;
  sheet: InstallationSheet;
  onSheet: (s: InstallationSheet) => void;
  onRefresh: () => Promise<void>;
}) {
  const { userData } = useAuth();
  const [content, setContent] = useState<InstallationFields>({
    finding: sheet.finding,
    operations: sheet.operations,
    installationStatus: sheet.installationStatus,
    blockReason: sheet.blockReason,
    internalNote: sheet.internalNote || "",
  });
  const [technicianSignature, setTechSignature] = useState("");
  const [beneficiarySignature, setBeneficiarySignature] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.href === window.location.href
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(link.href);
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [dirty]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const editable =
    sheet.state === "draft" && sheet.principalUid === userData?.uid;
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operația a eșuat.");
    } finally {
      setBusy(false);
    }
  }
  async function save(close: boolean) {
    await run(async () => {
      const result = await installationRequest(installationApi(workId), {
        action: close ? "close" : "save",
        sheetId: sheet.id,
        fields: content,
        revision: sheet.revision,
        signatures: {
          technicianSignature,
          beneficiarySignature,
          beneficiaryName,
        },
      });
      onSheet(result.sheet);
      setDirty(false);
      setNotice(
        close
          ? "Fișa zilei a fost închisă și semnată."
          : "Ciorna a fost salvată.",
      );
      if (close) await onRefresh();
    });
  }
  const change = (key: keyof InstallationFields, value: string) => {
    setContent((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  };
  return (
    <section className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h3 className="font-semibold">
              Fișa din {dateLabel(sheet.workDate)} · {sheet.principalName}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {sheet.state === "closed"
                ? "Document semnat, disponibil pentru consultare și descărcare."
                : editable
                  ? "Completează fișa și salvează progresul înainte de închiderea zilei."
                  : "Doar principalul acestei fișe o poate modifica."}
            </p>
          </div>
          <Badge variant="secondary">
            {busy
              ? "Se salvează…"
              : dirty
                ? "Modificări nesalvate"
                : sheet.state === "closed"
                  ? "Semnată"
                  : "Ciornă salvată"}
          </Badge>
        </CardContent>
      </Card>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-green-700">
          {notice}
        </p>
      )}
      {!editable ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lucrări executate</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <ReadField title="Constatare la locație" value={sheet.finding} />
              <ReadField
                title="Operațiuni executate"
                value={sheet.operations}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Status și blocaj</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {sheet.state === "closed" ? "Fișă semnată" : "Ciornă"} ·{" "}
                {statuses[sheet.installationStatus]}
              </p>
              {sheet.blockReason && (
                <ReadField
                  title="Motivul blocajului"
                  value={sheet.blockReason}
                />
              )}
            </CardContent>
          </Card>
          {sheet.internalNote !== undefined && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notă internă</CardTitle>
              </CardHeader>
              <CardContent>
                <ReadField title="Nu apare în PDF" value={sheet.internalNote} />
              </CardContent>
            </Card>
          )}
          {sheet.documentSnapshot && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Semnături</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    [
                      sheet.documentSnapshot.technicianName,
                      sheet.documentSnapshot.technicianSignature,
                    ],
                    [
                      sheet.documentSnapshot.beneficiaryName,
                      sheet.documentSnapshot.beneficiarySignature,
                    ],
                  ].map(([name, signature], i) => (
                    <div key={i} className="rounded-lg border p-4">
                      <p className="mb-3 text-sm font-medium">
                        {i === 0 ? "Tehnician" : "Beneficiar"}: {name}
                      </p>
                      <img
                        src={signature}
                        alt={
                          i === 0
                            ? "Semnătura tehnicianului"
                            : "Semnătura beneficiarului"
                        }
                        className="h-28 w-full object-contain"
                      />
                    </div>
                  ))}
                </div>
                <Button
                  className="mt-4"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      pdf(sheet.documentSnapshot!, workId, sheet.id),
                    )
                  }
                >
                  Descarcă PDF
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          <fieldset disabled={busy} className="space-y-5">
            <FormSection
              title="Lucrări executate"
              description="Constatarea și operațiunile sunt obligatorii la închiderea fișei."
            >
              <div>
                <Label htmlFor="installation-finding">
                  Constatare la locație *
                </Label>
                <Textarea
                  className="min-h-[140px] resize-y"
                  id="installation-finding"
                  maxLength={6000}
                  value={content.finding}
                  onChange={(e) => change("finding", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="installation-operations">
                  Operațiuni executate *
                </Label>
                <Textarea
                  className="min-h-[140px] resize-y"
                  id="installation-operations"
                  maxLength={6000}
                  value={content.operations}
                  onChange={(e) => change("operations", e.target.value)}
                />
              </div>
            </FormSection>
            <FormSection
              title="Status și blocaj"
              description="Alege rezultatul instalării pentru această zi."
            >
              <div>
                <Label htmlFor="installation-status">Statusul instalării</Label>
                <select
                  id="installation-status"
                  className="block w-full rounded border p-2"
                  value={content.installationStatus}
                  onChange={(e) => change("installationStatus", e.target.value)}
                >
                  <option value="in_progress">În lucru</option>
                  <option value="blocked">Blocat</option>
                  <option value="completed">Finalizat</option>
                </select>
              </div>
              {content.installationStatus === "blocked" && (
                <div>
                  <Label htmlFor="installation-block">
                    Motivul blocajului *
                  </Label>
                  <Textarea
                    className="min-h-[140px] resize-y"
                    id="installation-block"
                    maxLength={6000}
                    value={content.blockReason}
                    onChange={(e) => change("blockReason", e.target.value)}
                  />
                </div>
              )}
            </FormSection>
            <FormSection
              title="Fotografii"
              description="Opționale. Maximum patru fotografii pe fișă, inclusiv cele deja salvate."
            >
              <div>
                <Label htmlFor="installation-photos">
                  Fotografii ({sheet.photos.length}/4)
                </Label>
                <Input
                  id="installation-photos"
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={sheet.photos.length >= 4}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    void run(async () => {
                      if (files.length + sheet.photos.length > 4)
                        throw new Error(
                          "Maximum 4 fotografii pe fișă, inclusiv cele salvate.",
                        );
                      for (const file of files) {
                        const compressed = await compressPhoto(file);
                        const form = new FormData();
                        form.set("sheetId", sheet.id);
                        form.set("file", compressed);
                        const result = await installationRequest(
                          `${installationApi(workId)}/photos`,
                          form,
                        );
                        onSheet(result.sheet);
                      }
                    });
                  }}
                />
              </div>
              <PhotoGallery
                workId={workId}
                sheet={sheet}
                editable={editable}
                busy={busy}
                run={run}
                onSheet={onSheet}
              />
            </FormSection>
            <FormSection
              title="Notă internă"
              description="Vizibilă principalului și dispecerului / administratorului."
            >
              <div>
                <Label htmlFor="installation-note">
                  Notă internă — nu apare în PDF
                </Label>
                <Textarea
                  className="min-h-[140px] resize-y"
                  id="installation-note"
                  maxLength={6000}
                  value={content.internalNote}
                  onChange={(e) => change("internalNote", e.target.value)}
                />
              </div>
            </FormSection>
          </fieldset>

          <fieldset disabled={busy}>
            <FormSection
              title="Semnături"
              description="Confirmarea lucrărilor de către tehnician și beneficiar."
            >
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Închiderea zilei necesită ambele semnături. „Finalizat”
                  încheie și instalarea echipamentului.
                </p>
                <Label htmlFor="installation-beneficiary">
                  Numele beneficiarului *
                </Label>
                <Input
                  disabled={busy}
                  id="installation-beneficiary"
                  maxLength={200}
                  value={beneficiaryName}
                  onChange={(e) => {
                    setBeneficiaryName(e.target.value);
                    setDirty(true);
                  }}
                />
                <div className="grid gap-4 xl:grid-cols-2 [&>div]:min-w-0 [&_[class*=justify-between]]:flex-wrap [&_[class*=justify-between]]:gap-2">
                  <SignaturePad
                    title={`Semnătura tehnicianului — ${sheet.principalName}`}
                    onClear={() => {
                      setTechSignature("");
                      setDirty(true);
                    }}
                    onSave={(value) => {
                      setTechSignature(value);
                      setDirty(true);
                    }}
                    existingSignature={technicianSignature}
                  />
                  <SignaturePad
                    title="Semnătura beneficiarului"
                    onClear={() => {
                      setBeneficiarySignature("");
                      setDirty(true);
                    }}
                    onSave={(value) => {
                      setBeneficiarySignature(value);
                      setDirty(true);
                    }}
                    existingSignature={beneficiarySignature}
                  />
                </div>
              </div>
            </FormSection>
          </fieldset>
          <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-lg border bg-background/95 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {dirty
                ? "Deschide o altă pagină numai după salvarea modificărilor."
                : "Progresul completat este salvat."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void save(false)}
              >
                Salvează ciorna
              </Button>
              <Button
                disabled={
                  busy ||
                  !technicianSignature ||
                  !beneficiarySignature ||
                  !beneficiaryName.trim()
                }
                onClick={() => void save(true)}
              >
                Închide fișa zilei
              </Button>
            </div>
          </div>
        </>
      )}
      {!editable && (
        <FormSection
          title={`Fotografii · ${sheet.photos.length}/4`}
          description="Fotografiile atașate fișei de montaj."
        >
          <PhotoGallery
            workId={workId}
            sheet={sheet}
            editable={false}
            busy={busy}
            run={run}
            onSheet={onSheet}
          />
        </FormSection>
      )}
      <AlertDialog
        open={!!pendingHref}
        onOpenChange={(open) => {
          if (!open) setPendingHref(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ai modificări nesalvate</AlertDialogTitle>
            <AlertDialogDescription>
              Salvează ciorna pentru a păstra modificările înainte de a părăsi
              fișa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Rămân pe fișă</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const href = pendingHref;
                setDirty(false);
                setPendingHref(null);
                if (href) router.push(href);
              }}
            >
              Părăsesc fără salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function InstallationCompletionForm({
  workId,
  onComplete,
}: {
  workId: string;
  onComplete: () => Promise<void>;
}) {
  const { userData } = useAuth();
  const [observations, setObservations] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [technicianSignature, setTechnicianSignature] = useState("");
  const [beneficiarySignature, setBeneficiarySignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="space-y-5">
      <h2 className="text-lg font-semibold">
        Proces-verbal de terminare a lucrării
      </h2>
      <fieldset disabled={busy} className="space-y-5">
        <FormSection
          title="Observații finale"
          description="Detalii opționale pentru predarea lucrării către beneficiar."
        >
          <Label htmlFor="completion-observations">Observații finale</Label>
          <Textarea
            className="min-h-[140px] resize-y"
            id="completion-observations"
            maxLength={6000}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
          />
        </FormSection>
        <FormSection
          title="Semnături"
          description="Procesul-verbal finalizează lucrarea după semnarea de către tehnician și beneficiar."
        >
          <Label htmlFor="completion-beneficiary">
            Numele beneficiarului *
          </Label>
          <Input
            id="completion-beneficiary"
            maxLength={200}
            value={beneficiaryName}
            onChange={(e) => setBeneficiaryName(e.target.value)}
          />
          <div className="grid gap-4 xl:grid-cols-2 [&>div]:min-w-0 [&_[class*=justify-between]]:flex-wrap [&_[class*=justify-between]]:gap-2">
            <SignaturePad
              title={`Semnătura tehnicianului — ${userData?.displayName}`}
              onClear={() => setTechnicianSignature("")}
              onSave={setTechnicianSignature}
              existingSignature={technicianSignature}
            />
            <SignaturePad
              title="Semnătura beneficiarului"
              onClear={() => setBeneficiarySignature("")}
              onSave={setBeneficiarySignature}
              existingSignature={beneficiarySignature}
            />
          </div>
        </FormSection>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <Button
          disabled={
            busy ||
            !technicianSignature ||
            !beneficiarySignature ||
            !beneficiaryName.trim()
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await installationRequest(installationApi(workId), {
                action: "complete",
                observations,
                signatures: {
                  beneficiaryName,
                  technicianSignature,
                  beneficiarySignature,
                },
              });
              await onComplete();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Emiterea a eșuat.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Semnează și finalizează lucrarea
        </Button>
      </fieldset>
    </section>
  );
}

async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/"))
    throw new Error("Selectați o fotografie.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Fotografia nu poate fi procesată.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8),
    );
    if (!blob) throw new Error("Fotografia nu poate fi comprimată.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
function ReadField({ title, value }: { title: string; value?: string }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-muted-foreground">{title}</p>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {value || "Nespecificat"}
      </p>
    </div>
  );
}
function PhotoGallery({
  workId,
  sheet,
  editable,
  busy,
  run,
  onSheet,
}: {
  workId: string;
  sheet: InstallationSheet;
  editable: boolean;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  onSheet: (sheet: InstallationSheet) => void;
}) {
  return sheet.photos.length ? (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {sheet.photos.map((p) => (
        <div key={p.id} className="overflow-hidden rounded-lg border">
          <img
            className="aspect-video w-full object-cover"
            alt={p.name}
            src={`${installationApi(workId)}/photos?sheetId=${encodeURIComponent(sheet.id)}&photoId=${encodeURIComponent(p.id)}`}
          />
          <div className="p-2">
            <p className="truncate text-xs text-muted-foreground">{p.name}</p>
            {editable && (
              <Button
                className="mt-2 w-full"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await installationRequest(
                      `${installationApi(workId)}/photos`,
                      { sheetId: sheet.id, photoId: p.id },
                      "DELETE",
                    );
                    onSheet(result.sheet);
                  })
                }
              >
                Șterge fotografia
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
      Nicio fotografie atașată.
    </p>
  );
}
