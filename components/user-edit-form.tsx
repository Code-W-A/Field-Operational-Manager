"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, KeyRound } from "lucide-react"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type { UserData, UserRole } from "@/lib/firebase/auth"
import { updateUserEmail } from "@/lib/firebase/auth"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface UserEditFormProps {
  user: UserData
  onSuccess?: () => void
  onCancel?: () => void
}

export function UserEditForm({ user, onSuccess, onCancel }: UserEditFormProps) {
  // Modificăm starea formData pentru a include email-ul
  const [formData, setFormData] = useState({
    displayName: user.displayName || "",
    email: user.email || "",
    telefon: user.telefon || "",
    role: user.role || ("tehnician" as UserRole),
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [emailChanged, setEmailChanged] = useState(false)
  const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false)
  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  })
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target

    // Verificăm dacă email-ul a fost modificat
    if (id === "email" && value !== user.email) {
      setEmailChanged(true)
    } else if (id === "email" && value === user.email) {
      setEmailChanged(false)
    }

    setFormData((prev) => ({ ...prev, [id]: value }))
  }

  const handlePasswordInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target
    setPasswordData((prev) => ({ ...prev, [id]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, role: value as UserRole }))
  }

  // Validare email
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Validare parolă
  const validatePassword = (password: string): boolean => {
    // Minim 8 caractere, cel puțin o literă și un număr
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/
    return passwordRegex.test(password)
  }

  // Modificăm funcția handleSubmit pentru a actualiza și email-ul
  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)

    // Resetăm erorile de câmp
    const errors: string[] = []

    // Verificăm câmpurile obligatorii
    if (!formData.displayName) errors.push("displayName")
    if (!formData.email) errors.push("email")

    // Validăm formatul email-ului
    if (formData.email && !validateEmail(formData.email)) {
      errors.push("email")
      setError("Adresa de email nu este validă")
      setIsSubmitting(false)
      setFieldErrors(errors)
      return
    }

    setFieldErrors(errors)

    if (errors.length > 0) {
      setError("Vă rugăm să completați toate câmpurile obligatorii")
      setIsSubmitting(false)
      return
    }

    if (!user.uid) {
      setError("ID-ul utilizatorului lipsește")
      setIsSubmitting(false)
      return
    }

    try {
      // Verificăm dacă email-ul a fost modificat
      const emailWasChanged = formData.email !== user.email

      // Actualizăm documentul utilizatorului în Firestore pentru câmpurile care nu sunt email
      const userRef = doc(db, "users", user.uid)
      await updateDoc(userRef, {
        displayName: formData.displayName,
        telefon: formData.telefon,
        role: formData.role,
        updatedAt: new Date(),
      })

      // Dacă email-ul a fost modificat, îl actualizăm separat
      if (emailWasChanged) {
        await updateUserEmail(user.uid, formData.email)
      }

      // Notificăm componenta părinte despre succesul actualizării
      if (onSuccess) {
        onSuccess()
      }
    } catch (err: any) {
      console.error("Eroare la actualizarea utilizatorului:", err)

      // Gestionăm erorile specifice
      if (err.message && err.message.includes("email este deja utilizat")) {
        setError("Acest email este deja utilizat de alt cont")
      } else {
        setError("A apărut o eroare la actualizarea utilizatorului. Încercați din nou.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePasswordReset = async () => {
    setIsResettingPassword(true)
    setPasswordError(null)
    setPasswordSuccess(null)

    // Validare parole
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError("Parolele nu coincid")
      setIsResettingPassword(false)
      return
    }

    if (!validatePassword(passwordData.newPassword)) {
      setPasswordError("Parola trebuie să aibă minim 8 caractere, cel puțin o literă și un număr")
      setIsResettingPassword(false)
      return
    }

    if (!user.uid) {
      setPasswordError("ID-ul utilizatorului lipsește")
      setIsResettingPassword(false)
      return
    }

    try {
      // Apelăm API-ul pentru a actualiza parola
      const response = await fetch("/api/users/update-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          newPassword: passwordData.newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "A apărut o eroare la actualizarea parolei")
      }

      // Resetăm câmpurile de parolă
      setPasswordData({
        newPassword: "",
        confirmPassword: "",
      })

      setPasswordSuccess("Parola a fost actualizată cu succes")

      // Închide dialogul după 2 secunde
      setTimeout(() => {
        setIsPasswordResetOpen(false)
        setPasswordSuccess(null)
      }, 2000)
    } catch (err: any) {
      console.error("Eroare la actualizarea parolei:", err)
      setPasswordError(err.message || "A apărut o eroare la actualizarea parolei")
    } finally {
      setIsResettingPassword(false)
    }
  }

  // Verificăm dacă un câmp are eroare
  const hasError = (fieldName: string) => fieldErrors.includes(fieldName)

  // Stilul pentru câmpurile cu eroare
  const errorStyle = "border-red-500 focus-visible:ring-red-500"

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <label htmlFor="displayName" className="text-sm font-medium">
          Nume Complet *
        </label>
        <Input
          id="displayName"
          placeholder="Introduceți numele complet"
          value={formData.displayName}
          onChange={handleInputChange}
          className={hasError("displayName") ? errorStyle : ""}
        />
      </div>

      {/* Modificăm secțiunea de email din formular pentru a permite editarea */}
      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          Email *
        </label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={handleInputChange}
          className={hasError("email") ? errorStyle : ""}
        />
        {emailChanged && (
          <p className="text-xs text-amber-600">
            Atenție: Schimbarea email-ului va necesita ca utilizatorul să se autentifice cu noul email.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="telefon" className="text-sm font-medium">
          Telefon
        </label>
        <Input id="telefon" placeholder="Număr de telefon" value={formData.telefon} onChange={handleInputChange} />
      </div>

      <div className="space-y-2">
        <label htmlFor="role" className="text-sm font-medium">
          Rol *
        </label>
        <Select value={formData.role} onValueChange={handleSelectChange}>
          <SelectTrigger id="role" className={hasError("role") ? errorStyle : ""}>
            <SelectValue placeholder="Selectați rolul" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Administrator</SelectItem>
            <SelectItem value="dispecer">Dispecer</SelectItem>
            <SelectItem value="tehnician">Tehnician</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={() => setIsPasswordResetOpen(true)} className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Resetare parolă
        </Button>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={onCancel}>
            Anulează
          </Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se procesează...
              </>
            ) : (
              "Salvează"
            )}
          </Button>
        </div>
      </div>

      {/* Dialog pentru resetarea parolei */}
      <Dialog open={isPasswordResetOpen} onOpenChange={setIsPasswordResetOpen}>
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
              <Input
                id="newPassword"
                type="password"
                placeholder="Introduceți parola nouă"
                value={passwordData.newPassword}
                onChange={handlePasswordInputChange}
              />
              <p className="text-xs text-muted-foreground">
                Parola trebuie să aibă minim 8 caractere, cel puțin o literă și un număr.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirmare parolă
              </label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirmați parola nouă"
                value={passwordData.confirmPassword}
                onChange={handlePasswordInputChange}
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsPasswordResetOpen(false)}>
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
    </div>
  )
}
