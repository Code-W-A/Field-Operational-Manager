"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Play, Square, UserCircle2 } from "lucide-react"
import { FaceRecognitionCapture } from "./face-recognition-capture"
import { createCheckIn, createCheckOut, getActiveSession } from "@/lib/attendance/storage"
import { getCurrentLocation, determineMode } from "@/lib/attendance/location"
import { toast } from "@/hooks/use-toast"
import type { FaceRecognitionResult, AttendanceLocation } from "@/types/attendance"
import type { OfficeLocation } from "@/lib/firebase/auth"

export interface KioskUser {
  uid: string
  displayName: string
  role: string
}

export interface KioskCheckInProps {
  users: KioskUser[]
  officeLocation?: OfficeLocation
}

type FlowState = "idle" | "select-action" | "select-user" | "face-recognition" | "processing" | "success"

export function KioskCheckIn({ users, officeLocation }: KioskCheckInProps) {
  const [flowState, setFlowState] = useState<FlowState>("idle")
  const [action, setAction] = useState<"check-in" | "check-out" | null>(null)
  const [selectedUser, setSelectedUser] = useState<KioskUser | null>(null)
  const [showDialog, setShowDialog] = useState(false)

  // Auto-reset to idle after inactivity or success
  useEffect(() => {
    if (flowState === "success") {
      const timer = setTimeout(() => {
        resetFlow()
      }, 3000)
      return () => clearTimeout(timer)
    }

    if (flowState !== "idle" && flowState !== "success") {
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

  const resetFlow = () => {
    setFlowState("idle")
    setAction(null)
    setSelectedUser(null)
    setShowDialog(false)
  }

  const handleActionSelect = (selectedAction: "check-in" | "check-out") => {
    setAction(selectedAction)
    setFlowState("select-user")
  }

  const handleUserSelect = (user: KioskUser) => {
    setSelectedUser(user)
    setShowDialog(true)
    setFlowState("face-recognition")
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
        })

        toast({
          title: "Check-In Reușit!",
          description: `Bun venit, ${selectedUser.displayName}!`,
        })
      } else {
        // For check-out, get the active session
        const activeSession = await getActiveSession(selectedUser.uid)

        if (!activeSession) {
          throw new Error("Nu există o sesiune activă pentru acest utilizator")
        }

        await createCheckOut({
          sessionId: activeSession.id,
          location,
          faceRecognitionId: result.faceId,
        })

        toast({
          title: "Check-Out Reușit!",
          description: `La revedere, ${selectedUser.displayName}!`,
        })
      }

      setFlowState("success")
    } catch (error) {
      console.error("Kiosk check-in/out error:", error)
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "A apărut o eroare",
        variant: "destructive",
      })
      setFlowState("idle")
      setShowDialog(false)
    }
  }

  const handleFaceRecognitionError = (error: string) => {
    // The component will auto-retry, just log
    console.log("Face recognition attempt failed:", error)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        {/* Idle State - Show Action Selection */}
        {flowState === "idle" && (
          <div className="text-center space-y-8 animate-in fade-in duration-500">
            <div className="space-y-4">
              <h1 className="text-5xl font-bold text-white">
                Sistem Pontaj
              </h1>
              <p className="text-xl text-slate-300">
                Apasă pentru a începe
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-6 mt-12">
              <button
                onClick={() => handleActionSelect("check-in")}
                className="group relative p-12 bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 rounded-3xl shadow-2xl hover:shadow-emerald-500/50 transition-all duration-300 hover:scale-105"
              >
                <div className="flex flex-col items-center gap-6">
                  <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors backdrop-blur-sm">
                    <Play className="w-12 h-12 text-white" />
                  </div>
                  <div className="text-3xl font-bold text-white">
                    Start
                  </div>
                  <div className="text-lg text-emerald-100">
                    Check-In
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleActionSelect("check-out")}
                className="group relative p-12 bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-3xl shadow-2xl hover:shadow-orange-500/50 transition-all duration-300 hover:scale-105"
              >
                <div className="flex flex-col items-center gap-6">
                  <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors backdrop-blur-sm">
                    <Square className="w-12 h-12 text-white" />
                  </div>
                  <div className="text-3xl font-bold text-white">
                    Stop
                  </div>
                  <div className="text-lg text-orange-100">
                    Check-Out
                  </div>
                </div>
              </button>
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
                    className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 rounded-2xl transition-all hover:scale-105 shadow-md hover:shadow-lg"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-slate-500 flex items-center justify-center shadow-md">
                        <UserCircle2 className="w-10 h-10 text-white" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-gray-900">
                          {user.displayName}
                        </div>
                        <div className="text-xs text-gray-600 capitalize">
                          {user.role}
                        </div>
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

      {/* Face Recognition Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => {
        if (!open) {
          resetFlow()
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              Recunoaștere Facială
            </DialogTitle>
          </DialogHeader>
          
          {selectedUser && (
            <div className="text-center mb-4">
              <p className="text-lg text-muted-foreground">
                Pentru: <span className="font-semibold text-foreground">{selectedUser.displayName}</span>
              </p>
            </div>
          )}

          {flowState === "face-recognition" && (
            <FaceRecognitionCapture
              onSuccess={handleFaceRecognitionSuccess}
              onError={handleFaceRecognitionError}
              userId={selectedUser?.uid}
              userName={selectedUser?.displayName}
              autoStart={true}
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
    </div>
  )
}
