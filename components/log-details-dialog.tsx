"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import Link from "next/link"
import { ExternalLink } from "lucide-react"

interface LogDetailsDialogProps {
  log: any
  isOpen: boolean
  onClose: () => void
}

export function LogDetailsDialog({ log, isOpen, onClose }: LogDetailsDialogProps) {
  if (!log) return null

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      const year = date.getFullYear()
      const hour = date.getHours().toString().padStart(2, "0")
      const minute = date.getMinutes().toString().padStart(2, "0")
      const second = date.getSeconds().toString().padStart(2, "0")
      
      return `${day}.${month}.${year} ${hour}:${minute}:${second}`
    } catch (err) {
      return "N/A"
    }
  }

  const getTipColor = (tip: string) => {
    switch (tip?.toLowerCase()) {
      case "informație":
        return "bg-blue-100 text-blue-800 hover:bg-blue-200"
      case "avertisment":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
      case "eroare":
        return "bg-red-100 text-red-800 hover:bg-red-200"
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200"
    }
  }

  const getOutcomeColor = (outcome: string) => {
    if (outcome === "success") return "bg-green-100 text-green-800"
    if (outcome === "fail") return "bg-red-100 text-red-800"
    return "bg-gray-100 text-gray-800"
  }

  const renderValue = (value: any): string => {
    if (value === null || value === undefined) return "—"
    if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—"
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  const renderBeforeAfter = () => {
    if (!log.before && !log.after) return null

    const beforeKeys = log.before ? Object.keys(log.before) : []
    const afterKeys = log.after ? Object.keys(log.after) : []
    const allKeys = Array.from(new Set([...beforeKeys, ...afterKeys]))

    if (allKeys.length === 0) return null

    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Modificări:</h4>
        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-3 gap-2 bg-muted p-2 text-xs font-medium">
            <div>Câmp</div>
            <div>Înainte</div>
            <div>După</div>
          </div>
          <div className="divide-y">
            {allKeys.map((key) => {
              const beforeVal = log.before?.[key]
              const afterVal = log.after?.[key]
              const changed = JSON.stringify(beforeVal) !== JSON.stringify(afterVal)
              
              return (
                <div key={key} className={`grid grid-cols-3 gap-2 p-2 text-xs ${changed ? "bg-yellow-50" : ""}`}>
                  <div className="font-medium">{key}</div>
                  <div className="truncate" title={renderValue(beforeVal)}>
                    {renderValue(beforeVal)}
                  </div>
                  <div className="truncate font-medium" title={renderValue(afterVal)}>
                    {renderValue(afterVal)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const renderMetadata = () => {
    if (!log.metadata) return null

    return (
      <div className="space-y-2">
        <h4 className="font-semibold text-sm">Metadate suplimentare:</h4>
        <div className="bg-muted p-3 rounded-md">
          <pre className="text-xs overflow-auto">{JSON.stringify(log.metadata, null, 2)}</pre>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalii Log</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* Informații principale */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm font-medium text-muted-foreground">Timestamp:</span>
                <p className="text-sm font-mono mt-1">{formatDate(log.timestamp)}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Tip:</span>
                <div className="mt-1">
                  <Badge className={getTipColor(log.tip)}>{log.tip || "N/A"}</Badge>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Utilizator:</span>
                <p className="text-sm mt-1">{log.utilizator || "N/A"}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-muted-foreground">Categorie:</span>
                <p className="text-sm mt-1">{log.categorie || "N/A"}</p>
              </div>
            </div>

            <Separator />

            {/* Acțiune */}
            <div>
              <span className="text-sm font-medium text-muted-foreground">Acțiune:</span>
              <p className="text-sm mt-1 font-semibold">{log.actiune || "N/A"}</p>
            </div>

            {/* Outcome */}
            {log.actionOutcome && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Rezultat:</span>
                <div className="mt-1">
                  <Badge className={getOutcomeColor(log.actionOutcome)}>
                    {log.actionOutcome === "success" ? "Succes" : "Eșec"}
                  </Badge>
                </div>
              </div>
            )}

            {/* Error message */}
            {log.errorMessage && (
              <div>
                <span className="text-sm font-medium text-muted-foreground">Mesaj eroare:</span>
                <p className="text-sm mt-1 text-red-600">{log.errorMessage}</p>
              </div>
            )}

            <Separator />

            {/* Detalii */}
            <div>
              <span className="text-sm font-medium text-muted-foreground">Detalii:</span>
              <p className="text-sm mt-1 whitespace-pre-wrap">{log.detalii || "—"}</p>
            </div>

            {/* Context entitate */}
            {(log.entityType || log.entityId) && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  {log.entityType && (
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Tip entitate:</span>
                      <p className="text-sm mt-1">{log.entityType}</p>
                    </div>
                  )}
                  {log.entityId && (
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">ID entitate:</span>
                      <p className="text-sm mt-1 font-mono">{log.entityId}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Context lucrare */}
            {(log.lucrareId || log.nrLucrare || log.client || log.locatie) && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Context lucrare:</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {log.nrLucrare && (
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Număr lucrare:</span>
                        <p className="text-sm mt-1 font-mono">{log.nrLucrare}</p>
                      </div>
                    )}
                    {log.lucrareId && (
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">ID lucrare:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <Link 
                            href={`/dashboard/lucrari/${log.lucrareId}`}
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                            target="_blank"
                          >
                            Vezi lucrare <ExternalLink className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    )}
                    {log.client && (
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Client:</span>
                        <p className="text-sm mt-1">{log.client}</p>
                      </div>
                    )}
                    {log.locatie && (
                      <div>
                        <span className="text-sm font-medium text-muted-foreground">Locație:</span>
                        <p className="text-sm mt-1">{log.locatie}</p>
                      </div>
                    )}
                    {log.lucrareTitlu && (
                      <div className="col-span-2">
                        <span className="text-sm font-medium text-muted-foreground">Titlu lucrare:</span>
                        <p className="text-sm mt-1">{log.lucrareTitlu}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Before/After */}
            {(log.before || log.after) && (
              <>
                <Separator />
                {renderBeforeAfter()}
              </>
            )}

            {/* Metadata */}
            {log.metadata && (
              <>
                <Separator />
                {renderMetadata()}
              </>
            )}

            {/* ID-uri tehnice */}
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div>
                <span className="font-medium">ID log:</span>
                <p className="font-mono mt-1">{log.id || "N/A"}</p>
              </div>
              <div>
                <span className="font-medium">ID utilizator:</span>
                <p className="font-mono mt-1">{log.utilizatorId || "N/A"}</p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

