"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "@/hooks/use-toast"
import { CalendarIcon, RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { syncAttendanceToTimesheet, syncAttendanceRangeToTimesheet, getAttendanceSyncStatus } from "@/lib/attendance/sync-timesheet"
import { cn } from "@/lib/utils"
import { formatRomanianDate, formatRomanianDateTimeLong } from "@/lib/utils/date-utils"
import { DashboardShell } from "@/components/dashboard-shell"

export default function AttendanceSyncPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [startDate, setStartDate] = useState<Date | undefined>()
  const [endDate, setEndDate] = useState<Date | undefined>()
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{
    synced: boolean
    sessionCount: number
    lastSyncAt?: number
  } | null>(null)

  const handleSyncSingleDay = async () => {
    try {
      setLoading(true)
      await syncAttendanceToTimesheet(selectedDate)
      toast({
        title: "Sincronizare Reușită",
        description: `Pontajul pentru ${formatRomanianDate(selectedDate)} a fost sincronizat.`,
      })
      await checkSyncStatus()
    } catch (error) {
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "A apărut o eroare",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSyncRange = async () => {
    if (!startDate || !endDate) {
      toast({
        title: "Date Invalide",
        description: "Selectează ambele date pentru sincronizarea pe interval.",
        variant: "destructive",
      })
      return
    }

    if (startDate > endDate) {
      toast({
        title: "Date Invalide",
        description: "Data de start trebuie să fie înainte de data de sfârșit.",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)
      await syncAttendanceRangeToTimesheet(startDate, endDate)
      toast({
        title: "Sincronizare Reușită",
        description: `Pontajele între ${formatRomanianDate(startDate)} și ${formatRomanianDate(endDate)} au fost sincronizate.`,
      })
    } catch (error) {
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "A apărut o eroare",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const checkSyncStatus = async () => {
    try {
      setLoading(true)
      const status = await getAttendanceSyncStatus(selectedDate)
      setSyncStatus(status)
    } catch (error) {
      console.error("Failed to check sync status:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DashboardShell>
      <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sincronizare Pontaj → Condică</h1>
        <p className="text-muted-foreground mt-2">
          Sincronizează datele de pontaj (check-in/out) cu sistemul de condică de prezență HR
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Single Day Sync */}
        <Card>
          <CardHeader>
            <CardTitle>Sincronizare Zilnică</CardTitle>
            <CardDescription>
              Sincronizează pontajul pentru o zi specifică
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Selectează Ziua</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? formatRomanianDate(selectedDate) : "Selectează data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button
              onClick={handleSyncSingleDay}
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sincronizare...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sincronizează
                </>
              )}
            </Button>

            <Button
              onClick={checkSyncStatus}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              Verifică Status
            </Button>

            {syncStatus && (
              <div className={cn(
                "rounded-lg border p-4",
                syncStatus.synced ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"
              )}>
                <div className="flex items-center gap-2 mb-2">
                  {syncStatus.synced ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <span className="font-semibold">
                    {syncStatus.synced ? "Sincronizat" : "Nesincronizat"}
                  </span>
                </div>
                <div className="text-sm space-y-1 text-muted-foreground">
                  <p>Sesiuni completate: {syncStatus.sessionCount}</p>
                  {syncStatus.lastSyncAt && (
                    <p>Ultima sincronizare: {formatRomanianDateTimeLong(new Date(syncStatus.lastSyncAt))}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Range Sync */}
        <Card>
          <CardHeader>
            <CardTitle>Sincronizare Interval</CardTitle>
            <CardDescription>
              Sincronizează pontajele pentru un interval de timp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Data Start</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? formatRomanianDate(startDate) : "Selectează data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Data Sfârșit</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? formatRomanianDate(endDate) : "Selectează data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button
              onClick={handleSyncRange}
              disabled={loading || !startDate || !endDate}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sincronizare...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sincronizează Intervalul
                </>
              )}
            </Button>

            <div className="rounded-lg border p-4 bg-blue-50 border-blue-200">
              <p className="text-sm text-blue-800">
                <strong>Notă:</strong> Sincronizarea pe interval poate dura câteva momente.
                Fiecare zi va fi procesată secvențial.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Informații</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <h4 className="font-semibold mb-1">Ce face sincronizarea?</h4>
            <p className="text-muted-foreground">
              Sincronizarea transferă automat datele de pontaj (check-in/out) către sistemul de condică HR.
              Pentru fiecare tehnician, se calculează orele lucrate și timpul extra, apoi se creează
              intrări corespunzătoare în condica de prezență.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Când ar trebui să sincronizez?</h4>
            <p className="text-muted-foreground">
              De obicei, sincronizarea se face automat la sfârșitul fiecărei zile. Poți folosi această
              pagină pentru sincronizări manuale în cazul unor probleme sau pentru backfilling.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Ce se întâmplă cu timpul extra?</h4>
            <p className="text-muted-foreground">
              Timpul extra (traseu către client/casă) este calculat separat și adăugat în notele intrării
              din condică. Acesta poate fi apoi validat și aprobat de către administratori.
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </DashboardShell>
  )
}
