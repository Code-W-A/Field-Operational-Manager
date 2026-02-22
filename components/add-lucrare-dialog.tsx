"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LucrareForm, type ActiveWorkSummary, type LucrareFormRef } from "@/components/lucrare-form"
import { Loader2, Plus } from "lucide-react"

type LucrareFormProps = React.ComponentProps<typeof LucrareForm>

interface AddLucrareDialogProps {
  open: boolean
  setOpen: (open: boolean) => void
  onClose: () => void
  dataEmiterii: LucrareFormProps["dataEmiterii"]
  setDataEmiterii: LucrareFormProps["setDataEmiterii"]
  dataInterventie: LucrareFormProps["dataInterventie"]
  setDataInterventie: LucrareFormProps["setDataInterventie"]
  formData: LucrareFormProps["formData"]
  handleInputChange: LucrareFormProps["handleInputChange"]
  handleSelectChange: LucrareFormProps["handleSelectChange"]
  handleTehnicieniChange: LucrareFormProps["handleTehnicieniChange"]
  handleCustomChange: LucrareFormProps["handleCustomChange"]
  fieldErrors?: LucrareFormProps["fieldErrors"]
  setFieldErrors?: LucrareFormProps["setFieldErrors"]
  isReintervention?: boolean
  originalWorkOrderId?: string
  onActiveWorkChange?: LucrareFormProps["onActiveWorkChange"]
  formRef?: React.Ref<LucrareFormRef>
  activeWorkCount?: number
  activeWorkEquipmentName?: string
  activeWorkItems?: ActiveWorkSummary[]
  isSubmitting?: boolean
  missingFieldsMessage?: string
  onSave: () => void
}

export const AddLucrareDialog: React.FC<AddLucrareDialogProps> = ({
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
  const router = useRouter()
  const originalInfo = (formData as any)?.originalWorkOrderInfo
  const hasActiveWork = activeWorkCount > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        } else {
          setOpen(nextOpen)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Adaugă</span> Tichet
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(e) => {
          e.preventDefault()
          onClose()
        }}
      >
        <DialogHeader>
          <DialogTitle>Adaugă Tichet Nou</DialogTitle>
        </DialogHeader>

        {/* Banner pentru re-intervenții */}
        {isReintervention && originalWorkOrderId && (
          <div className="mb-4 p-3 bg-blue-100 border border-blue-300 rounded-md">
            <div className="flex items-center">
              <span className="text-blue-800 font-medium">
                Re-intervenție: Acest formular este precompletat cu datele din lucrarea originală pentru{" "}
                <strong>{originalInfo || originalWorkOrderId}</strong>
                <span className="ml-2 text-xs text-blue-700">(Câmpurile client/locație/echipament sunt înghețate)</span>
              </span>
            </div>
          </div>
        )}

        <LucrareForm
          ref={formRef}
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
          currentWorkOrderId={originalWorkOrderId || undefined}
        />

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {hasActiveWork && (
            <div className="w-full text-xs text-destructive sm:mr-auto">
              <p>
                Există deja un tichet activ pentru echipamentul{" "}
                <strong>{activeWorkEquipmentName || formData.echipament || "selectat"}</strong>. Nu puteți salva o lucrare nouă.
              </p>
              {activeWorkItems.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {activeWorkItems.map((work) => (
                    <div key={work.id} className="flex items-center justify-between gap-2 rounded border border-red-200 bg-red-50 px-2 py-1">
                      <div className="truncate">
                        <span className="font-medium">{work.nrDisplay}</span>
                        <span className="ml-1">({work.statusLucrare || "N/A"})</span>
                        {originalWorkOrderId && work.id === originalWorkOrderId ? (
                          <span className="ml-2 text-[10px] uppercase tracking-wide">acest tichet</span>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => router.push(`/dashboard/lucrari/${work.id}`)}
                      >
                        Deschide
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-1">
                  Nu s-au putut încărca detalii despre conflict, dar blocajul rămâne activ pentru protecția datelor.
                </p>
              )}
            </div>
          )}
          <Button variant="outline" onClick={onClose}>
            Anulează
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={onSave}
            disabled={isSubmitting || hasActiveWork}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
              </>
            ) : (
              "Salvează"
            )}
          </Button>
        </DialogFooter>
        {missingFieldsMessage && (
          <div className="mt-2 text-xs text-destructive">{missingFieldsMessage}</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
