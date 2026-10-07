"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  LucrareForm,
  type ActiveWorkSummary,
  type LucrareFormRef,
} from "@/components/lucrare-form";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";
import { Loader2, Plus } from "lucide-react";

type LucrareFormProps = React.ComponentProps<typeof LucrareForm>;

export interface TicketDialogProps {
  mode?: "create" | "edit";
  initialData?: LucrareFormProps["initialData"];
  currentWorkOrderId?: string;
  beforeForm?: React.ReactNode;
  error?: string;

  open: boolean;
  setOpen: (open: boolean) => void;
  onClose: () => void;
  dataEmiterii: LucrareFormProps["dataEmiterii"];
  setDataEmiterii: LucrareFormProps["setDataEmiterii"];
  dataInterventie: LucrareFormProps["dataInterventie"];
  setDataInterventie: LucrareFormProps["setDataInterventie"];
  formData: LucrareFormProps["formData"];
  handleInputChange: LucrareFormProps["handleInputChange"];
  handleSelectChange: LucrareFormProps["handleSelectChange"];
  handleTehnicieniChange: LucrareFormProps["handleTehnicieniChange"];
  handleCustomChange: LucrareFormProps["handleCustomChange"];
  fieldErrors?: LucrareFormProps["fieldErrors"];
  setFieldErrors?: LucrareFormProps["setFieldErrors"];
  isReintervention?: boolean;
  originalWorkOrderId?: string;
  onActiveWorkChange?: LucrareFormProps["onActiveWorkChange"];
  formRef?: React.Ref<LucrareFormRef>;
  activeWorkCount?: number;
  activeWorkEquipmentName?: string;
  activeWorkItems?: ActiveWorkSummary[];
  isSubmitting?: boolean;
  missingFieldsMessage?: string;
  onSave: () => void;
}

export const TicketDialog: React.FC<TicketDialogProps> = ({
  mode = "create",
  initialData,
  currentWorkOrderId,
  beforeForm,
  error,
  open,
  setOpen,
  onClose,
  dataEmiterii,
  setDataEmiterii,
  dataInterventie,
  setDataInterventie,
  formData,
  handleInputChange,
  handleSelectChange,
  handleTehnicieniChange,
  handleCustomChange,
  fieldErrors,
  setFieldErrors,
  isReintervention,
  originalWorkOrderId,
  onActiveWorkChange,
  formRef,
  activeWorkCount = 0,
  activeWorkEquipmentName = "",
  activeWorkItems = [],
  isSubmitting = false,
  missingFieldsMessage,
  onSave,
}) => {
  const [submitPending, setSubmitPending] = React.useState(false);
  const submitLock = React.useRef(false);
  const busy = isSubmitting || submitPending;
  const save = async () => {
    if (busy || submitLock.current) return;
    submitLock.current = true;
    setSubmitPending(true);
    try {
      await onSave();
    } finally {
      submitLock.current = false;
      setSubmitPending(false);
    }
  };
  const internalFormRef = React.useRef<LucrareFormRef | null>(null);
  const [confirmClose, setConfirmClose] = React.useState(false);
  const close = () => {
    if (busy) return;
    if (internalFormRef.current?.hasUnsavedChanges()) setConfirmClose(true);
    else onClose();
  };
  const originalInfo = (formData as any)?.originalWorkOrderInfo;
  const hasActiveWork = mode === "create" && activeWorkCount > 0;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            close();
          } else {
            setOpen(nextOpen);
          }
        }}
      >
        {mode === "create" && (
          <DialogTrigger asChild>
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Plus className="mr-2 h-4 w-4" />{" "}
              <span className="hidden sm:inline">Adaugă</span> Tichet
            </Button>
          </DialogTrigger>
        )}
        <DialogContent
          className="w-[calc(100%-2rem)] max-w-4xl max-h-[90dvh] overflow-y-auto"
          onPointerDownOutside={(event) => {
            const target = event.detail.originalEvent.target;
            // The shared primitive intentionally prevents outside dismissal. Only our
            // own overlay starts a guarded close; nested pickers/dialogs stay open.
            if (
              target instanceof Element &&
              target.matches('[data-state="open"].fixed.inset-0') &&
              document.querySelectorAll(
                '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
              ).length === 1
            )
              close();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            close();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Editează Tichet" : "Adaugă Tichet Nou"}
            </DialogTitle>
          </DialogHeader>

          {/* Banner pentru re-intervenții */}
          {isReintervention && originalWorkOrderId && (
            <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-md">
              <div className="flex items-center">
                <span className="text-blue-800 font-medium">
                  Re-intervenție: Acest formular este precompletat cu datele din
                  lucrarea originală pentru{" "}
                  <strong>{originalInfo || originalWorkOrderId}</strong>
                  <span className="ml-2 text-xs text-blue-700">
                    (Câmpurile client/locație/echipament sunt înghețate)
                  </span>
                </span>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {beforeForm}
          <LucrareForm
            ref={(instance) => {
              internalFormRef.current = instance;
              if (typeof formRef === "function") formRef(instance);
              else if (formRef)
                (
                  formRef as React.MutableRefObject<LucrareFormRef | null>
                ).current = instance;
            }}
            isEdit={mode === "edit"}
            initialData={initialData}
            preserveContactDraft={mode === "edit"}
            dataEmiterii={dataEmiterii}
            setDataEmiterii={setDataEmiterii}
            dataInterventie={dataInterventie}
            setDataInterventie={setDataInterventie}
            formData={formData}
            handleInputChange={handleInputChange}
            handleSelectChange={handleSelectChange}
            handleTehnicieniChange={handleTehnicieniChange}
            handleCustomChange={handleCustomChange}
            fieldErrors={fieldErrors}
            setFieldErrors={setFieldErrors}
            isReintervention={isReintervention}
            onActiveWorkChange={onActiveWorkChange}
            currentWorkOrderId={
              currentWorkOrderId || originalWorkOrderId || undefined
            }
          />

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {hasActiveWork && (
              <div className="w-full text-xs text-destructive sm:mr-auto">
                <p>
                  Există deja un tichet activ pentru echipamentul{" "}
                  <strong>
                    {activeWorkEquipmentName ||
                      formData.echipament ||
                      "selectat"}
                  </strong>
                  . Nu puteți salva o lucrare nouă.
                </p>
                {activeWorkItems.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {activeWorkItems.map((work) => (
                      <div
                        key={work.id}
                        className="flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-2 py-1"
                      >
                        <div className="truncate">
                          <span className="font-medium">{work.nrDisplay}</span>
                          <span className="ml-1">
                            ({work.statusLucrare || "N/A"})
                          </span>
                          {originalWorkOrderId &&
                          work.id === originalWorkOrderId ? (
                            <span className="ml-2 text-[10px] uppercase tracking-wide">
                              acest tichet
                            </span>
                          ) : null}
                        </div>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                        >
                          <Link href={`/dashboard/lucrari/${work.id}`}>
                            Deschide
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1">
                    Nu s-au putut încărca detalii despre conflict, dar blocajul
                    rămâne activ pentru protecția datelor.
                  </p>
                )}
              </div>
            )}
            <Button variant="outline" onClick={close} disabled={busy}>
              Anulează
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => void save()}
              disabled={busy || hasActiveWork}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se
                  procesează...
                </>
              ) : mode === "edit" ? (
                "Actualizează"
              ) : (
                "Salvează"
              )}
            </Button>
          </DialogFooter>
          {missingFieldsMessage && (
            <div className="mt-2 text-xs text-destructive">
              {missingFieldsMessage}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <UnsavedChangesDialog
        open={confirmClose}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
      />
    </>
  );
};
