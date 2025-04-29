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
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth"
import { auth } from "@/lib/firebase/config"

interface UserPasswordChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserPasswordChangeDialog({ open, onOpenChange }: UserPasswordChangeDialogProps) {
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setPasswordData((prev) => ({ ...prev, [id]: value }))
  }

  const toggleCurrentPasswordVisibility = () => setShowCurrentPassword(!showCurrentPassword)
  const toggleNewPasswordVisibility = () => setShowNewPassword(!showNewPassword)
  const toggleConfirmPasswordVisibility = () => setShowConfirmPassword(!showConfirmPassword)

  const resetForm = () => {
    setPasswordData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    })
    setError(null)
    setSuccess(null)
    setShowCurrentPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    const { currentPassword, newPassword, confirmPassword } = passwordData

    // Validare
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Toate câmpurile sunt obligatorii")
      setIsLoading(false)
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Parolele noi nu coincid")
      setIsLoading(false)
      return
    }

    if (newPassword.length < 6) {
      setError("Parola nouă trebuie să aibă cel puțin 6 caractere")
      setIsLoading(false)
      return
    }

    const user = auth.currentUser

    if (!user || !user.email) {
      setError("Nu sunteți autentificat sau lipsesc informații despre utilizator")
      setIsLoading(false)
      return
    }

    try {
      // Reautentificare utilizator
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)

      // Actualizare parolă
      await updatePassword(user, newPassword)

      setSuccess("Parola a fost actualizată cu succes")

      // Reset form after 2 seconds and close dialog
      setTimeout(() => {
        resetForm()
        onOpenChange(false)
      }, 2000)
    } catch (error: any) {
      console.error("Eroare la schimbarea parolei:", error)

      if (error.code === "auth/wrong-password") {
        setError("Parola curentă este incorectă")
      } else if (error.code === "auth/weak-password") {
        setError("Parola nouă este prea slabă. Folosiți cel puțin 6 caractere.")
      } else if (error.code === "auth/requires-recent-login") {
        setError("Sesiunea a expirat. Vă rugăm să vă reautentificați și să încercați din nou.")
      } else {
        setError("A apărut o eroare la actualizarea parolei")
      }
    } finally {
      setIsLoading(false)
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Schimbare parolă</DialogTitle>
          <DialogDescription>Introduceți parola curentă și noua parolă pentru a o actualiza.</DialogDescription>
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
              <label htmlFor="currentPassword" className="text-sm font-medium">
                Parola curentă
              </label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  placeholder="Introduceți parola curentă"
                  value={passwordData.currentPassword}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 text-gray-400 hover:text-gray-600"
                  onClick={toggleCurrentPasswordVisibility}
                  aria-label={showCurrentPassword ? "Ascunde parola" : "Arată parola"}
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

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
                  onChange={handleInputChange}
                  disabled={isLoading}
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
                Confirmare parolă nouă
              </label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirmați parola nouă"
                  value={passwordData.confirmPassword}
                  onChange={handleInputChange}
                  disabled={isLoading}
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Anulează
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
                </>
              ) : (
                "Schimbă parola"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
