"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import { sendPasswordResetEmail } from "firebase/auth"
import { auth } from "@/lib/firebase/config"

interface ForgotPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ForgotPasswordDialog({ open, onOpenChange }: ForgotPasswordDialogProps) {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Add close confirmation states
  const [showCloseAlert, setShowCloseAlert] = useState(false)

  // Function to check if form has unsaved changes
  const hasUnsavedChanges = () => {
    return email.trim() !== "" && !success
  }

  // Handle dialog close attempt
  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowCloseAlert(true)
    } else {
      handleDialogClose()
    }
  }

  // Actually close the dialog
  const handleDialogClose = () => {
    setEmail("")
    setError(null)
    setSuccess(null)
    onOpenChange(false)
  }

  // Confirm close with unsaved changes
  const confirmClose = () => {
    setShowCloseAlert(false)
    handleDialogClose()
  }

  // Cancel close
  const cancelClose = () => {
    setShowCloseAlert(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      setError("Vă rugăm să introduceți adresa de email")
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      setSuccess(null)

      await sendPasswordResetEmail(auth, email)

      setSuccess("Un email pentru resetarea parolei a fost trimis. Verificați căsuța de email.")

      // Reset form after 3 seconds and close dialog
      setTimeout(() => {
        setEmail("")
        onOpenChange(false)
      }, 3000)
    } catch (error: any) {
      console.error("Eroare la trimiterea emailului de resetare:", error)

      if (error.code === "auth/user-not-found") {
        setError("Nu există niciun cont asociat cu acest email")
      } else if (error.code === "auth/invalid-email") {
        setError("Adresa de email este invalidă")
      } else {
        setError("A apărut o eroare la trimiterea emailului de resetare")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(newOpen) => {
        if (!newOpen) {
          handleCloseAttempt()
        } else {
          onOpenChange(newOpen)
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Resetare parolă</DialogTitle>
            <DialogDescription>
              Introduceți adresa de email asociată contului dumneavoastră pentru a primi un link de resetare a parolei.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="mb-4 bg-green-50 border-green-200 text-green-800">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nume@companie.ro"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseAttempt} disabled={isLoading}>
                Anulează
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                  </>
                ) : (
                  "Trimite email de resetare"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Close confirmation alert */}
      <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmați închiderea</AlertDialogTitle>
            <AlertDialogDescription>
              Aveți modificări nesalvate. Sunteți sigur că doriți să închideți formularul? Toate modificările vor fi pierdute.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={cancelClose} className="w-full sm:w-auto">
              Nu, rămân în formular
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmClose} 
              className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
            >
              Da, închide formularul
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
