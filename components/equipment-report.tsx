"use client"

import { useState, useEffect, useMemo } from "react"
import { collection, query, where, getDocs, orderBy } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format, differenceInMinutes, isValid } from "date-fns"
import { ro } from "date-fns/locale"
import { CalendarIcon, FileText, Printer, BarChart3, Clock, AlertCircle, CheckCircle, Wrench } from "lucide-react"
import { parseRomanianDateTime } from "@/lib/utils/date-utils"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"

// Define types
interface EquipmentReportProps {
  className?: string
  reportType?: "detailed" | "annual"
}

interface Client {
  id: string
  nume: string
  locatii?: {
    nume: string
    echipamente?: {
      id: string
      nume: string
      cod: string
      model?: string
      serie?: string
    }[]
  }[]
}

interface WorkOrder {
  id: string
  client: string
  echipament: string
  echipamentId?: string
  echipamentCod?: string
  dataInterventie: string
  tipLucrare: string
  statusLucrare: string
  descriereInterventie?: string
  defectReclamat?: string
  tehnicieni: string[]
  oraSosire?: string
  oraPlecare?: string
}

interface Equipment {
  id: string
  nume: string
  cod: string
  model?: string
  serie?: string
  clientId: string
  clientName: string
  location: string
}

interface EquipmentStats {
  totalInterventions: number
  byType: Record<string, number>
  byStatus: Record<string, number>
  byMonth: Record<string, number>
  averageTime: number
  validTimeDataCount: number
}

export function EquipmentReport({ className = "", reportType = "detailed" }: EquipmentReportProps) {
  // State for equipment selection and data
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>("all-clients")
  const [selectedLocationName, setSelectedLocationName] = useState<string>("all-locations")
  const [clientSearch, setClientSearch] = useState<string>("")
  const [locationSearch, setLocationSearch] = useState<string>("")
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([])
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("")
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [filteredWorkOrders, setFilteredWorkOrders] = useState<WorkOrder[]>([])

  // State for date filtering - simplified to only "custom" and "all"
  const [dateRange, setDateRange] = useState<"custom" | "all">("custom")
  const [startDate, setStartDate] = useState<Date | undefined>(new Date(new Date().getFullYear(), 0, 1)) // Jan 1st of current year
  const [endDate, setEndDate] = useState<Date | undefined>(new Date())
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())

  // State for loading and UI
  const [loading, setLoading] = useState<boolean>(false)
  const [loadingWorkOrders, setLoadingWorkOrders] = useState<boolean>(false)
  const [reportReady, setReportReady] = useState<boolean>(false)
  const [generatingPdf, setGeneratingPdf] = useState<boolean>(false)

  // Available years for selection (last 5 years)
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 5 }, (_, i) => currentYear - i)
  }, [])

  // Load clients and their equipment
  useEffect(() => {
    async function loadClients() {
      setLoading(true)
      try {
        const clientsQuery = query(collection(db, "clienti"), orderBy("nume"))
        const clientsSnapshot = await getDocs(clientsQuery)
        const clientsData = clientsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Client[]

        setClients(clientsData)

        // Extract all equipment from all clients
        const allEquipment: Equipment[] = []
        clientsData.forEach((client) => {
          if (client.locatii) {
            client.locatii.forEach((location) => {
              if (location.echipamente) {
                location.echipamente.forEach((equipment) => {
                  allEquipment.push({
                    id: equipment.id || `${client.id}-${location.nume}-${equipment.cod}`,
                    nume: equipment.nume,
                    cod: equipment.cod,
                    model: equipment.model,
                    serie: equipment.serie,
                    clientId: client.id,
                    clientName: client.nume,
                    location: location.nume,
                  })
                })
              }
            })
          }
        })

        setEquipmentList(allEquipment)
      } catch (error) {
        console.error("Error loading clients:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca datele clienților",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadClients()
  }, [])

  // Update equipment list when client or location is selected
  useEffect(() => {
    const rebuildEquipmentList = () => {
      const allEquipment: Equipment[] = []
      clients.forEach((client) => {
        // Filter by selected client (if any)
        if (selectedClientId !== "all-clients" && client.id !== selectedClientId) return
        if (client.locatii) {
          client.locatii.forEach((location) => {
            // Filter by selected location (if any)
            if (selectedClientId !== "all-clients" && selectedLocationName !== "all-locations") {
              if ((location.nume || "") !== selectedLocationName) return
            }
            if (location.echipamente) {
              location.echipamente.forEach((equipment) => {
                allEquipment.push({
                  id: equipment.id || `${client.id}-${location.nume}-${equipment.cod}`,
                  nume: equipment.nume,
                  cod: equipment.cod,
                  model: equipment.model,
                  serie: equipment.serie,
                  clientId: client.id,
                  clientName: client.nume,
                  location: location.nume,
                })
              })
            }
          })
        }
      })
      setEquipmentList(allEquipment)
    }

    rebuildEquipmentList()
    // Reset equipment selection when filters change
    setSelectedEquipmentId("")
  }, [selectedClientId, selectedLocationName, clients])

  // Reset searches on selection change
  useEffect(() => {
    setClientSearch("")
    setLocationSearch("")
  }, [selectedClientId])
  useEffect(() => {
    setLocationSearch("")
  }, [selectedLocationName])

  // Update date range based on selection
  useEffect(() => {
    if (dateRange === "all") {
      setStartDate(undefined)
      setEndDate(undefined)
    }
    // For "custom", we keep the existing dates
  }, [dateRange])

  // Load work orders when equipment is selected
  useEffect(() => {
    async function loadWorkOrders() {
      if (!selectedEquipmentId) {
        setWorkOrders([])
        setFilteredWorkOrders([])
        setReportReady(false)
        return
      }

      setLoadingWorkOrders(true)
      try {
        const selectedEquipment = equipmentList.find((eq) => eq.id === selectedEquipmentId)

        if (!selectedEquipment) {
          throw new Error("Echipamentul selectat nu a fost găsit")
        }

        // Query work orders by equipment ID or code
        const workOrdersQuery = query(collection(db, "lucrari"), where("echipamentId", "==", selectedEquipmentId))

        const workOrdersSnapshot = await getDocs(workOrdersQuery)
        let workOrdersData = workOrdersSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as WorkOrder[]

        // If no results by ID, try by equipment code
        if (workOrdersData.length === 0 && selectedEquipment.cod) {
          const workOrdersByCodeQuery = query(
            collection(db, "lucrari"),
            where("echipamentCod", "==", selectedEquipment.cod),
          )

          const workOrdersByCodeSnapshot = await getDocs(workOrdersByCodeQuery)
          workOrdersData = workOrdersByCodeSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as WorkOrder[]
        }

        // If still no results, try by equipment name and client
        if (workOrdersData.length === 0) {
          const workOrdersByNameQuery = query(
            collection(db, "lucrari"),
            where("echipament", "==", selectedEquipment.nume),
            where("client", "==", selectedEquipment.clientName),
          )

          const workOrdersByNameSnapshot = await getDocs(workOrdersByNameQuery)
          workOrdersData = workOrdersByNameSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as WorkOrder[]
        }

        // Sort work orders by date
        workOrdersData.sort((a, b) => {
          const dateA = parseRomanianDateTime(a.dataInterventie) || new Date(0)
          const dateB = parseRomanianDateTime(b.dataInterventie) || new Date(0)
          return dateB.getTime() - dateA.getTime() // Newest first
        })

        setWorkOrders(workOrdersData)
        setReportReady(true)
      } catch (error) {
        console.error("Error loading work orders:", error)
        toast({
          title: "Eroare",
          description: "Nu s-au putut încărca datele lucrărilor",
          variant: "destructive",
        })
      } finally {
        setLoadingWorkOrders(false)
      }
    }

    loadWorkOrders()
  }, [selectedEquipmentId, equipmentList])

  // Filter work orders by date range
  useEffect(() => {
    if (!workOrders.length) {
      setFilteredWorkOrders([])
      return
    }

    let filtered = [...workOrders]

    if (reportType === "annual") {
      // For annual report, filter by selected year
      filtered = workOrders.filter((order) => {
        const orderDate = parseRomanianDateTime(order.dataInterventie)
        return orderDate && orderDate.getFullYear() === selectedYear
      })
    } else if (dateRange === "custom" && (startDate || endDate)) {
      // For detailed report with custom date range
      filtered = workOrders.filter((order) => {
        const orderDate = parseRomanianDateTime(order.dataInterventie)

        if (!orderDate) return false

        if (startDate && endDate) {
          return orderDate >= startDate && orderDate <= endDate
        } else if (startDate) {
          return orderDate >= startDate
        } else if (endDate) {
          return orderDate <= endDate
        }

        return true
      })
    }
    // For "all" date range, we keep all work orders

    setFilteredWorkOrders(filtered)
  }, [workOrders, startDate, endDate, dateRange, reportType, selectedYear])

  // Calculate statistics from filtered work orders
  const stats = useMemo<EquipmentStats>(() => {
    if (!filteredWorkOrders.length) {
      return {
        totalInterventions: 0,
        byType: {},
        byStatus: {},
        byMonth: {},
        averageTime: 0,
        validTimeDataCount: 0,
      }
    }

    const byType: Record<string, number> = {}
    const byStatus: Record<string, number> = {}
    const byMonth: Record<string, number> = {}
    let totalTime = 0
    let validTimeCount = 0

    filteredWorkOrders.forEach((order) => {
      // Count by type
      const type = order.tipLucrare || "Necunoscut"
      byType[type] = (byType[type] || 0) + 1

      // Count by status
      const status = order.statusLucrare || "Necunoscut"
      byStatus[status] = (byStatus[status] || 0) + 1

      // Count by month
      const date = parseRomanianDateTime(order.dataInterventie)
      if (date) {
        const monthKey = format(date, "yyyy-MM")
        byMonth[monthKey] = (byMonth[monthKey] || 0) + 1
      }

      // Calculate time if available
      if (order.oraSosire && order.oraPlecare) {
        try {
          const arrivalDate = parseRomanianDateTime(`${order.dataInterventie.split(" ")[0]} ${order.oraSosire}`)
          const departureDate = parseRomanianDateTime(`${order.dataInterventie.split(" ")[0]} ${order.oraPlecare}`)

          if (arrivalDate && departureDate && isValid(arrivalDate) && isValid(departureDate)) {
            const minutes = differenceInMinutes(departureDate, arrivalDate)

            // Only count if time is positive and less than 24 hours (to filter out errors)
            if (minutes > 0 && minutes < 24 * 60) {
              totalTime += minutes
              validTimeCount++
            }
          }
        } catch (error) {
          console.error("Error calculating time for work order:", error)
        }
      }
    })

    return {
      totalInterventions: filteredWorkOrders.length,
      byType,
      byStatus,
      byMonth,
      averageTime: validTimeCount > 0 ? Math.round(totalTime / validTimeCount) : 0,
      validTimeDataCount: validTimeCount,
    }
  }, [filteredWorkOrders])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (reportType === "annual") {
      // For annual report, prepare monthly data
      const monthNames = [
        "Ianuarie",
        "Februarie",
        "Martie",
        "Aprilie",
        "Mai",
        "Iunie",
        "Iulie",
        "August",
        "Septembrie",
        "Octombrie",
        "Noiembrie",
        "Decembrie",
      ]

      return monthNames.map((month, index) => {
        const monthKey = `${selectedYear}-${String(index + 1).padStart(2, "0")}`
        return {
          name: month,
          intervenții: stats.byMonth[monthKey] || 0,
        }
      })
    } else {
      // For detailed report, prepare type and status data
      const typeData = Object.entries(stats.byType).map(([name, value]) => ({
        name,
        intervenții: value,
      }))

      const statusData = Object.entries(stats.byStatus).map(([name, value]) => ({
        name,
        intervenții: value,
      }))

      return { typeData, statusData }
    }
  }, [stats, reportType, selectedYear])

  // Generate PDF report
  const generatePDF = async () => {
    setGeneratingPdf(true)

    try {
      const reportElement = document.getElementById("equipment-report")
      if (!reportElement) {
        throw new Error("Elementul raportului nu a fost găsit")
      }

      const canvas = await html2canvas(reportElement, {
        scale: 2,
        logging: false,
        useCORS: true,
      })

      const imgData = canvas.toDataURL("image/png")
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      })

      const imgWidth = 210
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight)

      const selectedEquipment = equipmentList.find((eq) => eq.id === selectedEquipmentId)
      const fileName = `Raport_${selectedEquipment?.nume || "Echipament"}_${format(new Date(), "dd-MM-yyyy")}.pdf`

      pdf.save(fileName)

      toast({
        title: "Succes",
        description: "Raportul a fost generat și descărcat",
        variant: "default",
      })
    } catch (error) {
      console.error("Error generating PDF:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut genera PDF-ul",
        variant: "destructive",
      })
    } finally {
      setGeneratingPdf(false)
    }
  }

  // Print report
  const printReport = () => {
    window.print()
  }

  // Reset filters
  const resetFilters = () => {
    setSelectedClientId("all-clients")
    setSelectedEquipmentId("")
    setDateRange("custom")
    setStartDate(new Date(new Date().getFullYear(), 0, 1)) // Jan 1st of current year
    setEndDate(new Date())
    setReportReady(false)
  }

  // Render the report
  return (
    <div className={`space-y-6 print:p-6 ${className}`}>
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtre Raport</CardTitle>
          <CardDescription>Selectați echipamentul și perioada pentru generarea raportului</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Client selection */}
            <div className="space-y-2">
              <label htmlFor="client" className="text-sm font-medium">
                Client (opțional)
              </label>
              <Select
                value={selectedClientId}
                onValueChange={(val) => {
                  setSelectedClientId(val)
                  // Reset location when client changes
                  setSelectedLocationName("all-locations")
                  setSelectedEquipmentId("")
                }}
              >
                <SelectTrigger id="client" disabled={loading}>
                  <SelectValue placeholder="Toți clienții" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Caută client..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      onKeyDown={(e) => {
                        // Previne typeahead-ul implicit al Select-ului (să nu "sară" în listă)
                        e.stopPropagation()
                      }}
                      className="mb-2"
                    />
                  </div>
                  <SelectItem value="all-clients">Toți clienții</SelectItem>
                  {clients
                    .filter((c) => c.nume.toLowerCase().includes(clientSearch.toLowerCase()))
                    .map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.nume}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Location selection (optional, depends on client) */}
            {selectedClientId !== "all-clients" &&
              (() => {
                const currentClient = clients.find((c) => c.id === selectedClientId)
                const locatii = currentClient?.locatii || []
                return locatii.length > 0 ? (
                  <div className="space-y-2">
                    <label htmlFor="location" className="text-sm font-medium">
                      Locație (opțional)
                    </label>
                    <Select
                      value={selectedLocationName}
                      onValueChange={(val) => {
                        setSelectedLocationName(val)
                        setSelectedEquipmentId("")
                      }}
                    >
                      <SelectTrigger id="location" disabled={loading}>
                        <SelectValue placeholder="Selectați locația (opțional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input
                            placeholder="Caută locație..."
                            value={locationSearch}
                            onChange={(e) => setLocationSearch(e.target.value)}
                            onKeyDown={(e) => {
                              // Previne typeahead-ul implicit al Select-ului (să nu "sară" în listă)
                              e.stopPropagation()
                            }}
                            className="mb-2"
                          />
                        </div>
                        <SelectItem value="all-locations">Toate locațiile</SelectItem>
                        {locatii
                          .filter((loc) => {
                            const term = locationSearch.toLowerCase()
                            return (
                              (loc.nume || "").toLowerCase().includes(term) ||
                              (loc as any).adresa?.toLowerCase?.().includes(term)
                            )
                          })
                          .map((loc, idx) => (
                          <SelectItem key={`${idx}-${loc.nume}`} value={loc.nume}>
                            {loc.nume}{loc.adresa ? ` — ${loc.adresa}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null
              })()}

            {/* Equipment selection */}
            <div className="space-y-2">
              <label htmlFor="equipment" className="text-sm font-medium">
                Echipament *
              </label>
              <Select value={selectedEquipmentId} onValueChange={setSelectedEquipmentId}>
                <SelectTrigger id="equipment" disabled={loading}>
                  <SelectValue placeholder="Selectați echipamentul" />
                </SelectTrigger>
                <SelectContent>
                  {equipmentList.length > 0 ? (
                    equipmentList.map((equipment) => (
                      <SelectItem key={equipment.id} value={equipment.id}>
                        {equipment.nume} ({equipment.cod}) - {equipment.clientName}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-equipment" disabled>
                      Nu există echipamente disponibile
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {reportType === "detailed" ? (
              <>
                {/* Date range selection - simplified to only "custom" and "all" */}
                <div className="space-y-2">
                  <label htmlFor="dateRange" className="text-sm font-medium">
                    Perioadă
                  </label>
                  <Select value={dateRange} onValueChange={(value) => setDateRange(value as "custom" | "all")}>
                    <SelectTrigger id="dateRange">
                      <SelectValue placeholder="Selectați perioada" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Perioadă personalizată</SelectItem>
                      <SelectItem value="all">Toate datele</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom date range */}
                {dateRange === "custom" && (
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="startDate" className="text-sm font-medium">
                        Data început
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate ? format(startDate, "dd.MM.yyyy", { locale: ro }) : "Selectați data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="endDate" className="text-sm font-medium">
                        Data sfârșit
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {endDate ? format(endDate, "dd.MM.yyyy", { locale: ro }) : "Selectați data"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}
              </>
            ) : (
              // Year selection for annual report
              <div className="space-y-2">
                <label htmlFor="year" className="text-sm font-medium">
                  An
                </label>
                <Select
                  value={selectedYear.toString()}
                  onValueChange={(value) => setSelectedYear(Number.parseInt(value))}
                >
                  <SelectTrigger id="year">
                    <SelectValue placeholder="Selectați anul" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableYears.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={resetFilters}>
            Resetează filtrele
          </Button>
        </CardFooter>
      </Card>

      {/* Loading state */}
      {loadingWorkOrders && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <Spinner size="lg" />
              <p className="text-sm text-muted-foreground">Se încarcă datele...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No data selected state */}
      {!selectedEquipmentId && !loadingWorkOrders && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <BarChart3 className="h-16 w-16 text-muted-foreground" />
              <div className="text-center">
                <h3 className="text-lg font-medium">Niciun echipament selectat</h3>
                <p className="text-sm text-muted-foreground">Selectați un echipament pentru a genera raportul</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No data found state */}
      {selectedEquipmentId && reportReady && filteredWorkOrders.length === 0 && !loadingWorkOrders && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Nicio intervenție găsită</AlertTitle>
          <AlertDescription>
            Nu există intervenții pentru echipamentul selectat în perioada specificată.
          </AlertDescription>
        </Alert>
      )}

      {/* Report content */}
      {selectedEquipmentId && reportReady && filteredWorkOrders.length > 0 && !loadingWorkOrders && (
        <div id="equipment-report" className="space-y-6">
          {/* Report header */}
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>
                    {reportType === "annual"
                      ? `Analiză Anuală Echipament ${selectedYear}`
                      : "Raport Analitic Echipament"}
                  </CardTitle>
                  <CardDescription>
                    {reportType === "annual"
                      ? `Analiza intervențiilor pe echipament în anul ${selectedYear}`
                      : dateRange === "all"
                        ? "Analiza tuturor intervențiilor pe echipament"
                        : `Perioada analizată: ${startDate ? format(startDate, "dd.MM.yyyy", { locale: ro }) : ""} - ${endDate ? format(endDate, "dd.MM.yyyy", { locale: ro }) : ""}`}
                  </CardDescription>
                </div>
                <div className="mt-4 flex space-x-2 md:mt-0">
                  <Button variant="outline" size="sm" onClick={printReport} className="print:hidden">
                    <Printer className="mr-2 h-4 w-4" />
                    Printează
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generatePDF}
                    disabled={generatingPdf}
                    className="print:hidden"
                  >
                    {generatingPdf ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Se generează...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Exportă PDF
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Equipment details */}
                {selectedEquipmentId && (
                  <div className="rounded-md border p-4">
                    <h3 className="mb-2 font-medium">Detalii Echipament</h3>
                    {(() => {
                      const equipment = equipmentList.find((eq) => eq.id === selectedEquipmentId)
                      if (!equipment) return <p>Echipament negăsit</p>

                      return (
                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Nume:</p>
                            <p>{equipment.nume}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Cod:</p>
                            <p>{equipment.cod}</p>
                          </div>
                          {equipment.model && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Model:</p>
                              <p>{equipment.model}</p>
                            </div>
                          )}
                          {equipment.serie && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Serie:</p>
                              <p>{equipment.serie}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Client:</p>
                            <p>{equipment.clientName}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Locație:</p>
                            <p>{equipment.location}</p>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Statistics summary - Enhanced to emphasize intervention count */}
                <div className="rounded-md border p-4">
                  <h3 className="mb-4 font-medium">Statistici</h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="flex items-center space-x-4 rounded-md border p-4 bg-blue-50">
                      <BarChart3 className="h-10 w-10 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Intervenții</p>
                        <p className="text-3xl font-bold">{stats.totalInterventions}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {reportType === "annual"
                            ? `În anul ${selectedYear}`
                            : dateRange === "all"
                              ? "Toate perioadele"
                              : `${startDate ? format(startDate, "dd.MM.yyyy", { locale: ro }) : ""} - ${endDate ? format(endDate, "dd.MM.yyyy", { locale: ro }) : ""}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 rounded-md border p-4">
                      <Clock className="h-8 w-8 text-green-500" />
                      <div>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">
                                  Timp Mediu Intervenție
                                  {stats.validTimeDataCount > 0 && (
                                    <span className="ml-1 text-xs">({stats.validTimeDataCount} intervenții)</span>
                                  )}
                                </p>
                                <p className="text-2xl font-bold">
                                  {stats.averageTime > 0
                                    ? `${Math.floor(stats.averageTime / 60)}h ${stats.averageTime % 60}m`
                                    : "N/A"}
                                </p>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {stats.validTimeDataCount > 0
                                  ? `Calculat din ${stats.validTimeDataCount} intervenții cu date valide de timp`
                                  : "Nu există date suficiente pentru calculul timpului mediu"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4 rounded-md border p-4">
                      <CheckCircle className="h-8 w-8 text-amber-500" />
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Status Curent</p>
                        <p className="text-xl font-bold">
                          {(() => {
                            if (filteredWorkOrders.length === 0) return "Necunoscut"

                            // Get the most recent work order
                            const latestOrder = [...filteredWorkOrders].sort((a, b) => {
                              const dateA = parseRomanianDateTime(a.dataInterventie) || new Date(0)
                              const dateB = parseRomanianDateTime(b.dataInterventie) || new Date(0)
                              return dateB.getTime() - dateA.getTime()
                            })[0]

                            return latestOrder.statusLucrare || "Necunoscut"
                          })()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Intervention Frequency Analysis */}
                <div className="rounded-md border p-4">
                  <h3 className="mb-4 font-medium">Analiza Frecvenței Intervențiilor</h3>

                  {reportType === "annual" ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">Intervenții totale în {selectedYear}:</p>
                        <p className="text-xl font-bold">{stats.totalInterventions}</p>
                      </div>

                      <div className="grid gap-2 md:grid-cols-3">
                        {Object.entries(stats.byMonth)
                          .filter(([key]) => key.startsWith(selectedYear.toString()))
                          .sort()
                          .map(([monthKey, count]) => {
                            const [year, month] = monthKey.split("-")
                            const monthNames = [
                              "Ianuarie",
                              "Februarie",
                              "Martie",
                              "Aprilie",
                              "Mai",
                              "Iunie",
                              "Iulie",
                              "August",
                              "Septembrie",
                              "Octombrie",
                              "Noiembrie",
                              "Decembrie",
                            ]
                            const monthName = monthNames[Number.parseInt(month) - 1]

                            return (
                              <div key={monthKey} className="flex items-center justify-between rounded-md border p-2">
                                <span>{monthName}</span>
                                <Badge variant="outline">{count}</Badge>
                              </div>
                            )
                          })}
                      </div>

                      <div className="mt-2 text-sm text-muted-foreground">
                        <p>Media lunară: {(stats.totalInterventions / 12).toFixed(1)} intervenții</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">Intervenții în perioada selectată:</p>
                        <p className="text-xl font-bold">{stats.totalInterventions}</p>
                      </div>

                      {Object.keys(stats.byMonth).length > 0 && (
                        <>
                          <p className="text-sm font-medium">Distribuție lunară:</p>
                          <div className="grid gap-2 md:grid-cols-3">
                            {Object.entries(stats.byMonth)
                              .sort()
                              .map(([monthKey, count]) => {
                                const [year, month] = monthKey.split("-")
                                const monthNames = [
                                  "Ianuarie",
                                  "Februarie",
                                  "Martie",
                                  "Aprilie",
                                  "Mai",
                                  "Iunie",
                                  "Iulie",
                                  "August",
                                  "Septembrie",
                                  "Octombrie",
                                  "Noiembrie",
                                  "Decembrie",
                                ]
                                const monthName = monthNames[Number.parseInt(month) - 1]

                                return (
                                  <div
                                    key={monthKey}
                                    className="flex items-center justify-between rounded-md border p-2"
                                  >
                                    <span>
                                      {monthName} {year}
                                    </span>
                                    <Badge variant="outline">{count}</Badge>
                                  </div>
                                )
                              })}
                          </div>
                        </>
                      )}

                      {startDate && endDate && (
                        <div className="mt-2 text-sm text-muted-foreground">
                          <p>
                            Frecvență:{" "}
                            {(
                              stats.totalInterventions /
                              Math.max(
                                1,
                                Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)),
                              )
                            ).toFixed(1)}
                            intervenții/lună
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Charts */}
                <div className="space-y-4">
                  {reportType === "annual" ? (
                    <div className="rounded-md border p-4">
                      <h3 className="mb-4 font-medium">Intervenții Lunare în {selectedYear}</h3>
                      <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis allowDecimals={false} />
                            <RechartsTooltip />
                            <Bar dataKey="intervenții" fill="#3b82f6" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : (
                    <Tabs defaultValue="type" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="type">După Tip Lucrare</TabsTrigger>
                        <TabsTrigger value="status">După Status</TabsTrigger>
                      </TabsList>
                      <TabsContent value="type" className="rounded-md border p-4 mt-4">
                        <h3 className="mb-4 font-medium">Intervenții după Tip Lucrare</h3>
                        <div className="h-80 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData.typeData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis allowDecimals={false} />
                              <RechartsTooltip />
                              <Bar dataKey="intervenții" fill="#3b82f6" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                          {Object.entries(stats.byType).map(([type, count]) => (
                            <div key={type} className="flex items-center justify-between rounded-md border p-2">
                              <span className="font-medium">{type}</span>
                              <div className="flex items-center space-x-2">
                                <span>{count}</span>
                                <Badge variant="outline">{Math.round((count / stats.totalInterventions) * 100)}%</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                      <TabsContent value="status" className="rounded-md border p-4 mt-4">
                        <h3 className="mb-4 font-medium">Intervenții după Status</h3>
                        <div className="h-80 w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData.statusData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis allowDecimals={false} />
                              <RechartsTooltip />
                              <Bar dataKey="intervenții" fill="#10b981" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                          {Object.entries(stats.byStatus).map(([status, count]) => (
                            <div key={status} className="flex items-center justify-between rounded-md border p-2">
                              <span className="font-medium">{status}</span>
                              <div className="flex items-center space-x-2">
                                <span>{count}</span>
                                <Badge variant="outline">{Math.round((count / stats.totalInterventions) * 100)}%</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>

                {/* Work orders list */}
                <div className="rounded-md border p-4">
                  <h3 className="mb-4 font-medium">Lista Intervențiilor</h3>
                  <div className="space-y-4">
                    {filteredWorkOrders.map((order, index) => (
                      <div key={order.id} className="rounded-md border p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                          <div>
                            <h4 className="font-medium">
                              {order.tipLucrare || "Intervenție"} - {order.client}
                            </h4>
                            <p className="text-sm text-muted-foreground">{order.dataInterventie}</p>
                          </div>
                          <Badge
                            className="mt-2 md:mt-0"
                            variant={
                              order.statusLucrare === "Finalizat"
                                ? "success"
                                : order.statusLucrare === "În curs"
                                  ? "warning"
                                  : "default"
                            }
                          >
                            {order.statusLucrare || "În așteptare"}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-2 md:grid-cols-2">
                          {order.defectReclamat && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Defect reclamat:</p>
                              <p className="text-sm">{order.defectReclamat}</p>
                            </div>
                          )}
                          {order.descriereInterventie && (
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Descriere intervenție:</p>
                              <p className="text-sm">{order.descriereInterventie}</p>
                            </div>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {order.tehnicieni &&
                            order.tehnicieni.map((tehnician, idx) => (
                              <Badge key={idx} variant="outline">
                                <Wrench className="mr-1 h-3 w-3" />
                                {tehnician}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
