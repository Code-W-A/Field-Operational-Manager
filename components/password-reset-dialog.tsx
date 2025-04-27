"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Eye, EyeOff } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { UserData } from "@/lib/firebase/auth"
import { updateUserPassword } from "@/lib/firebase/password-update"

interface PasswordResetDialogProps {
  user: UserData
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function PasswordResetDialog({ user, open, onOpenChange, onSuccess }: PasswordResetDialogProps) {
  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const handlePasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setPasswordData((prev) => ({ ...prev, [id]: value }))
  }

  const toggleNewPasswordVisibility = () => setShowNewPassword(!showNewPassword)
  const toggleConfirmPasswordVisibility = () => setShowConfirmPassword(!showConfirmPassword)

  const resetForm = () => {
    setPasswordData({
      newPassword: "",
      confirmPassword: "",
    })
    setPasswordError(null)
    setPasswordSuccess(null)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  const handlePasswordReset = async () => {
    setIsResettingPassword(true)
    setPasswordError(null)
    setPasswordSuccess(null)

    // Validare parole - verificăm doar dacă coincid
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("Parolele nu coincid")
      setIsResettingPassword(false)
      return
    }

    // Verificăm doar dacă parola nu este goală
    if (!passwordData.newPassword) {
      setPasswordError("Parola nu poate fi goală")
      setIsResettingPassword(false)
      return
    }

    if (!user.uid) {
      setPasswordError("ID-ul utilizatorului lipsește")
      setIsResettingPassword(false)
      return
    }

    try {
      console.log("Starting password reset for user:", user.uid)

      // Folosim funcția actualizată pentru resetarea parolei
      const result = await updateUserPassword(user.uid, passwordData.newPassword)

      console.log("Password reset result:", result)

      // Resetăm câmpurile de parolă
      resetForm()

      setPasswordSuccess(result.message)

      // Închide dialogul după 2 secunde
      setTimeout(() => {
        onOpenChange(false)
        if (onSuccess) {
          onSuccess()
        }
      }, 2000)
    } catch (err: any) {
      console.error("Eroare la actualizarea parolei:", err)
      setPasswordError(err.message || "A apărut o eroare la actualizarea parolei")
    } finally {
      setIsResettingPassword(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) {
          resetForm()
        }
        onOpenChange(newOpen)
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Resetare parolă</DialogTitle>
          <DialogDescription>Introduceți noua parolă pentru utilizatorul {user.displayName}</DialogDescription>
        </DialogHeader>

        {passwordError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{passwordError}</AlertDescription>
          </Alert>
        )}

        {passwordSuccess && (
          <Alert className="bg-green-50 border-green-200 text-green-800">
            <AlertDescription>{passwordSuccess}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label htmlFor="newPassword" className="text-sm font-medium">
              Parolă nouă
            </label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                placeholder="Introduceți parola nouă"
                value={passwordData.newPassword}
                onChange={handlePasswordInputChange}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 py-2 text-gray-400 hover:text-gray-600"
                onClick={toggleNewPasswordVisibility}
                aria-label={showNewPassword ? "Ascunde parola" : "Arată parola"}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirmare parolă
            </label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirmați parola nouă"
                value={passwordData.confirmPassword}
                onChange={handlePasswordInputChange}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3 py-2 text-gray-400 hover:text-gray-600"
                onClick={toggleConfirmPasswordVisibility}
                aria-label={showConfirmPassword ? "Ascunde parola" : "Arată parola"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Anulează
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handlePasswordReset}
            disabled={isResettingPassword}
          >
            {isResettingPassword ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
              </>
            ) : (
              "Resetează parola"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
