"use client"

import type React from "react"

import { useState, forwardRef, useImperativeHandle, useRef, useEffect } from "react"
import { addDoc, collection } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog"

interface ClientFormProps {
  onSuccess: () => void
  onCancel: () => void
}

export const ClientForm = forwardRef<{ hasUnsavedChanges: () => boolean }, ClientFormProps>(function ClientForm(
  { onSuccess, onCancel },
  ref,
) {
  const [companyName, setCompanyName] = useState("")
  const [cui, setCui] = useState("")
  const [address, setAddress] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [contactPerson, setContactPerson] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formModified, setFormModified] = useState(false)

  // Use the unsaved changes hook
  const { showDialog, handleNavigation, confirmNavigation, cancelNavigation, pendingUrl } =
    useUnsavedChanges(formModified)

  // Track initial form state
  const initialFormState = useRef({ companyName, cui, address, email, phone, contactPerson })

  useEffect(() => {
    // Save initial state when component mounts
    initialFormState.current = { companyName, cui, address, email, phone, contactPerson }
  }, [])

  // Check if any field has been modified
  useEffect(() => {
    if (
      companyName !== initialFormState.current.companyName ||
      cui !== initialFormState.current.cui ||
      address !== initialFormState.current.address ||
      email !== initialFormState.current.email ||
      phone !== initialFormState.current.phone ||
      contactPerson !== initialFormState.current.contactPerson
    ) {
      setFormModified(true)
    } else {
      setFormModified(false)
    }
  }, [companyName, cui, address, email, phone, contactPerson])

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => formModified,
  }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!companyName) {
      toast.error("Numele companiei este obligatoriu")
      return
    }

    setIsSubmitting(true)

    try {
      await addDoc(collection(db, "clients"), {
        companyName,
        cui,
        address,
        email,
        phone,
        contactPerson,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      toast.success("Client adăugat cu succes")
      setFormModified(false)
      onSuccess()
    } catch (error) {
      console.error("Error adding client:", error)
      toast.error("Eroare la adăugarea clientului")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle cancel with confirmation if form is modified
  const handleCancel = () => {
    if (formModified) {
      // Show confirmation dialog
      handleNavigation("#cancel")
    } else if (onCancel) {
      onCancel()
    }
  }

  // Confirm cancel action
  const confirmCancel = () => {
    if (onCancel) {
      onCancel()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="companyName">Nume Companie *</Label>
          <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cui">CIF / CUI</Label>
          <Input id="cui" value={cui} onChange={(e) => setCui(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Adresă Sediu</Label>
          <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Telefon</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contactPerson">Persoană Contact</Label>
          <Input id="contactPerson" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={handleCancel}>
          Anulează
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner className="mr-2" /> : null}
          Salvează
        </Button>
      </div>

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        open={showDialog}
        onConfirm={pendingUrl === "#cancel" ? confirmCancel : confirmNavigation}
        onCancel={cancelNavigation}
      />
    </form>
  )
})

ClientForm.displayName = "ClientForm"
