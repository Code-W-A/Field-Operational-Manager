"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, Square, Loader2, MapPin, Clock, AlertCircle } from "lucide-react"
import { FaceRecognitionCapture } from "./face-recognition-capture"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  createCheckIn,
  createCheckOut,
  getActiveSession,
  getLatestCompletedSession,
  canCheckOut,
  startExtraTimeLog,
  endExtraTimeLog,
} from "@/lib/attendance/storage"
import { getCurrentLocation, determineMode } from "@/lib/attendance/location"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { extractTime24 } from "@/lib/utils/date-utils"
import type { AttendanceSession, FaceRecognitionResult, AttendanceLocation } from "@/types/attendance"
import type { OfficeLocation } from "@/lib/firebase/auth"

interface FieldCheckInCardProps {
  userId: string
  userName: string
  officeLocation?: OfficeLocation
}

type FlowState = "idle" | "face-recognition" | "processing"

export function FieldCheckInCard({ userId, userName, officeLocation }: FieldCheckInCardProps) {
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"

  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null)
  const [flowState, setFlowState] = useState<FlowState>("idle")
  const [action, setAction] = useState<"check-in" | "check-out" | null>(null)
  const [showFaceDialog, setShowFaceDialog] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkOutDisabled, setCheckOutDisabled] = useState(false)
  const [checkOutTimer, setCheckOutTimer] = useState<number>(0)
  const [currentTime, setCurrentTime] = useState(Date.now())
  const [debugSimMinutes, setDebugSimMinutes] = useState<number | null>(null)

  // Extra time tracking
  const [clientRouteActive, setClientRouteActive] = useState(false)
  const [homeRouteActive, setHomeRouteActive] = useState(false)
  const autoEndTimerRef = useRef<number | null>(null)

  // Load active session on mount
  useEffect(() => {
    loadActiveSession()
  }, [userId])

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Cleanup any pending auto-end timers
  useEffect(() => {
    return () => {
      if (autoEndTimerRef.current) window.clearTimeout(autoEndTimerRef.current)
    }
  }, [])

  // Check if check-out is available (1-minute rule)
  useEffect(() => {
    if (activeSession && activeSession.status === "active") {
      const elapsed = (currentTime - activeSession.sessionStart) / 1000
      if (elapsed < 60) {
        setCheckOutDisabled(true)
        setCheckOutTimer(Math.ceil(60 - elapsed))
      } else {
        setCheckOutDisabled(false)
        setCheckOutTimer(0)
      }
    }
  }, [activeSession, currentTime])

  // Check extra time button visibility
  useEffect(() => {
    if (!activeSession) {
      setClientRouteActive(false)
      setHomeRouteActive(false)
      return
    }

    const now = Date.now()
    const programStart = activeSession.programLucruStart || "08:00"
    const programEnd = activeSession.programLucruEnd || "16:30"

    const toTs = (base: number, hhmm: string) => {
      const [hStr, mStr] = hhmm.split(":")
      const h = Number(hStr)
      const m = Number(mStr)
      const d = new Date(base)
      d.setHours(Number.isFinite(h) ? h : 8, Number.isFinite(m) ? m : 0, 0, 0)
      return d.getTime()
    }

    const hasClientRouteLog = activeSession.extraTimeLogs?.some((log) => log.type === "to_client")
    const hasHomeRouteLog = activeSession.extraTimeLogs?.some((log) => log.type === "to_home")

    // Client route: only during active field session, until min(programStart, 08:00)
    const eightAm = toTs(now, "08:00")
    const programStartTs = toTs(now, programStart)
    const clientCapEnd = Math.min(eightAm, programStartTs)
    setClientRouteActive(
      activeSession.status === "active" &&
        activeSession.mode === "field" &&
        now < clientCapEnd &&
        !hasClientRouteLog
    )

    // Home route: only after completed field session, after program end, within 1h of program end and 1h of stop
    const programEndTs = toTs(activeSession.sessionEnd || now, programEnd)
    const homeWindowEnd = programEndTs + 60 * 60 * 1000
    const sessionEnd = activeSession.sessionEnd
    const withinOneHourOfStop = sessionEnd ? (now - sessionEnd) / 60000 <= 60 : false
    const stopAfterProgramEnd = sessionEnd ? sessionEnd >= programEndTs : false
    setHomeRouteActive(
      activeSession.status === "completed" &&
        activeSession.mode === "field" &&
        Boolean(sessionEnd) &&
        stopAfterProgramEnd &&
        withinOneHourOfStop &&
        now <= homeWindowEnd &&
        !hasHomeRouteLog
    )
  }, [activeSession, currentTime])

  const loadActiveSession = async () => {
    try {
      setLoading(true)
      const session = await getActiveSession(userId)
      if (session) {
        setActiveSession(session)
      } else {
        // If no active session, keep a recent completed one so "Traseu către casă" can be started.
        const recent = await getLatestCompletedSession(userId, { sinceMs: Date.now() - 2 * 60 * 60 * 1000 })
        setActiveSession(recent)
      }
    } catch (error) {
      console.error("Failed to load active session:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCheckIn = () => {
    setAction("check-in")
    setShowFaceDialog(true)
    setFlowState("face-recognition")
  }

  const handleCheckOut = async () => {
    // Double-check 1-minute rule
    if (activeSession) {
      const check = await canCheckOut(activeSession.id)
      if (!check.allowed) {
        toast({
          title: "Prea devreme",
          description: `Te rugăm să aștepți încă ${check.remainingSeconds} secunde.`,
          variant: "destructive",
        })
        return
      }
    }

    setAction("check-out")
    setShowFaceDialog(true)
    setFlowState("face-recognition")
  }

  const handleCheckOutDebug = async (minutes: number) => {
    if (!debugEnabled) return
    if (!Number.isFinite(minutes) || minutes <= 0) return
    // Same 1-minute rule to keep behavior consistent.
    if (activeSession) {
      const check = await canCheckOut(activeSession.id)
      if (!check.allowed) {
        toast({
          title: "Prea devreme",
          description: `Te rugăm să aștepți încă ${check.remainingSeconds} secunde.`,
          variant: "destructive",
        })
        return
      }
    }
    setDebugSimMinutes(Math.round(minutes))
    setAction("check-out")
    setShowFaceDialog(true)
    setFlowState("face-recognition")
  }

  const handleFaceRecognitionSuccess = async (result: FaceRecognitionResult) => {
    setFlowState("processing")

    try {
      const location: AttendanceLocation = await getCurrentLocation()
      const mode = determineMode(location, officeLocation)

      if (action === "check-in") {
        await createCheckIn({
          userId,
          userName,
          mode,
          location,
          faceRecognitionId: result.faceId,
          deviceInfo: {
            type: "field",
            userAgent: navigator.userAgent,
          },
        })

        toast({
          title: "Check-In Reușit!",
          description: `Bun venit, ${userName}!`,
        })

        // Reload session
        await loadActiveSession()
      } else if (action === "check-out") {
        if (!activeSession) {
          throw new Error("Nu există o sesiune activă")
        }

        const syncResult = await createCheckOut({
          sessionId: activeSession.id,
          mode,
          location,
          faceRecognitionId: result.faceId,
          deviceInfo: {
            type: "field",
            userAgent: navigator.userAgent,
          },
          ...(debugEnabled && debugSimMinutes ? { debugSimulatedDurationMinutes: debugSimMinutes } : {}),
        })

        if (syncResult && !syncResult.synced) {
          toast({
            title: "Pontaj salvat, dar nesincronizat în condică",
            description:
              syncResult.reason === "no_employee"
                ? "Nu am găsit salariatul HR asociat acestui user. Verifică în Resurse Umane → Salariați că există `userUid` setat."
                : syncResult.reason === "protected_day"
                  ? "Ziua este protejată (CO/DEL/SL/WE/IN) și nu a fost suprascrisă."
                  : "Nu există sesiuni completate pentru ziua respectivă.",
          })
        }

        toast({
          title: "Check-Out Reușit!",
          description: `La revedere, ${userName}!`,
        })

        const endForLocal = (() => {
          if (!debugEnabled || !debugSimMinutes) return Date.now()
          const d = new Date(activeSession.sessionStart)
          d.setHours(23, 59, 59, 999)
          const endOfDay = d.getTime()
          const desired = activeSession.sessionStart + Math.round(debugSimMinutes) * 60 * 1000
          return Math.min(desired, endOfDay)
        })()

        // Keep it locally as completed so "Traseu către casă" can be started right after Stop.
        setActiveSession({
          ...activeSession,
          status: "completed",
          sessionEnd: endForLocal,
          checkOutMode: mode,
          checkOutLocation: location,
        })
      }

      setShowFaceDialog(false)
      setFlowState("idle")
      setAction(null)
      setDebugSimMinutes(null)
    } catch (error) {
      console.error("Field check-in/out error:", error)
      const message = error instanceof Error ? error.message : "A apărut o eroare"
      const isLeaveBlock = message.toLowerCase().includes("ești în concediu")
      toast({
        title: isLeaveBlock ? "În concediu" : "Eroare",
        description: message,
        variant: isLeaveBlock ? "default" : "destructive",
      })
      setShowFaceDialog(false)
      setFlowState("idle")
      setAction(null)
      setDebugSimMinutes(null)
    }
  }

  const handleFaceRecognitionError = (error: string) => {
    console.log("Face recognition attempt failed:", error)
  }

  const handleStartClientRoute = async () => {
    if (!activeSession) return

    try {
      await startExtraTimeLog({
        sessionId: activeSession.id,
        type: "to_client",
      })

      toast({
        title: "Traseu Către Client Activat",
        description: "Timpul extra va fi contorizat.",
      })

      await loadActiveSession()

      // Auto-end at the cap (min(programStart, 08:00))
      if (autoEndTimerRef.current) window.clearTimeout(autoEndTimerRef.current)
      const now = Date.now()
      const programStart = activeSession.programLucruStart || "08:00"
      const toTs = (base: number, hhmm: string) => {
        const [hStr, mStr] = hhmm.split(":")
        const h = Number(hStr)
        const m = Number(mStr)
        const d = new Date(base)
        d.setHours(Number.isFinite(h) ? h : 8, Number.isFinite(m) ? m : 0, 0, 0)
        return d.getTime()
      }
      const capEnd = Math.min(toTs(now, "08:00"), toTs(now, programStart))
      const msUntilCap = Math.max(0, capEnd - now)
      autoEndTimerRef.current = window.setTimeout(async () => {
        try {
          await endExtraTimeLog(activeSession.id, "to_client")
          await loadActiveSession()
        } catch {
          // ignore
        }
      }, msUntilCap)
    } catch (error) {
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "Nu s-a putut activa traseul",
        variant: "destructive",
      })
    }
  }

  const handleStartHomeRoute = async () => {
    if (!activeSession) return

    try {
      await startExtraTimeLog({
        sessionId: activeSession.id,
        type: "to_home",
      })

      toast({
        title: "Traseu Către Casă Activat",
        description: "Timpul extra va fi contorizat.",
      })

      await loadActiveSession()

      // Auto-end after max 60 minutes (backend also caps)
      if (autoEndTimerRef.current) window.clearTimeout(autoEndTimerRef.current)
      autoEndTimerRef.current = window.setTimeout(async () => {
        try {
          await endExtraTimeLog(activeSession.id, "to_home")
          await loadActiveSession()
        } catch {
          // ignore
        }
      }, 60 * 60 * 1000)
    } catch (error) {
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "Nu s-a putut activa traseul",
        variant: "destructive",
      })
    }
  }

  const formatDuration = (start: number) => {
    const duration = Math.floor((currentTime - start) / 1000)
    const hours = Math.floor(duration / 3600)
    const minutes = Math.floor((duration % 3600) / 60)
    const seconds = duration % 60
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }

  if (loading) {
    return (
      <Card className="border shadow-sm">
        <CardContent className="pt-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  const isCheckedIn = activeSession && activeSession.status === "active"
  const isKioskStartedActive = activeSession?.status === "active" && activeSession?.deviceInfo?.type === "kiosk"

  return (
    <>
      <Card className="relative overflow-hidden border border-gray-100 shadow-lg shadow-gray-200/50 bg-white max-w-xl transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/60">
        {/* Single decorative circle in top right corner - only visible part inside card */}
        <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-emerald-100 to-blue-100 rounded-full -mr-14 -mt-14 opacity-50" />
        
        <CardContent className="p-4 sm:p-5 relative z-10">
          <div className="flex items-start justify-between gap-6">
            {/* Left column - Welcome, Time, and Button */}
            <div className="flex-1 space-y-3 pb-4">
              {/* Welcome message */}
              <div className="space-y-0.5">
                <p className="text-gray-400 text-sm font-medium tracking-wide">Bun venit,</p>
                <p className="text-gray-900 text-xl sm:text-2xl font-bold tracking-tight leading-tight">{userName}</p>
              </div>

              {/* Current time - large display (24h format, HH:mm only) */}
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl sm:text-5xl font-bold text-gray-900 tracking-tight tabular-nums">
                    {extractTime24(new Date(currentTime))}
                  </span>
                </div>
                {isCheckedIn && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 rounded-full border border-emerald-100">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-emerald-700 font-semibold">ACTIV • {formatDuration(activeSession.sessionStart)}</span>
                  </div>
                )}
              </div>

              {/* Action button - Play/Stop */}
              {!isCheckedIn ? (
                <Button
                  className="w-full max-w-[200px] h-11 font-semibold shadow-md hover:shadow-lg transition-all duration-300 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl flex items-center justify-center gap-2 group"
                  onClick={handleCheckIn}
                  disabled={flowState !== "idle"}
                >
                  {flowState === "processing" && action === "check-in" ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Procesare...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 transition-transform group-hover:scale-110" fill="currentColor" />
                      <span>Play</span>
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  className={cn(
                    "w-full max-w-[200px] h-11 font-semibold shadow-md hover:shadow-lg transition-all duration-300 rounded-xl flex items-center justify-center gap-2 group",
                    checkOutDisabled
                      ? "bg-gray-300 cursor-not-allowed text-gray-500" 
                      : "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white"
                  )}
                  onClick={handleCheckOut}
                  disabled={checkOutDisabled || flowState !== "idle"}
                >
                  {flowState === "processing" && action === "check-out" ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Procesare...</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-5 w-5 transition-transform group-hover:scale-110" fill="currentColor" />
                      <span>Stop{checkOutTimer > 0 && ` (${checkOutTimer}s)`}</span>
                    </>
                  )}
                </Button>
              )}

              {/* Debug: simulate longer sessions without waiting */}
              {debugEnabled && isCheckedIn && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCheckOutDebug(120)}
                    disabled={checkOutDisabled || flowState !== "idle"}
                  >
                    Stop +2h (debug)
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleCheckOutDebug(420)}
                    disabled={checkOutDisabled || flowState !== "idle"}
                  >
                    Stop +7h (debug)
                  </Button>
                </div>
              )}

              {/* Kiosk-start banner */}
              {isKioskStartedActive && (
                <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 max-w-[420px]">
                  <AlertCircle className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-semibold">Tură pornită la birou (Kiosk)</div>
                    <div className="text-slate-600">
                      Poți încheia tura de aici sau din Kiosk.
                    </div>
                  </div>
                </div>
              )}

              {/* Warning message for 1-minute rule */}
              {checkOutDisabled && (
                <div className="flex items-center gap-2 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 max-w-[350px] animate-in fade-in slide-in-from-top duration-300">
                  <AlertCircle className="h-4 w-4 shrink-0 animate-pulse" />
                  <span className="font-medium">Așteptați <span className="font-bold">{checkOutTimer}s</span> pentru check-out</span>
                </div>
              )}

              {/* Extra Time Buttons */}
              {(clientRouteActive || homeRouteActive) && (
                <div className="flex gap-2 pt-1 animate-in fade-in slide-in-from-bottom duration-500">
                  {clientRouteActive && (
                    <Button
                      onClick={handleStartClientRoute}
                      className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-sm h-9 px-4 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group"
                      size="sm"
                    >
                      <MapPin className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
                      Traseu Client
                    </Button>
                  )}
                  {homeRouteActive && (
                    <Button
                      onClick={handleStartHomeRoute}
                      className="bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white text-sm h-9 px-4 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 group"
                      size="sm"
                    >
                      <MapPin className="mr-2 h-4 w-4 transition-transform group-hover:scale-110" />
                      Traseu Casă
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Right column - Worker illustration with adjustable position */}
            <div className="shrink-0 opacity-90 transition-opacity duration-300 hover:opacity-100">
              <img 
                src="/worker-image.png" 
                alt="Worker" 
                className="h-32 w-32 sm:h-36 sm:w-36 object-contain relative bottom-[-18px] sm:bottom-[-22px] drop-shadow-lg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Face Recognition Dialog */}
      <Dialog open={showFaceDialog} onOpenChange={(open) => {
        if (!open) {
          setShowFaceDialog(false)
          setFlowState("idle")
          setAction(null)
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              Recunoaștere Facială
            </DialogTitle>
            <DialogDescription className="text-center">
              Pentru {action === "check-in" ? "Check-In" : "Check-Out"}
            </DialogDescription>
          </DialogHeader>

          {flowState === "face-recognition" && (
            <FaceRecognitionCapture
              onSuccess={handleFaceRecognitionSuccess}
              onError={handleFaceRecognitionError}
              userId={userId}
              userName={userName}
              autoStart={true}
              implementation="camera"
            />
          )}

          {flowState === "processing" && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-lg">Procesăm...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
