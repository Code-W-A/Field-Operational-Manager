"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Play, Square, UserCircle2, LogOut } from "lucide-react"
import { Input } from "@/components/ui/input"
import { createCheckIn, createCheckOut, getActiveSession } from "@/lib/attendance/storage"
import { getCurrentLocation, determineMode } from "@/lib/attendance/location"
import { resolveAttendanceSpecialDay, type AttendanceSpecialDayInfo } from "@/lib/attendance/special-day-confirmation"
import { subscribeHrHolidays } from "@/lib/hr/storage"
import { extractTime24 } from "@/lib/utils/date-utils"
import { toast } from "@/hooks/use-toast"
import type { FaceRecognitionResult, AttendanceLocation, AttendanceSpecialDayConfirmation } from "@/types/attendance"
import type { HrHoliday } from "@/lib/hr/types"
import type { OfficeLocation } from "@/lib/firebase/auth"
import { verifyUserPassword } from "@/lib/firebase/kiosk-verifier-auth"
import { useAuth } from "@/contexts/AuthContext"
import { signOut } from "@/lib/firebase/auth"
import { useRouter } from "next/navigation"
import { SelfieCapture } from "@/components/attendance/selfie-capture"
import { uploadFile } from "@/lib/firebase/storage"
import type { KioskEligibleRole } from "@/lib/attendance/kiosk-eligible-users"

export interface KioskUser {
  uid: string
  displayName: string
  role: KioskEligibleRole
  email?: string
  photoURL?: string
  disabled?: boolean
  disabledReason?: string
}

export interface KioskCheckInProps {
  users: KioskUser[]
  officeLocation?: OfficeLocation
}

type FlowState = "idle" | "select-action" | "select-user" | "verify-password" | "selfie" | "processing" | "success"

export function KioskCheckIn({ users, officeLocation }: KioskCheckInProps) {
  const { user, userData } = useAuth()
  const router = useRouter()
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"

  const [flowState, setFlowState] = useState<FlowState>("idle")
  const [action, setAction] = useState<"check-in" | "check-out" | null>(null)
  const [debugSimMinutes, setDebugSimMinutes] = useState<number | null>(null)
  const [selectedUser, setSelectedUser] = useState<KioskUser | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [password, setPassword] = useState("")
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [userSelectBusyUid, setUserSelectBusyUid] = useState<string | null>(null)

  const [alreadyStartedOpen, setAlreadyStartedOpen] = useState(false)
  const [alreadyStartedAt, setAlreadyStartedAt] = useState<number | null>(null)

  const [noActiveOpen, setNoActiveOpen] = useState(false)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [holidays, setHolidays] = useState<HrHoliday[]>([])
  const [specialDayWarning, setSpecialDayWarning] = useState<AttendanceSpecialDayInfo | null>(null)
  const [specialDayConfirmed, setSpecialDayConfirmed] = useState<AttendanceSpecialDayConfirmation | null>(null)

  // Kiosk logout flow
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutStep, setLogoutStep] = useState<"password" | "confirm">("password")
  const [logoutPassword, setLogoutPassword] = useState("")
  const [logoutSubmitting, setLogoutSubmitting] = useState(false)

  // Auto-reset to idle after inactivity or success
  useEffect(() => {
    if (flowState === "success") {
      const timer = setTimeout(() => {
        resetFlow()
      }, 3000)
      return () => clearTimeout(timer)
    }

    if (flowState !== "idle") {
      const timer = setTimeout(() => {
        resetFlow()
        toast({
          title: "Timeout",
          description: "Sesiune expirată. Te rugăm să încerci din nou.",
          variant: "destructive",
        })
      }, 30000) // 30 seconds timeout
      return () => clearTimeout(timer)
    }
  }, [flowState])

  useEffect(() => {
    const year = new Date().getFullYear()
    return subscribeHrHolidays({
      year,
      onChange: setHolidays,
      onError: (error) => {
        console.warn("Nu s-au putut încărca sărbătorile legale pentru pontaj kiosk:", error)
        setHolidays([])
      },
    })
  }, [])

  const resetFlow = () => {
    setFlowState("idle")
    setAction(null)
    setDebugSimMinutes(null)
    setSelectedUser(null)
    setShowDialog(false)
    setShowPasswordDialog(false)
    setPassword("")
    setPasswordSubmitting(false)
    setUserSelectBusyUid(null)
    setAlreadyStartedOpen(false)
    setAlreadyStartedAt(null)
    setNoActiveOpen(false)
    setConfirmOpen(false)
    setSpecialDayWarning(null)
    setSpecialDayConfirmed(null)
  }

  const resetLogout = () => {
    setLogoutOpen(false)
    setLogoutStep("password")
    setLogoutPassword("")
    setLogoutSubmitting(false)
  }

  const handleLogoutVerifyPassword = async () => {
    const email = (user?.email || userData?.email || "").trim()
    if (!email) {
      toast({
        title: "Email lipsă",
        description: "Contul Kiosk nu are email disponibil. Nu se poate valida parola.",
        variant: "destructive",
      })
      return
    }
    try {
      setLogoutSubmitting(true)
      await verifyUserPassword(email, logoutPassword)
      setLogoutStep("confirm")
    } catch (error) {
      toast({
        title: "Parolă invalidă",
        description: error instanceof Error ? error.message : "Nu s-a putut verifica parola.",
        variant: "destructive",
      })
    } finally {
      setLogoutSubmitting(false)
    }
  }

  const handleLogoutConfirm = async () => {
    try {
      setLogoutSubmitting(true)
      await signOut()
      // Best-effort: clear role cookie so middleware won't redirect.
      try {
        document.cookie = "userRole=; Path=/; Max-Age=0; SameSite=Lax"
      } catch {}
      router.replace("/login")
      resetLogout()
    } catch (error) {
      toast({
        title: "Eroare deconectare",
        description: error instanceof Error ? error.message : "Nu s-a putut deconecta.",
        variant: "destructive",
      })
      setLogoutSubmitting(false)
    }
  }

  const handleActionSelect = (selectedAction: "check-in" | "check-out") => {
    setAction(selectedAction)
    setDebugSimMinutes(null)
    setFlowState("select-user")
  }

  const handleActionSelectDebugStop = (minutes: number) => {
    if (!debugEnabled) return
    if (!Number.isFinite(minutes) || minutes <= 0) return
    setAction("check-out")
    setDebugSimMinutes(Math.round(minutes))
    setFlowState("select-user")
  }

  const handleUserSelect = async (user: KioskUser) => {
    if (!action) return
    if (userSelectBusyUid) return
    if (user.disabled) {
      toast({
        title: "Utilizator indisponibil",
        description: user.disabledReason || "Acest salariat nu este asociat cu un utilizator valid.",
        variant: "destructive",
      })
      return
    }

    setUserSelectBusyUid(user.uid)
    setSelectedUser(user)
    setPassword("")

    try {
      // Double-start guard: if Start selected but user already has an active session, offer Stop.
      if (action === "check-in") {
        const active = await getActiveSession(user.uid)
        if (active) {
          setAlreadyStartedAt(active.sessionStart)
          setAlreadyStartedOpen(true)
          return
        }
      } else if (action === "check-out") {
        // Symmetric guard: if Stop selected but user has no active session, offer Start.
        const active = await getActiveSession(user.uid)
        if (!active) {
          setNoActiveOpen(true)
          return
        }
      }

      // Confirmation comes before password (per requirement)
      setSpecialDayWarning(action === "check-in" ? resolveAttendanceSpecialDay(new Date(), holidays) : null)
      setSpecialDayConfirmed(null)
      setConfirmOpen(true)
    } catch (error) {
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "Nu s-a putut verifica starea pontajului.",
        variant: "destructive",
      })
      setSelectedUser(null)
    } finally {
      setUserSelectBusyUid(null)
    }
  }

  const proceedAfterConfirm = () => {
    if (action === "check-in" && specialDayWarning) {
      setSpecialDayConfirmed({
        ...specialDayWarning,
        required: true,
        confirmed: true,
        confirmedAt: Date.now(),
      })
    } else {
      setSpecialDayConfirmed(null)
    }
    setConfirmOpen(false)
    setShowPasswordDialog(true)
    setFlowState("verify-password")
  }

  const handlePasswordVerify = async () => {
    if (!selectedUser || !action) return
    const email = selectedUser.email
    if (!email) {
      toast({
        title: "Email lipsă",
        description: "Acest utilizator nu are email setat, nu se poate verifica parola.",
        variant: "destructive",
      })
      return
    }

    try {
      setPasswordSubmitting(true)
      await verifyUserPassword(email, password)
      // Success: continue to selfie capture (audit)
      setShowPasswordDialog(false)
      setShowDialog(true)
      setFlowState("selfie")
    } catch (error) {
      toast({
        title: "Parolă invalidă",
        description: error instanceof Error ? error.message : "Nu s-a putut verifica parola.",
        variant: "destructive",
      })
    } finally {
      setPasswordSubmitting(false)
    }
  }

  const uploadSelfie = async (blob: Blob, kind: "checkin" | "checkout") => {
    if (!selectedUser || !action) throw new Error("Utilizator/Acțiune lipsă")
    const sessionId =
      action === "check-out"
        ? (await getActiveSession(selectedUser.uid))?.id || `att_${selectedUser.uid}_${Date.now()}`
        : `att_${selectedUser.uid}_${Date.now()}`
    const ts = Date.now()
    const path = `attendance/selfies/${selectedUser.uid}/${sessionId}/${kind}-${ts}.jpg`
    const file = new File([blob], `${kind}-${ts}.jpg`, { type: "image/jpeg" })
    const { url } = await uploadFile(file, path)
    return { url, path }
  }

  const handleFaceRecognitionSuccess = async (result: FaceRecognitionResult) => {
    if (!selectedUser || !action) return

    setFlowState("processing")

    try {
      let location: AttendanceLocation
      try {
        location = await getCurrentLocation()
      } catch (error) {
        // If location fails in kiosk mode, use office location as fallback
        if (officeLocation) {
          location = {
            lat: officeLocation.lat,
            lng: officeLocation.lng,
            address: officeLocation.address || "Office",
          }
        } else {
          throw new Error("Nu s-a putut determina locația")
        }
      }

      const mode = determineMode(location, officeLocation)

      if (action === "check-in") {
        await createCheckIn({
          userId: selectedUser.uid,
          userName: selectedUser.displayName,
          mode,
          location,
          faceRecognitionId: result.faceId,
          deviceInfo: {
            type: "kiosk",
            userAgent: navigator.userAgent,
          },
          specialDayConfirmation: specialDayConfirmed ?? undefined,
          ...(result as any).__selfieCheckIn,
        })

        toast({
          title: "Check-In Reușit!",
          description: `Bun venit, ${selectedUser.displayName}!`,
        })
        try {
          const active = await getActiveSession(selectedUser.uid)
          const lateMin = Number((active as any)?.lateStartMinutes ?? 0)
          const sched = String((active as any)?.scheduledStart ?? (active as any)?.programLucruStart ?? "08:00")
          if (lateMin > 0) {
            toast({
              title: "Întârziere (informativ)",
              description: `Ai pornit pontajul cu ${lateMin} min după ora de start (${sched}).`,
            })
          }
        } catch {
          // non-blocking
        }
      } else {
        // For check-out, get the active session
        const activeSession = await getActiveSession(selectedUser.uid)

        if (!activeSession) {
          throw new Error("Nu există o sesiune activă pentru acest utilizator")
        }

        const syncResult = await createCheckOut({
          sessionId: activeSession.id,
          mode,
          location,
          faceRecognitionId: result.faceId,
          deviceInfo: {
            type: "kiosk",
            userAgent: navigator.userAgent,
          },
          ...(result as any).__selfieCheckOut,
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
          description: `La revedere, ${selectedUser.displayName}!`,
        })
      }

      setFlowState("success")
    } catch (error) {
      console.error("Kiosk check-in/out error:", error)
      const message = error instanceof Error ? error.message : "A apărut o eroare"
      const isLeaveBlock = message.toLowerCase().includes("ești în concediu")
      toast({
        title: isLeaveBlock ? "În concediu" : "Eroare",
        description: message,
        variant: isLeaveBlock ? "default" : "destructive",
      })
      setFlowState("idle")
      setShowDialog(false)
    }
  }

  const handleFaceRecognitionError = (error: string) => {
    // The component will auto-retry, just log
    console.log("Selfie step failed:", error)
  }

  return (
    <div className="min-h-[100svh] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex justify-center p-4 sm:p-8 overflow-hidden">
      <div className="w-full max-w-4xl relative min-h-[calc(100svh-2rem)] sm:min-h-[calc(100svh-4rem)] flex flex-col">
        {/* Top-right logout */}
        <div className="absolute top-0 right-0">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Deconectare"
            title="Deconectare"
            className="bg-white/10 text-white hover:bg-white/20 border border-white/10"
            onClick={() => {
              setLogoutOpen(true)
              setLogoutStep("password")
              setLogoutPassword("")
              setLogoutSubmitting(false)
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>

        {/* Idle State - Show Action Selection */}
        {flowState === "idle" && (
          <div className="flex-1 flex flex-col animate-in fade-in duration-500">
            {/* Header pinned to top */}
            <div className="text-center pt-10 sm:pt-6 space-y-2 sm:space-y-4">
              <h1 className="text-3xl sm:text-5xl font-bold text-white">Sistem Pontaj</h1>
              <p className="text-base sm:text-xl text-slate-300">Apasă pentru a începe</p>
            </div>

            {/* Buttons centered vertically */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-3xl">
              <button
                onClick={() => handleActionSelect("check-in")}
                className="group relative p-6 sm:p-12 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-3xl shadow-2xl hover:shadow-emerald-500/50 transition-all duration-300 sm:hover:scale-105"
              >
                <div className="flex flex-col items-center gap-4 sm:gap-6">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors backdrop-blur-sm">
                    <Play className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white">
                    Start
                  </div>
                  <div className="text-sm sm:text-lg text-emerald-100">
                    Check-In
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleActionSelect("check-out")}
                className="group relative p-6 sm:p-12 bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-3xl shadow-2xl hover:shadow-orange-500/50 transition-all duration-300 sm:hover:scale-105"
              >
                <div className="flex flex-col items-center gap-4 sm:gap-6">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors backdrop-blur-sm">
                    <Square className="w-8 h-8 sm:w-12 sm:h-12 text-white" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-white">
                    Stop
                  </div>
                  <div className="text-sm sm:text-lg text-orange-100">
                    Check-Out
                  </div>
                </div>
              </button>

              {debugEnabled && (
                <button
                  onClick={() => handleActionSelectDebugStop(420)}
                  className="sm:col-span-2 group relative p-4 bg-white/10 hover:bg-white/15 rounded-2xl border border-white/20 text-white transition-all duration-200"
                >
                  <div className="text-sm font-semibold">Stop +7h (debug)</div>
                  <div className="text-xs text-slate-200">Finalizează cu durată simulată, apoi sync în condică</div>
                </button>
              )}
              </div>
            </div>
          </div>
        )}

        {/* User Selection State */}
        {flowState === "select-user" && (
          <div className="animate-in fade-in slide-in-from-bottom duration-500">
            <div className="bg-white rounded-3xl shadow-2xl p-8">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-2">
                  Selectează numele tău
                </h2>
                <p className="text-gray-600">
                  Pentru {action === "check-in" ? "Start" : "Stop"}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto">
                {users.map((user) => (
                  <button
                    key={user.uid}
                    onClick={() => handleUserSelect(user)}
                    disabled={Boolean(userSelectBusyUid) || Boolean(user.disabled)}
                    className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 rounded-2xl transition-all hover:scale-105 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-500 flex items-center justify-center shadow-md overflow-hidden">
                        {user.photoURL ? (
                          <img
                            src={user.photoURL}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              // fallback to icon if image fails
                              ;(e.currentTarget as HTMLImageElement).style.display = "none"
                            }}
                          />
                        ) : (
                          <UserCircle2 className="w-10 h-10 text-white" />
                        )}
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-gray-900">
                          {user.displayName}
                        </div>
                        <div className="text-xs text-gray-600 capitalize">
                          {user.role}
                        </div>
                        {user.disabled && (
                          <div className="text-xs text-orange-700 mt-1">
                            {user.disabledReason || "Neasociat cu utilizator"}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-6 text-center">
                <Button
                  variant="outline"
                  onClick={resetFlow}
                  size="lg"
                >
                  Anulează
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Success State */}
        {flowState === "success" && (
          <div className="text-center space-y-6 animate-in zoom-in duration-500">
            <div className="w-32 h-32 mx-auto rounded-full bg-emerald-500 flex items-center justify-center shadow-2xl relative">
              <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
              {/* Worker icon overlay */}
              <div className="absolute -bottom-2 -right-2 opacity-80">
                <img 
                  src="/worker-image.png" 
                  alt="" 
                  className="h-16 w-16 object-contain"
                />
              </div>
            </div>
            <h2 className="text-4xl font-bold text-white">
              Succes!
            </h2>
            <p className="text-xl text-slate-300">
              {action === "check-in" ? "Ți-ai început" : "Ți-ai încheiat"} tura
            </p>
          </div>
        )}
      </div>

      {/* Selfie Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        if (!open) {
          if (flowState === "selfie" || flowState === "processing") {
            toast({
              title: "Selfie obligatoriu",
              description: "Nu poți continua fără selfie. Te rugăm să încerci din nou.",
              variant: "destructive",
            })
            return
          }
          resetFlow()
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              Selfie pontaj
            </DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="text-center mb-4">
              <p className="text-lg text-muted-foreground">
                Pentru: <span className="font-semibold text-foreground">{selectedUser.displayName}</span>
              </p>
            </div>
          )}

          {flowState === "selfie" && (
            <div className="py-2">
              <SelfieCapture
                onCaptured={async (r) => {
                  if (!selectedUser || !action) return
                  if (!r.ok || !r.blob) {
                    toast({
                      title: "Selfie indisponibil",
                      description: r.error || "Nu am putut captura selfie-ul. Te rugăm să încerci din nou.",
                      variant: "destructive",
                    })
                    return
                  }
                  try {
                    const uploaded = await uploadSelfie(r.blob, action === "check-in" ? "checkin" : "checkout")
                    const base: FaceRecognitionResult = {
                      success: true,
                      faceId: `kiosk_pw_${selectedUser.uid}_${Date.now()}`,
                      confidence: 1,
                    }
                    if (action === "check-in") {
                      ;(base as any).__selfieCheckIn = {
                        checkInSelfieUrl: uploaded.url,
                        checkInSelfiePath: uploaded.path,
                        checkInSelfieStatus: "ok",
                      }
                    } else {
                      ;(base as any).__selfieCheckOut = {
                        checkOutSelfieUrl: uploaded.url,
                        checkOutSelfiePath: uploaded.path,
                        checkOutSelfieStatus: "ok",
                      }
                    }
                    await handleFaceRecognitionSuccess(base)
                  } catch (e) {
                    toast({
                      title: "Upload selfie eșuat",
                      description: e instanceof Error ? e.message : "Nu am putut încărca poza. Te rugăm să încerci din nou.",
                      variant: "destructive",
                    })
                    return
                  }
                }}
                allowSkip={false}
              />
            </div>
          )}

          {flowState === "processing" && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-lg">Procesăm...</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Already started dialog (Start selected but user already active) */}
      <Dialog
        open={alreadyStartedOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAlreadyStartedOpen(false)
            setAlreadyStartedAt(null)
            // Stay in select-user so operator can choose someone else.
            setSelectedUser(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">Pontaj deja pornit</DialogTitle>
            <DialogDescription className="text-center">
              Acest utilizator are deja tura pornită.
              {alreadyStartedAt ? ` (Start: ${extractTime24(new Date(alreadyStartedAt))})` : ""}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAlreadyStartedOpen(false)
                setAlreadyStartedAt(null)
                setSelectedUser(null)
              }}
            >
              Anulează
            </Button>
            <Button
              onClick={() => {
                // Switch flow to Stop
                setAlreadyStartedOpen(false)
                setAlreadyStartedAt(null)
                setAction("check-out")
                setSpecialDayWarning(null)
                setSpecialDayConfirmed(null)
                // Confirmation before password
                setConfirmOpen(true)
              }}
            >
              Stop acum
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* No active session dialog (Stop selected but user not active) */}
      <Dialog
        open={noActiveOpen}
        onOpenChange={(open) => {
          if (!open) {
            setNoActiveOpen(false)
            setSelectedUser(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">Nu există tură activă</DialogTitle>
            <DialogDescription className="text-center">
              Acest utilizator nu are o tură pornită în acest moment.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNoActiveOpen(false)
                setSelectedUser(null)
              }}
            >
              Anulează
            </Button>
            <Button
              onClick={() => {
                // Switch flow to Start
                setNoActiveOpen(false)
                setAction("check-in")
                setSpecialDayWarning(resolveAttendanceSpecialDay(new Date(), holidays))
                setSpecialDayConfirmed(null)
                setConfirmOpen(true)
              }}
            >
              Start acum
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Start/Stop dialog (before password) */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmOpen(false)
            setSelectedUser(null)
            setPassword("")
            setFlowState("select-user")
            setSpecialDayWarning(null)
            setSpecialDayConfirmed(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {action === "check-in" ? "Confirmare Start" : "Confirmare Stop"}
            </DialogTitle>
            <DialogDescription className="text-center">
              {action === "check-in" && specialDayWarning
                ? `Azi este ${specialDayWarning.label}. Confirmi că vrei să pornești pontajul?`
                : action === "check-in"
                ? "Confirmi că vrei să începi tura?"
                : "Confirmi că vrei să închei tura?"}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="flex flex-col items-center justify-center gap-3 pt-2">
              <div className="h-48 w-48 rounded-full overflow-hidden bg-muted border flex items-center justify-center">
                {selectedUser.photoURL ? (
                  <img src={selectedUser.photoURL} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserCircle2 className="h-24 w-24 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Pentru: <span className="font-semibold text-foreground">{selectedUser.displayName}</span>
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmOpen(false)
                setSelectedUser(null)
                setPassword("")
                setFlowState("select-user")
                setSpecialDayWarning(null)
                setSpecialDayConfirmed(null)
              }}
            >
              Nu
            </Button>
            <Button onClick={proceedAfterConfirm}>
              {action === "check-in" && specialDayWarning ? "Da, mă pontez" : "Da, continuă"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password verification dialog (before face recognition) */}
      <Dialog
        open={showPasswordDialog}
        onOpenChange={(open) => {
          if (!open) {
            // Back out to user selection
            setShowPasswordDialog(false)
            setPassword("")
            setPasswordSubmitting(false)
            setFlowState("select-user")
            setSpecialDayWarning(null)
            setSpecialDayConfirmed(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">Confirmare parolă</DialogTitle>
            <DialogDescription className="text-center">
              Introdu parola contului tău pentru {action === "check-in" ? "Start" : "Stop"}.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="text-center -mt-1">
              <p className="text-sm text-muted-foreground">
                Utilizator: <span className="font-semibold text-foreground">{selectedUser.displayName}</span>
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Parolă</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Introduceți parola"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePasswordVerify()
              }}
              disabled={passwordSubmitting}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPasswordDialog(false)
                setPassword("")
                setPasswordSubmitting(false)
                setFlowState("select-user")
                setSpecialDayWarning(null)
                setSpecialDayConfirmed(null)
              }}
              disabled={passwordSubmitting}
            >
              Înapoi
            </Button>
            <Button onClick={handlePasswordVerify} disabled={!password || passwordSubmitting}>
              {passwordSubmitting ? "Verific..." : "Continuă"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kiosk logout dialog: password -> confirm */}
      <Dialog
        open={logoutOpen}
        onOpenChange={(open) => {
          if (!open) resetLogout()
          else setLogoutOpen(true)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">Deconectare Kiosk</DialogTitle>
            <DialogDescription className="text-center">
              {logoutStep === "password"
                ? "Introduce parola contului Kiosk pentru a continua."
                : "Ești sigur că vrei să te deconectezi?"}
            </DialogDescription>
          </DialogHeader>

          {logoutStep === "password" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Parolă</label>
              <Input
                type="password"
                value={logoutPassword}
                onChange={(e) => setLogoutPassword(e.target.value)}
                placeholder="Parola contului Kiosk"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogoutVerifyPassword()
                }}
                disabled={logoutSubmitting}
              />
              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={resetLogout} disabled={logoutSubmitting}>
                  Anulează
                </Button>
                <Button onClick={handleLogoutVerifyPassword} disabled={!logoutPassword || logoutSubmitting}>
                  {logoutSubmitting ? "Verific..." : "Continuă"}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setLogoutStep("password")
                  setLogoutPassword("")
                }}
                disabled={logoutSubmitting}
              >
                Înapoi
              </Button>
              <Button onClick={handleLogoutConfirm} disabled={logoutSubmitting}>
                {logoutSubmitting ? "Deconectez..." : "Da, deconectează"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
