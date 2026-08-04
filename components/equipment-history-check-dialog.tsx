"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Scanner } from "@yudiel/react-qr-scanner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"

type Props = {
  triggerLabel?: string
  triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  triggerSize?: "default" | "sm" | "lg" | "icon"
  triggerClassName?: string
  triggerIcon?: React.ReactNode
  title?: string
  description?: React.ReactNode
  /**
   * Optional override for navigation.
   * Default: /dashboard/istoric-interventii/echipament?cod=...
   */
  onOpenHistory?: (code: string) => void
}

const defaultDescription = (
  <>
    Scanează QR-ul echipamentului. Dacă nu se detectează codul după 3 încercări, se activează introducerea manuală.
    Istoricul se caută după <span className="font-medium">echipamentCod</span>.
  </>
)

export function EquipmentHistoryCheckDialog({
  triggerLabel = "Verifică istoric",
  triggerVariant = "outline",
  triggerSize = "default",
  triggerClassName,
  triggerIcon,
  title = "Verifică istoric echipament",
  description = defaultDescription,
  onOpenHistory,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [historyCode, setHistoryCode] = useState("")
  const [historyFailedScanAttempts, setHistoryFailedScanAttempts] = useState(0)
  const [showHistoryManualInput, setShowHistoryManualInput] = useState(false)

  const isValidEquipmentCode = (code: string) => {
    const c = (code || "").trim()
    if (!c) return false
    if (c.length > 10) return false
    if (!(/[a-zA-Z]/.test(c) && /[0-9]/.test(c))) return false
    return true
  }

  useEffect(() => {
    if (!isOpen) {
      setHistoryFailedScanAttempts(0)
      setShowHistoryManualInput(false)
      return
    }
    if (showHistoryManualInput) return
    if (historyCode.trim()) return
    if (historyFailedScanAttempts >= 3) {
      setShowHistoryManualInput(true)
      return
    }
    const t = window.setTimeout(() => {
      setHistoryFailedScanAttempts((prev) => prev + 1)
    }, 5000)
    return () => window.clearTimeout(t)
  }, [isOpen, historyCode, historyFailedScanAttempts, showHistoryManualInput])

  const historyHref = isValidEquipmentCode(historyCode)
    ? `/dashboard/istoric-interventii/echipament?cod=${encodeURIComponent(historyCode.trim())}`
    : undefined

  const openHistory = (code: string) => {
    if (onOpenHistory) return onOpenHistory(code)
    console.log("[ISTORIC_ECHIP] openHistory()", { code, url: `/dashboard/istoric-interventii/echipament?cod=${code}` })
    window.location.assign(`/dashboard/istoric-interventii/echipament?cod=${encodeURIComponent(code)}`)
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          setHistoryCode("")
          setHistoryFailedScanAttempts(0)
          setShowHistoryManualInput(false)
        } else {
          setHistoryFailedScanAttempts(0)
          setShowHistoryManualInput(false)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          {triggerIcon ? <span className="mr-2 inline-flex">{triggerIcon}</span> : null}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[680px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Scanare QR</div>
            <div className="relative w-full overflow-hidden rounded-md">
              <Scanner
                onScan={(detectedCodes: any[]) => {
                  if (!detectedCodes?.length) return
                  const raw = String(detectedCodes[0]?.rawValue || "").trim()
                  if (!raw) return
                  let code = raw
                  try {
                    const parsed = JSON.parse(raw)
                    if (parsed?.code) code = String(parsed.code).trim()
                  } catch {
                    // raw string
                  }
                  console.log("[ISTORIC_ECHIP] QR detected", {
                    raw,
                    extractedCode: code,
                    isValid: isValidEquipmentCode(code),
                  })
                  setHistoryCode(code)
                  setHistoryFailedScanAttempts(0)
                  setShowHistoryManualInput(false)
                }}
                onError={(e: any) => {
                  console.error("Eroare scanare QR:", e)
                  setHistoryFailedScanAttempts((prev) => {
                    const next = Math.min(3, prev + 1)
                    if (next >= 3) setShowHistoryManualInput(true)
                    return next
                  })
                }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Încercări eșuate: {Math.min(historyFailedScanAttempts, 3)}/3
            </div>
            {historyCode.trim() ? (
              <div className="text-xs mt-2">
                Cod detectat: <span className="font-medium">{historyCode.trim()}</span>
              </div>
            ) : null}
          </div>

          {showHistoryManualInput || historyFailedScanAttempts >= 3 ? (
            <div className="rounded-md border p-3">
              <div className="text-sm font-medium mb-2">Cod manual</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Cod echipament (ex: R72A123)"
                  value={historyCode}
                  onChange={(e) => setHistoryCode(e.target.value)}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-2">Introdu codul manual și apasă „Deschide istoricul”.</div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Închide
          </Button>
          {historyHref && !onOpenHistory ? (
            <Button asChild>
              <Link
                href={historyHref}
                onClick={() => {
                  console.log("[ISTORIC_ECHIP] Open history clicked", { code: historyCode.trim() })
                  setIsOpen(false)
                }}
              >
                Deschide istoricul
              </Link>
            </Button>
          ) : (
            <Button
              onClick={() => {
                const code = historyCode.trim()
                if (!isValidEquipmentCode(code)) {
                  toast({
                    title: "Cod invalid",
                    description: "Codul trebuie să aibă maxim 10 caractere și să conțină litere și cifre.",
                    variant: "destructive",
                  })
                  return
                }
                console.log("[ISTORIC_ECHIP] Open history clicked", { code })
                setIsOpen(false)
                openHistory(code)
              }}
              disabled={!isValidEquipmentCode(historyCode)}
            >
              Deschide istoricul
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


