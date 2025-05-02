"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, FileText, BarChart3 } from "lucide-react"
import { format, subMonths, isAfter, isBefore, differenceInMinutes } from "date-fns"
import { ro } from "date-fns/locale"
import { useFirebaseCollection } from "@/hooks/use-firebase-collection"
import { orderBy } from "firebase/firestore"
import { jsPDF } from "jspdf"
import { toast } from "@/components/ui/use-toast"
import { parseRomanianDateTime } from "@/lib/utils/date-utils"

interface EquipmentReportProps {
  className?: string
}

export function EquipmentReport({ className }: EquipmentReportProps) {
  const [selectedEquipment, setSelectedEquipment] = useState<string>("")
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all")
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<string>("summary")

  // Obținem toate lucrările
  const { data: lucrari, loading } = useFirebaseCollection("lucrari", [orderBy("dataEmiterii", "desc")])

  // Extragem toate echipamentele unice
  const equipments = useMemo(() => {
    const uniqueEquipments = Array.from(new Set(lucrari.map((lucrare) => lucrare.locatie))).filter(Boolean)
    return uniqueEquipments.map((equipment) => ({
      value: equipment,
      label: equipment,
    }))
  }, [lucrari])

  // Filtrăm lucrările în funcție de echipamentul selectat și perioada selectată
  const filteredLucrari = useMemo(() => {
    if (!selectedEquipment) return []

    let filtered = lucrari.filter((lucrare) => lucrare.locatie === selectedEquipment)

    // Aplicăm filtrarea după perioadă
    if (selectedPeriod !== "all") {
      const now = new Date()
      let startDate: Date

      switch (selectedPeriod) {
        case "1month":
          startDate = subMonths(now, 1)
          break
        case "3months":
          startDate = subMonths(now, 3)
          break
        case "6months":
          startDate = subMonths(now, 6)
          break
        case "12months":
          startDate = subMonths(now, 12)
          break
        default:
          startDate = new Date(0) // Începutul timpului
      }

      filtered = filtered.filter((lucrare) => {
        // Folosim funcția parseRomanianDateTime pentru a parsa data în mod consistent
        const lucrareDate = parseRomanianDateTime(lucrare.dataInterventie)

        // Dacă data nu poate fi parsată, excludem înregistrarea
        if (!lucrareDate) return false

        return isAfter(lucrareDate, startDate) && isBefore(lucrareDate, now)
      })
    }

    return filtered
  }, [lucrari, selectedEquipment, selectedPeriod])

  // Calculăm statisticile pentru echipamentul selectat
  const stats = useMemo(() => {
    if (!filteredLucrari.length) {
      return {
        totalInterventions: 0,
        byType: {},
        byStatus: {},
        averageTimePerIntervention: 0,
        totalInterventionTime: 0,
        interventionsWithTimeData: 0,
      }
    }

    // Calculăm numărul total de intervenții
    const totalInterventions = filteredLucrari.length

    // Calculăm numărul de intervenții pe tip
    const byType = filteredLucrari.reduce(
      (acc, lucrare) => {
        const type = lucrare.tipLucrare || "Necunoscut"
        acc[type] = (acc[type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Calculăm numărul de intervenții pe status
    const byStatus = filteredLucrari.reduce(
      (acc, lucrare) => {
        const status = lucrare.statusLucrare || "Necunoscut"
        acc[status] = (acc[status] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    // Calculăm timpul mediu per intervenție folosind datele reale
    let totalInterventionTime = 0
    let interventionsWithTimeData = 0

    filteredLucrari.forEach((lucrare) => {
      // Verificăm dacă avem atât ora sosirii cât și ora plecării
      if (lucrare.dataInterventie && lucrare.oraSosire && lucrare.oraPlecare) {
        try {
          // Parsăm data intervenției
          const interventionDate = parseRomanianDateTime(lucrare.dataInterventie)

          if (!interventionDate) return

          // Extragem orele și minutele din oraSosire și oraPlecare
          const [arrivalHours, arrivalMinutes] = lucrare.oraSosire.split(":").map(Number)
          const [departureHours, departureMinutes] = lucrare.oraPlecare.split(":").map(Number)

          if (isNaN(arrivalHours) || isNaN(arrivalMinutes) || isNaN(departureHours) || isNaN(departureMinutes)) {
            return
          }

          // Creăm obiectele Date pentru ora sosirii și ora plecării
          const arrivalTime = new Date(interventionDate)
          arrivalTime.setHours(arrivalHours, arrivalMinutes, 0, 0)

          const departureTime = new Date(interventionDate)
          departureTime.setHours(departureHours, departureMinutes, 0, 0)

          // Dacă ora plecării este mai mică decât ora sosirii, presupunem că plecarea a fost în ziua următoare
          if (departureTime < arrivalTime) {
            departureTime.setDate(departureTime.getDate() + 1)
          }

          // Calculăm diferența în minute
          const durationMinutes = differenceInMinutes(departureTime, arrivalTime)

          // Adăugăm la totalul de timp doar dacă durata este pozitivă și rezonabilă (< 24 ore)
          if (durationMinutes > 0 && durationMinutes < 24 * 60) {
            totalInterventionTime += durationMinutes
            interventionsWithTimeData++
          }
        } catch (error) {
          console.error("Eroare la calcularea duratei intervenției:", error)
        }
      }
    })

    // Calculăm media timpului per intervenție
    const averageTimePerIntervention =
      interventionsWithTimeData > 0 ? Math.round(totalInterventionTime / interventionsWithTimeData) : 0

    return {
      totalInterventions,
      byType,
      byStatus,
      averageTimePerIntervention,
      totalInterventionTime,
      interventionsWithTimeData,
    }
  }, [filteredLucrari])

  // Funcție pentru generarea raportului PDF
  const generatePDF = async () => {
    if (!selectedEquipment || !filteredLucrari.length) {
      toast({
        title: "Eroare",
        description: "Selectați un echipament și asigurați-vă că există date pentru raport",
        variant: "destructive",
      })
      return
    }

    setIsGenerating(true)

    try {
      const doc = new jsPDF({ unit: "mm", format: "a4" })
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 15

      // Titlu
      doc.setFontSize(18)
      doc.setFont("helvetica", "bold")
      doc.text(`Raport Echipament: ${selectedEquipment}`, pageWidth / 2, 20, { align: "center" })

      // Data generării
      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      doc.text(`Generat la: ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: ro })}`, pageWidth / 2, 30, {
        align: "center",
      })

      // Perioada raportului
      let perioadaText = "Toate intervențiile"
      switch (selectedPeriod) {
        case "1month":
          perioadaText = "Ultimele 30 de zile"
          break
        case "3months":
          perioadaText = "Ultimele 3 luni"
          break
        case "6months":
          perioadaText = "Ultimele 6 luni"
          break
        case "12months":
          perioadaText = "Ultimele 12 luni"
          break
      }
      doc.text(`Perioada: ${perioadaText}`, pageWidth / 2, 35, { align: "center" })

      // Statistici generale
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      doc.text("Statistici generale", margin, 50)

      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      doc.text(`Număr total de intervenții: ${stats.totalInterventions}`, margin, 60)

      // Adăugăm informații despre timpul mediu per intervenție
      if (stats.interventionsWithTimeData > 0) {
        doc.text(
          `Timp mediu per intervenție: ${stats.averageTimePerIntervention} minute (bazat pe ${stats.interventionsWithTimeData} intervenții cu date de timp)`,
          margin,
          67,
        )
      } else {
        doc.text(`Timp mediu per intervenție: Nu există date suficiente`, margin, 67)
      }

      // Intervenții pe tip
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text("Intervenții pe tip", margin, 80)

      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      let yPos = 90
      Object.entries(stats.byType).forEach(([type, count]) => {
        const percentage = ((count / stats.totalInterventions) * 100).toFixed(1)
        doc.text(`${type}: ${count} (${percentage}%)`, margin, yPos)
        yPos += 7
      })

      // Intervenții pe status
      doc.setFontSize(12)
      doc.setFont("helvetica", "bold")
      doc.text("Intervenții pe status", margin, yPos + 10)

      doc.setFontSize(10)
      doc.setFont("helvetica", "normal")
      yPos += 20
      Object.entries(stats.byStatus).forEach(([status, count]) => {
        const percentage = ((count / stats.totalInterventions) * 100).toFixed(1)
        doc.text(`${status}: ${count} (${percentage}%)`, margin, yPos)
        yPos += 7
      })

      // Lista de intervenții
      doc.setFontSize(14)
      doc.setFont("helvetica", "bold")
      yPos += 10
      doc.text("Lista intervențiilor", margin, yPos)
      yPos += 10

      // Verificăm dacă avem nevoie de o pagină nouă
      if (yPos > 250) {
        doc.addPage()
        yPos = 20
      }

      // Header tabel
      doc.setFillColor(240, 240, 240)
      doc.rect(margin, yPos, pageWidth - 2 * margin, 10, "F")
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text("Data", margin + 5, yPos + 6)
      doc.text("Tip", margin + 35, yPos + 6)
      doc.text("Status", margin + 75, yPos + 6)
      doc.text("Tehnician", margin + 115, yPos + 6)
      yPos += 10

      // Rânduri tabel
      doc.setFont("helvetica", "normal")
      filteredLucrari.forEach((lucrare, index) => {
        // Verificăm dacă avem nevoie de o pagină nouă
        if (yPos > 270) {
          doc.addPage()
          yPos = 20

          // Redesenăm header-ul tabelului pe noua pagină
          doc.setFillColor(240, 240, 240)
          doc.rect(margin, yPos, pageWidth - 2 * margin, 10, "F")
          doc.setFontSize(10)
          doc.setFont("helvetica", "bold")
          doc.text("Data", margin + 5, yPos + 6)
          doc.text("Tip", margin + 35, yPos + 6)
          doc.text("Status", margin + 75, yPos + 6)
          doc.text("Tehnician", margin + 115, yPos + 6)
          yPos += 10
          doc.setFont("helvetica", "normal")
        }

        // Fundal alternant pentru rânduri
        if (index % 2 === 1) {
          doc.setFillColor(248, 248, 248)
          doc.rect(margin, yPos, pageWidth - 2 * margin, 7, "F")
        }

        // Data
        doc.text(lucrare.dataInterventie?.split(" ")[0] || "-", margin + 5, yPos + 5)

        // Tip
        doc.text(lucrare.tipLucrare || "-", margin + 35, yPos + 5)

        // Status
        doc.text(lucrare.statusLucrare || "-", margin + 75, yPos + 5)

        // Tehnician (primul din listă)
        const tehnician = lucrare.tehnicieni?.length > 0 ? lucrare.tehnicieni[0] : "-"
        doc.text(tehnician, margin + 115, yPos + 5)

        yPos += 7
      })

      // Footer
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.text(`Pagina ${i} din ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, {
          align: "center",
        })
      }

      // Salvăm PDF-ul
      doc.save(`Raport_${selectedEquipment.replace(/\s+/g, "_")}.pdf`)

      toast({
        title: "Succes",
        description: "Raportul a fost generat cu succes",
      })
    } catch (error) {
      console.error("Eroare la generarea raportului:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la generarea raportului",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Raport per Echipament</CardTitle>
        <CardDescription>Generează rapoarte și statistici pentru echipamente specifice</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Echipament</label>
              <Select value={selectedEquipment} onValueChange={setSelectedEquipment}>
                <SelectTrigger>
                  <SelectValue placeholder="Selectați echipamentul" />
                </SelectTrigger>
                <SelectContent>
                  {equipments.map((equipment) => (
                    <SelectItem key={equipment.value} value={equipment.value}>
                      {equipment.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Perioada</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selectați perioada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate intervențiile</SelectItem>
                  <SelectItem value="1month">Ultimele 30 de zile</SelectItem>
                  <SelectItem value="3months">Ultimele 3 luni</SelectItem>
                  <SelectItem value="6months">Ultimele 6 luni</SelectItem>
                  <SelectItem value="12months">Ultimele 12 luni</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2">Se încarcă datele...</span>
            </div>
          ) : selectedEquipment ? (
            <>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="summary">Sumar</TabsTrigger>
                  <TabsTrigger value="interventions">Intervenții</TabsTrigger>
                </TabsList>
                <TabsContent value="summary" className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{stats.totalInterventions}</div>
                        <p className="text-xs text-muted-foreground">Total intervenții</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{Object.keys(stats.byType).length}</div>
                        <p className="text-xs text-muted-foreground">Tipuri de intervenții</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-2xl font-bold">{stats.averageTimePerIntervention}</div>
                        <p className="text-xs text-muted-foreground">
                          Timp mediu per intervenție (min)
                          {stats.interventionsWithTimeData > 0 && (
                            <span className="block text-xs opacity-70">
                              bazat pe {stats.interventionsWithTimeData} intervenții
                            </span>
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Intervenții pe tip</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {Object.entries(stats.byType).length > 0 ? (
                          <div className="space-y-2">
                            {Object.entries(stats.byType).map(([type, count]) => (
                              <div key={type} className="flex justify-between items-center">
                                <span>{type}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {((count / stats.totalInterventions) * 100).toFixed(1)}%
                                  </span>
                                  <Badge variant="secondary">{count}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Nu există date disponibile</p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Intervenții pe status</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {Object.entries(stats.byStatus).length > 0 ? (
                          <div className="space-y-2">
                            {Object.entries(stats.byStatus).map(([status, count]) => (
                              <div key={status} className="flex justify-between items-center">
                                <span>{status}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">
                                    {((count / stats.totalInterventions) * 100).toFixed(1)}%
                                  </span>
                                  <Badge variant="secondary">{count}</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Nu există date disponibile</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                <TabsContent value="interventions" className="pt-4">
                  {filteredLucrari.length > 0 ? (
                    <div className="border rounded-md">
                      <div className="grid grid-cols-4 gap-4 p-4 font-medium border-b bg-muted/50">
                        <div>Data</div>
                        <div>Tip</div>
                        <div>Status</div>
                        <div>Tehnician</div>
                      </div>
                      <div className="divide-y">
                        {filteredLucrari.map((lucrare) => (
                          <div key={lucrare.id} className="grid grid-cols-4 gap-4 p-4 hover:bg-muted/50">
                            <div>{lucrare.dataInterventie?.split(" ")[0] || "-"}</div>
                            <div>{lucrare.tipLucrare || "-"}</div>
                            <div>
                              <Badge
                                variant="outline"
                                className={
                                  lucrare.statusLucrare === "Finalizat"
                                    ? "bg-green-100 text-green-800 hover:bg-green-200"
                                    : lucrare.statusLucrare === "În curs"
                                      ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                                      : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                                }
                              >
                                {lucrare.statusLucrare || "-"}
                              </Badge>
                            </div>
                            <div>{lucrare.tehnicieni?.length > 0 ? lucrare.tehnicieni[0] : "-"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">Nu există intervenții pentru acest echipament</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={generatePDF}
                  disabled={isGenerating || filteredLucrari.length === 0}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Se generează...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      <span>Generează raport PDF</span>
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">Selectați un echipament pentru a vedea raportul</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
