"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { DashboardShell } from "@/components/dashboard-shell"
import { DashboardHeader } from "@/components/dashboard-header"
import { StatusBox } from "@/components/status-box"
import { WorkBubbleStatus } from "@/components/work-bubble-status"
import { WorkBubbleAssigned } from "@/components/work-bubble-assigned"
import { useDashboardStatus } from "@/hooks/use-dashboard-status"
import { useDashboardStatusSettings } from "@/hooks/use-dashboard-status-settings"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { History, Plus } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LucrareForm } from "@/components/lucrare-form"
import { addLucrare, getNextReportNumber } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { format } from "date-fns"
import { Scanner } from "@yudiel/react-qr-scanner"
import { Input } from "@/components/ui/input"

export default function Dashboard() {
  const router = useRouter()
  const { config: dashboardConfig } = useDashboardStatusSettings()
  const { buckets, personal, loading } = useDashboardStatus(dashboardConfig)
  const { userData } = useAuth()
  const isTechnician = userData?.role === "tehnician"
  // State pentru dialoguri mobile (trebuie definit înainte de orice return condițional)
  const [mobileDialogOpen, setMobileDialogOpen] = React.useState<string | null>(null)
  
  // State pentru dialogul de adăugare lucrare
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false)
  // Tehnician: dialog pentru verificare istoric echipament (QR + cod manual)
  const [isHistoryCheckOpen, setIsHistoryCheckOpen] = React.useState(false)
  const [historyCode, setHistoryCode] = React.useState("")
  const [dataEmiterii, setDataEmiterii] = React.useState<Date | undefined>(new Date())
  const [dataInterventie, setDataInterventie] = React.useState<Date | undefined>(new Date())
  const [formData, setFormData] = React.useState({
    tipLucrare: "",
    tehnicieni: [],
    client: "",
    locatie: "",
    descriere: "",
    persoanaContact: "",
    telefon: "",
    statusLucrare: "Listată",
    statusFacturare: "Nefacturat",
    contract: "",
    contractNumber: "",
    contractType: "",
    defectReclamat: "",
    echipament: "",
    echipamentId: "",
    echipamentCod: "",
    persoaneContact: [],
  })
  const [fieldErrors, setFieldErrors] = React.useState([])
  
  // Forțează re-render la fiecare 5 secunde pentru metrici bazate pe timp
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1)
    }, 5000) // 5 secunde
    
    return () => clearInterval(interval)
  }, [])

  // Actualizăm data emiterii și data intervenției la momentul deschiderii dialogului
  React.useEffect(() => {
    if (isAddDialogOpen) {
      setDataEmiterii(new Date())
      setDataInterventie(new Date())
    }
  }, [isAddDialogOpen])

  const isValidEquipmentCode = React.useCallback((code: string) => {
    const c = (code || "").trim()
    if (!c) return false
    if (c.length > 10) return false
    if (!(/[a-zA-Z]/.test(c) && /[0-9]/.test(c))) return false
    return true
  }, [])

  // Funcții pentru manipularea formularului
  const handleInputChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target
    setFormData(prev => ({ ...prev, [id]: value }))
  }, [])

  const handleSelectChange = React.useCallback((id: string, value: string) => {
    setFormData(prev => ({ ...prev, [id]: value }))
  }, [])

  const handleTehnicieniChange = React.useCallback((value: string) => {
    setFormData(prev => {
      const isAlready = prev.tehnicieni.includes(value)
      const newTehnicieni = isAlready
        ? prev.tehnicieni.filter(t => t !== value)
        : [...prev.tehnicieni, value]
      const newStatus = newTehnicieni.length > 0 ? "Atribuită" : "Listată"
      return { ...prev, tehnicieni: newTehnicieni, statusLucrare: newStatus }
    })
  }, [])

  const handleCustomChange = React.useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleCloseAddDialog = React.useCallback(() => {
    setIsAddDialogOpen(false)
    setFormData({
      tipLucrare: "",
      tehnicieni: [],
      client: "",
      locatie: "",
      echipament: "",
      descriere: "",
      persoanaContact: "",
      telefon: "",
      statusLucrare: "Listată",
      statusFacturare: "Nefacturat",
      contract: "",
      contractNumber: "",
      contractType: "",
      defectReclamat: "",
      persoaneContact: [],
      echipamentId: "",
      echipamentCod: "",
    })
    setFieldErrors([])
  }, [])

  const validateForm = () => {
    const errors = []

    if (!dataEmiterii) errors.push("dataEmiterii")
    if (!dataInterventie) errors.push("dataInterventie")
    if (!formData.tipLucrare) errors.push("tipLucrare")
    if (!formData.client) errors.push("client")

    // Validăm câmpul contract doar dacă tipul lucrării este "Intervenție în contract"
    if (formData.tipLucrare === "Intervenție în contract" && !formData.contract) {
      errors.push("contract")
    }

    setFieldErrors(errors)

    return errors.length === 0
  }

  const handleSubmit = async () => {
    try {
      if (!validateForm()) {
        toast({
          title: "Eroare",
          description: "Vă rugăm să completați toate câmpurile obligatorii",
          variant: "destructive",
        })
        return
      }

      // Setăm automat statusul lucrării în funcție de prezența tehnicienilor
      const statusLucrare = (formData.tehnicieni && formData.tehnicieni.length > 0) ? "Atribuită" : "Listată"

      const newLucrare = {
        dataEmiterii: format(dataEmiterii, "dd.MM.yyyy HH:mm"),
        dataInterventie: format(dataInterventie, "dd.MM.yyyy HH:mm"),
        ...formData,
        statusLucrare: statusLucrare,
      }

      // Generăm număr de lucrare din sistemul centralizat
      let nrLucrareGenerated = ""
      try {
        nrLucrareGenerated = await getNextReportNumber()
      } catch (e) {
        // fallback simplu: ultimele 6 cifre din timestamp
        const fallback = `#${Date.now().toString().slice(-6)}`
        nrLucrareGenerated = fallback
      }

      // Adăugăm lucrarea în Firestore cu nrLucrare
      await addLucrare({
        ...newLucrare,
        nrLucrare: nrLucrareGenerated,
        createdBy: userData?.uid || "",
        createdByName: userData?.displayName || userData?.email || "Utilizator necunoscut",
      })

      // Reset form și închidere dialog
      handleCloseAddDialog()
      
      toast({
        title: "Succes",
        description: "Lucrarea a fost adăugată cu succes.",
      })
    } catch (error) {
      console.error("Eroare la adăugarea lucrării:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la adăugarea lucrării.",
        variant: "destructive",
      })
    }
  }

  const statusBubble = (color: string) => (it: any) => (
    <WorkBubbleStatus
      key={it.id}
      title={it.locatie}
      subtitle={it.equipmentLabel}
      colorClass={color}
      onClick={() => router.push(`/dashboard/lucrari/${it.id}`)}
      className="mb-2"
    />
  )

  const assignedBubble = (color: string) => (it: any) => (
    <WorkBubbleAssigned
      key={it.id}
      title={it.locatie}
      subtitle={it.equipmentLabel}
      colorClass={color}
      onClick={() => router.push(`/dashboard/lucrari/${it.id}`)}
      className="mb-2"
    />
  )

  // Bubble cu culoare dinamică în funcție de offerStatus
  const offerStatusBubble = () => (it: any) => {
    const color = it.offerStatus === "accept" ? "bg-green-600" : "bg-red-700"
    return (
      <WorkBubbleStatus
        key={it.id}
        title={it.locatie}
        subtitle={it.equipmentLabel}
        colorClass={color}
        onClick={() => router.push(`/dashboard/lucrari/${it.id}`)}
        className="mb-2"
      />
    )
  }

  // Bubble cu culoare dinamică în funcție de statusul echipamentului
  const equipmentStatusBubble = () => (it: any) => {
    // Determinăm culoarea strict pentru Parțial funcțional (galben) și Nefuncțional (roșu).
    // Orice alt status (inclusiv Funcțional) NU se afișează în acest box.
    const status = String(it.equipmentStatus || "").toLowerCase()
    const isPartial = status.includes("parțial") || status.includes("partial")
    const isNonFunctional = status.includes("nefuncțional") || status.includes("nefunctional")
    const color = isPartial ? "bg-yellow-600" : isNonFunctional ? "bg-red-600" : ""
    if (!color) return null

    return (
      <WorkBubbleStatus
        key={it.id}
        title={it.locatie}
        subtitle={it.equipmentLabel}
        colorClass={color}
        onClick={() => router.push(`/dashboard/lucrari/${it.id}`)}
        className="mb-2"
      />
    )
  }

  if (loading) {
    return (
      <DashboardShell>
        <DashboardHeader heading="Status Lucrări" text="Vizualizare rapidă a stării lucrărilor active" />
        
        {/* Skeleton pentru status boxes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardHeader className="py-3">
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="overflow-hidden">
                <div className="space-y-2">
                  <Skeleton className="h-12 w-36 rounded-lg" />
                  <Skeleton className="h-12 w-36 rounded-lg" />
                  <Skeleton className="h-12 w-36 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Skeleton pentru personal board */}
        <div className="mt-8">
          <Skeleton className="h-7 w-48 mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="py-3">
                  <Skeleton className="h-5 w-32" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-36 rounded-lg" />
                    <Skeleton className="h-12 w-36 rounded-lg" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardShell>
    )
  }

  return (
    <DashboardShell>
      <DashboardHeader heading="Tablu de bord" text="">
        {isTechnician && (
          <Dialog
            open={isHistoryCheckOpen}
            onOpenChange={(open) => {
              setIsHistoryCheckOpen(open)
              if (!open) setHistoryCode("")
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline">
                <History className="mr-2 h-4 w-4" />
                Verifică istoric
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-2rem)] max-w-[680px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Verifică istoric echipament</DialogTitle>
                <DialogDescription>
                  Scanează QR-ul echipamentului sau introdu codul manual. Istoricul se caută după{" "}
                  <span className="font-medium">echipamentCod</span>.
                </DialogDescription>
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
                          // raw string (simple format)
                        }
                        setHistoryCode(code)
                      }}
                      onError={(e: any) => {
                        console.error("Eroare scanare QR:", e)
                      }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Dacă scanarea nu funcționează, folosește introducerea manuală de mai jos.
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium mb-2">Cod manual</div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="Cod echipament (ex: R72A123)"
                      value={historyCode}
                      onChange={(e) => setHistoryCode(e.target.value)}
                    />
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
                        setIsHistoryCheckOpen(false)
                        router.push(`/dashboard/istoric-interventii/echipament?cod=${encodeURIComponent(code)}`)
                      }}
                    >
                      Deschide istoricul
                    </Button>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsHistoryCheckOpen(false)}>
                  Închide
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {!isTechnician && (
          <Dialog
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                handleCloseAddDialog()
              } else {
                setIsAddDialogOpen(open)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Adaugă</span> Lucrare
          </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Adaugă Lucrare Nouă</DialogTitle>
              </DialogHeader>
              
              <LucrareForm
                dataEmiterii={dataEmiterii}
                setDataEmiterii={setDataEmiterii}
                dataInterventie={dataInterventie}
                setDataInterventie={setDataInterventie}
                formData={formData}
                handleInputChange={handleInputChange}
                handleSelectChange={handleSelectChange}
                handleTehnicieniChange={handleTehnicieniChange}
                handleCustomChange={handleCustomChange}
                onSubmit={handleSubmit}
                onCancel={handleCloseAddDialog}
                fieldErrors={fieldErrors}
              />
            </DialogContent>
          </Dialog>
        )}
      </DashboardHeader>
      
      {/* VERSIUNE MOBIL - visible doar pe mobile (md:hidden) */}
      <div className="md:hidden space-y-4 pb-8">
        {/* Status Cards Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Întârziate */}
          {dashboardConfig.intarziateEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('intarziate')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Întârziate</div>
                <div className="text-3xl font-bold text-red-600">{buckets.intarziate.length}</div>
              </CardContent>
            </Card>
          )}

          {/* Amânate */}
          {dashboardConfig.amanateEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('amanate')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Amânate</div>
                <div className="text-3xl font-bold text-violet-600">{buckets.amanate.length}</div>
              </CardContent>
            </Card>
          )}

          {/* Listate */}
          {dashboardConfig.listateEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('listate')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Listate</div>
                <div className="text-3xl font-bold text-gray-600">{buckets.listate.length}</div>
              </CardContent>
            </Card>
          )}

          {/* Nepreluate */}
          {dashboardConfig.nepreluateEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('nepreluate')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Nepreluate</div>
                <div className="text-3xl font-bold text-orange-600">{buckets.nepreluate.length}</div>
              </CardContent>
            </Card>
          )}

          {/* Nefacturate */}
          {dashboardConfig.nefacturateEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('nefacturate')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Nefacturate</div>
                <div className="text-3xl font-bold text-rose-600">{buckets.nefacturate.length}</div>
              </CardContent>
            </Card>
          )}

          {/* Necesită ofertă */}
          {dashboardConfig.necesitaOfertaEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('necesitaOferta')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Necesită ofertă</div>
                <div className="text-3xl font-bold text-sky-600">{buckets.necesitaOferta.length}</div>
              </CardContent>
            </Card>
          )}

          {/* Ofertate */}
          {dashboardConfig.ofertateEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('ofertate')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Ofertate (în așteptare)</div>
                <div className="text-3xl font-bold text-indigo-600">{buckets.ofertate.length}</div>
              </CardContent>
            </Card>
          )}

          {/* Status oferte */}
          {dashboardConfig.statusOferteEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('statusOferte')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Status oferte</div>
                <div className="text-3xl font-bold text-green-600">{buckets.statusOferte.length}</div>
              </CardContent>
            </Card>
          )}

          {/* Stare echipament */}
          {dashboardConfig.equipmentStatusEnabled && (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('equipmentStatus')}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">Stare echipament</div>
                <div className="text-3xl font-bold text-yellow-600">{buckets.equipmentStatus.length}</div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Personal Cards */}
        <div className="space-y-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen('dispatcher')}>
            <CardContent className="p-4">
              <div className="text-sm font-medium text-gray-600 mb-1">Dispecer</div>
              <div className="text-3xl font-bold text-blue-600">{personal.dispatcher.items.length}</div>
            </CardContent>
          </Card>

          {personal.technicians.map((tech) => (
            <Card key={tech.name} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setMobileDialogOpen(`tech-${tech.name}`)}>
              <CardContent className="p-4">
                <div className="text-sm font-medium text-gray-600 mb-1">{tech.name}</div>
                <div className="text-3xl font-bold text-gray-700">{tech.items.length}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Dialoguri pentru fiecare categorie */}
      <Dialog open={mobileDialogOpen === 'intarziate'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Întârziate ({buckets.intarziate.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.intarziate.map(statusBubble("bg-red-600"))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'amanate'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Amânate ({buckets.amanate.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.amanate.map(statusBubble("bg-violet-600"))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'listate'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Listate ({buckets.listate.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.listate.map(statusBubble("bg-gray-600"))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'nepreluate'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Nepreluate ({buckets.nepreluate.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.nepreluate.map(statusBubble("bg-orange-600"))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'nefacturate'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Nefacturate ({buckets.nefacturate.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.nefacturate.map(statusBubble("bg-rose-600"))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'necesitaOferta'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Necesită ofertă ({buckets.necesitaOferta.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.necesitaOferta.map(statusBubble("bg-sky-600"))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'ofertate'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Ofertate ({buckets.ofertate.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.ofertate.map(statusBubble("bg-indigo-600"))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'statusOferte'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Status oferte ({buckets.statusOferte.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.statusOferte.map(offerStatusBubble())}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'equipmentStatus'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Stare echipament ({buckets.equipmentStatus.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {buckets.equipmentStatus.map(equipmentStatusBubble())}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={mobileDialogOpen === 'dispatcher'} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Dispecer ({personal.dispatcher.items.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2 pr-4">
              {personal.dispatcher.items.map(assignedBubble("bg-blue-600"))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {personal.technicians.map((tech) => (
        <Dialog key={tech.name} open={mobileDialogOpen === `tech-${tech.name}`} onOpenChange={(open) => !open && setMobileDialogOpen(null)}>
          <DialogContent className="max-w-md max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>{tech.name} ({tech.items.length})</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-2 pr-4">
                {tech.items.map(assignedBubble("bg-gray-700"))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      ))}
      
      {/* VERSIUNE DESKTOP - ascuns pe mobile (hidden md:flex) */}
      <div className="hidden md:flex flex-col h-full min-h-0 gap-4">
        {/* Prima secțiune: Statusuri (50% din înălțime) */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-3 h-full min-w-0">
            <StatusBox title="Întârziate" count={buckets.intarziate.length} disabled={!dashboardConfig.intarziateEnabled}>
              {buckets.intarziate.map(statusBubble("bg-red-600"))}
            </StatusBox>
            <StatusBox title="Amânate" count={buckets.amanate.length} disabled={!dashboardConfig.amanateEnabled}>
              {buckets.amanate.map(statusBubble("bg-violet-600"))}
            </StatusBox>
            <StatusBox title="Listate" count={buckets.listate.length} disabled={!dashboardConfig.listateEnabled}>
              {buckets.listate.map(statusBubble("bg-gray-600"))}
            </StatusBox>
            <StatusBox title="Nepreluate" count={buckets.nepreluate.length} disabled={!dashboardConfig.nepreluateEnabled}>
              {buckets.nepreluate.map(statusBubble("bg-orange-600"))}
            </StatusBox>
            <StatusBox title="Nefacturate" count={buckets.nefacturate.length} disabled={!dashboardConfig.nefacturateEnabled}>
              {buckets.nefacturate.map(statusBubble("bg-rose-600"))}
            </StatusBox>
            <StatusBox title="Necesită ofertă" count={buckets.necesitaOferta.length} disabled={!dashboardConfig.necesitaOfertaEnabled}>
              {buckets.necesitaOferta.map(statusBubble("bg-sky-600"))}
            </StatusBox>
            <StatusBox title="Ofertate (în așteptare)" count={buckets.ofertate.length} disabled={!dashboardConfig.ofertateEnabled}>
              {buckets.ofertate.map(statusBubble("bg-indigo-600"))}
            </StatusBox>
            <StatusBox title="Status oferte" count={buckets.statusOferte.length} disabled={!dashboardConfig.statusOferteEnabled}>
              {buckets.statusOferte.map(offerStatusBubble())}
            </StatusBox>
            <StatusBox title="Stare echipament" count={buckets.equipmentStatus.length} disabled={!dashboardConfig.equipmentStatusEnabled}>
              {buckets.equipmentStatus.map(equipmentStatusBubble())}
            </StatusBox>
          </div>
        </div>
      
        {/* A doua secțiune: Personal/Atribuiri (50% din înălțime) */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* <h3 className="text-lg font-semibold mb-3">Status încărcare personal</h3> */}
          <div className="grid gap-4 h-full" style={{ gridTemplateColumns: `repeat(${Math.max(1, (personal.technicians?.length || 0) + 1)}, minmax(220px, 1fr))` }}>
            <StatusBox title="Dispecer" count={personal.dispatcher.items.length}> 
              {personal.dispatcher.items.map(assignedBubble("bg-blue-600"))}
            </StatusBox>
            {personal.technicians.map((col) => (
              <StatusBox key={col.name} title={col.name} count={col.items.length}>
                {col.items.map(assignedBubble("bg-gray-700"))}
              </StatusBox>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  )
}
