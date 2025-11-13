"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTargetList } from "@/hooks/use-settings"
import { RotateCcw, DollarSign, X } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { DynamicDialogFields } from "@/components/DynamicDialogFields"
import { Separator } from "@/components/ui/separator"

interface ContractPricingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pricing: Record<string, number>
  onSave: (pricing: Record<string, number>) => void
  customFields?: Record<string, any>
  onCustomFieldsChange?: (fields: Record<string, any>) => void
}

export function ContractPricingDialog({ open, onOpenChange, pricing, onSave, customFields = {}, onCustomFieldsChange }: ContractPricingDialogProps) {
  const [localPricing, setLocalPricing] = useState<Record<string, number | string>>({})
  const [showCloseAlert, setShowCloseAlert] = useState(false)
  const [initialPricing, setInitialPricing] = useState<Record<string, number>>({})
  const [localCustomFields, setLocalCustomFields] = useState<Record<string, any>>({})
  const [initialCustomFields, setInitialCustomFields] = useState<Record<string, any>>({})
  const [didInit, setDidInit] = useState(false)
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set())

  // Preia tipurile de servicii din setări
  const { items: serviceTypes } = useTargetList("contracts.create.serviceTypes")

  function resolveServiceNameFromSelection(parentName: string, selectedChildName: string): string | null {
    const candidates = (serviceTypes || []).map((s: any) => String(s.name || "").trim())
    const norm = (s: string) => s.toLowerCase().trim()
    const p = norm(parentName)
    const c = norm(selectedChildName)

    // exact match on parent
    const exactParent = candidates.find((n) => norm(n) === p)
    if (exactParent) return exactParent

    // exact match on child selected name
    const exactChild = candidates.find((n) => norm(n) === c)
    if (exactChild) return exactChild

    // substring matches
    const subParent = candidates.find((n) => p.includes(norm(n)) || norm(n).includes(p))
    if (subParent) return subParent
    const subChild = candidates.find((n) => c.includes(norm(n)) || norm(n).includes(c))
    if (subChild) return subChild

    // fallback: if single service type exists
    if (candidates.length === 1) return candidates[0]
    return null
  }

  // Inițializează prețurile locale doar la deschiderea dialogului,
  // pentru a nu suprascrie editările când props se schimbă cât timp e deschis
  useEffect(() => {
    if (open && !didInit) {
      setLocalPricing({ ...pricing })
      setInitialPricing({ ...pricing })
      setLocalCustomFields({ ...customFields })
      setInitialCustomFields({ ...customFields })
      setDidInit(true)
      setRemovedKeys(new Set())
    }
    if (!open) {
      setDidInit(false)
    }
  }, [open])

  // Verifică dacă există modificări nesalvate
  const hasUnsavedChanges = () => {
    return JSON.stringify(localPricing) !== JSON.stringify(initialPricing) ||
           JSON.stringify(localCustomFields) !== JSON.stringify(initialCustomFields)
  }

  // Handler pentru schimbarea prețului
  const handlePriceChange = (serviceType: string, value: string) => {
    const normalized = value.replace(",", ".")
    // Permite editare temporar: string gol, "-", ".", "-."
    if (normalized === "" || normalized === "-" || normalized === "." || normalized === "-.") {
      setLocalPricing((prev) => ({ ...prev, [serviceType]: normalized }))
      return
    }

    // Permite doar cifre și un singur punct
    const valid = /^-?\d*(?:\.\d*)?$/.test(normalized)
    if (!valid) {
      // Ignoră caractere invalide (nu actualiza)
      setLocalPricing((prev) => ({ ...prev, [serviceType]: prev[serviceType] ?? "" }))
      return
    }

    setLocalPricing((prev) => ({
      ...prev,
      [serviceType]: normalized,
    }))
  }

  // Resetează prețurile la 0 (prețurile de contract)
  const handleReset = () => {
    const resetPricing: Record<string, number> = {}
    serviceTypes?.forEach((service) => {
      resetPricing[service.name] = 0
    })
    setLocalPricing(resetPricing)
  }

  // Salvează prețurile și câmpurile custom
  const handleSave = () => {
    // Transformă valorile în numere valide pentru onSave
    const parsed: Record<string, number> = {}
    const serviceNames: string[] = (serviceTypes && serviceTypes.length > 0)
      ? serviceTypes.map((s) => s.name)
      : Array.from(new Set([
          ...Object.keys(localPricing || {}),
          ...Object.keys(pricing || {}),
        ]))

    serviceNames.forEach((name) => {
      if (removedKeys.has(name)) {
        return
      }
      const raw = (localPricing as any)?.[name]
      const fallback = (pricing as any)?.[name]
      const str = raw === undefined ? (fallback !== undefined ? String(fallback) : "") : String(raw)
      const normalized = str.replace(",", ".")
      const num = normalized.trim() === "" || normalized === "-" || normalized === "." || normalized === "-." ? 0 : parseFloat(normalized)
      parsed[name] = isNaN(num) ? 0 : num
    })

    onSave(parsed)
    if (onCustomFieldsChange) {
      onCustomFieldsChange(localCustomFields)
    }
    onOpenChange(false)
  }

  // Handler pentru închiderea dialogului
  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowCloseAlert(true)
    } else {
      onOpenChange(false)
    }
  }

  // Confirmă închiderea fără salvare
  const confirmClose = () => {
    setShowCloseAlert(false)
    onOpenChange(false)
  }

  // Anulează închiderea
  const cancelClose = () => {
    setShowCloseAlert(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(open) => {
        if (!open) {
          handleCloseAttempt()
        } else {
          onOpenChange(open)
        }
      }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prețuri Contract</DialogTitle>
            <DialogDescription>
              Setați prețurile pentru fiecare tip de serviciu.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <DynamicDialogFields
              targetId="dialogs.contract.pricing"
              values={localCustomFields}
              onChange={(fieldKey, value) => {
                setLocalCustomFields((prev) => ({
                  ...prev,
                  [fieldKey]: value,
                }))
              }}
              onSettingSelected={(_fieldKey, setting, parentName) => {
                // Când selectăm o opțiune din dropdown-ul legat din setări,
                // dacă numele părintelui coincide cu un tip de serviciu,
                // actualizăm prețul acelui serviciu cu numericValue (dacă există)
                if (!setting) return
                const serviceName = resolveServiceNameFromSelection(parentName, String(setting.name || ""))
                const price = setting.numericValue
                if (price === undefined || price === null) return
                const key = serviceName || String(setting.name || "")
                setLocalPricing((prev) => ({
                  ...prev,
                  [key]: String(price),
                }))
              }}
              enableNumericEdit={false}
              filterChild={(child, parentName) => {
                const key = resolveServiceNameFromSelection(parentName, String(child.name || "")) || String(child.name || "")
                const hasLocal = (localPricing as any)?.[key] !== undefined && String((localPricing as any)?.[key] ?? "").length > 0
                const hasInitial = (pricing as any)?.[key] !== undefined && String((pricing as any)?.[key] ?? "").length > 0
                return !(hasLocal || hasInitial)
              }}
              hideNumericDisplay
            />

            {(() => {
              // Now show the full list of price inputs (custom-added first, then known service types not duplicated)
              const knownNames = (serviceTypes || []).map((s: any) => String(s.name || ""))
              const otherKeys = Object.keys(localPricing || {}).filter((k) => !knownNames.includes(k))
              return (
                <>
                  {otherKeys.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {otherKeys.map((name) => (
                        <div key={name} className="space-y-2">
                          <Label className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            {name}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={String((localPricing as any)?.[name] ?? "")}
                              onChange={(e) => handlePriceChange(name, e.target.value)}
                              placeholder="0.00"
                              className="font-mono"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="Șterge prețul"
                              onClick={() => {
                                setLocalPricing((prev) => {
                                  const next = { ...prev }
                                  delete (next as any)[name]
                                  return next
                                })
                                setRemovedKeys((prev) => new Set(prev).add(name))
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {serviceTypes && serviceTypes.length > 0 && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {serviceTypes.map((service) => (
                          <div key={service.id} className="space-y-2">
                            <Label htmlFor={`price-${service.id}`} className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              {service.name}
                            </Label>
                            <div className="flex items-center gap-2">
                              <Input
                                id={`price-${service.id}`}
                                type="text"
                                inputMode="decimal"
                                value={
                                  localPricing[service.name] === undefined
                                    ? (pricing?.[service.name] !== undefined ? String(pricing[service.name]) : "")
                                    : String(localPricing[service.name] ?? "")
                                }
                                onChange={(e) => {
                                  if (removedKeys.has(service.name)) {
                                    setRemovedKeys((prev) => {
                                      const next = new Set(prev)
                                      next.delete(service.name)
                                      return next
                                    })
                                  }
                                  handlePriceChange(service.name, e.target.value)
                                }}
                                placeholder="0.00"
                                className="font-mono"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                title="Șterge prețul"
                                onClick={() => {
                                  setLocalPricing((prev) => {
                                    const next = { ...prev }
                                    delete (next as any)[service.name]
                                    return next
                                  })
                                  setRemovedKeys((prev) => new Set(prev).add(service.name))
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-4 border-t">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleReset}
                          className="w-full"
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Resetează la prețurile de contract (0)
                        </Button>
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                          Resetarea va seta toate prețurile la 0
                        </p>
                      </div>
                    </>
                  )}
                </>
              )
            })()}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseAttempt}
              className="w-full sm:w-auto"
            >
              Anulează
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              className="w-full sm:w-auto"
            >
              Adauga pretul
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog pentru confirmarea închiderii */}
      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-left">Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription className="text-left whitespace-normal break-words">
              Aveți modificări nesalvate la prețuri. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel onClick={cancelClose} className="w-full sm:w-auto whitespace-normal">
              Nu, rămân în formular
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmClose} 
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto whitespace-normal"
            >
              Da, închide fără salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

