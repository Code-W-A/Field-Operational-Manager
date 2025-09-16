"use client"

import { useState, useEffect, forwardRef, useImperativeHandle } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { updateUserEmail } from "@/lib/firebase/auth"
import { Key, ChevronsUpDown, Check } from "lucide-react"
import { PasswordResetDialog } from "./password-reset-dialog"
import { doc, updateDoc, collection, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"

// Schema de validare pentru formular
const formSchema = z.object({
  displayName: z.string().min(2, {
    message: "Numele trebuie să aibă cel puțin 2 caractere.",
  }),
  email: z.string().email({
    message: "Vă rugăm să introduceți o adresă de email validă.",
  }),
  role: z.string(),
  phoneNumber: z.string().optional(),
  notes: z.string().optional(),
})

interface UserEditFormProps {
  user: any
  onSuccess?: () => void
  onCancel?: () => void
}

const UserEditForm = forwardRef(({ user, onSuccess, onCancel }: UserEditFormProps, ref: any) => {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false)
  const [formModified, setFormModified] = useState(false)
  const [clientsForSelect, setClientsForSelect] = useState<Array<{ id: string; nume: string; locatii?: any[]; email?: string }>>([])
  const [isClientPickerOpen, setIsClientPickerOpen] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string>(user?.clientId || "")
  const [selectedClientLocations, setSelectedClientLocations] = useState<string[]>(Array.isArray(user?.allowedLocationNames) ? (user.allowedLocationNames as string[]) : [])
  const [sendInvite, setSendInvite] = useState<boolean>(false)
  const [inviteRecipients, setInviteRecipients] = useState<string[]>([])

  const sortedClientsForSelect = [...clientsForSelect].sort((a, b) => (a.nume || "").localeCompare(b.nume || "", "ro", { sensitivity: "base" }))

  useImperativeHandle(ref, () => ({
    hasUnsavedChanges: () => formModified,
  }))

  useEffect(() => {
    const handleFormChange = () => {
      setFormModified(true)
    }

    const formElements = document.querySelectorAll("input, textarea, select")
    formElements.forEach((element) => {
      element.addEventListener("change", handleFormChange)
      element.addEventListener("input", handleFormChange)
    })

    return () => {
      formElements.forEach((element) => {
        element.removeEventListener("change", handleFormChange)
        element.removeEventListener("input", handleFormChange)
      })
    }
  }, [])

  // Inițializăm formularul cu valorile utilizatorului
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: user.displayName || "",
      email: user.email || "",
      role: user.role || "tehnician",
      phoneNumber: user.phoneNumber || "",
      notes: user.notes || "",
    },
  })

  // Load clients for client users
  useEffect(() => {
    const loadClients = async () => {
      try {
        const snap = await getDocs(collection(db, "clienti"))
        const list: Array<{ id: string; nume: string; locatii?: any[]; email?: string }> = []
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }))
        setClientsForSelect(list)
      } catch (e) {
        console.warn("Nu s-au putut încărca clienții pentru editare utilizator:", e)
      }
    }
    loadClients()
  }, [])

  // Recalculează destinatarii invitației pentru rol client
  useEffect(() => {
    const currentRole = form.getValues("role")
    const email = (form.getValues("email") || "").trim()
    if (currentRole !== "client") {
      setInviteRecipients([])
      return
    }
    const recipients = new Set<string>()
    const isValid = (e?: string) => !!e && /.+@.+\..+/.test(e)
    if (isValid(email)) recipients.add(email)
    const client = clientsForSelect.find((c) => c.id === selectedClientId)
    if (isValid(client?.email)) recipients.add(client!.email!)
    const selectedLocs = (client?.locatii || []).filter((l: any) => selectedClientLocations.includes(l?.nume))
    selectedLocs.forEach((l: any) => {
      ;(l?.persoaneContact || []).forEach((p: any) => {
        if (isValid(p?.email)) recipients.add(p.email)
      })
    })
    setInviteRecipients(Array.from(recipients))
  }, [clientsForSelect, selectedClientId, selectedClientLocations, form])

  // Trimitere invitație imediat
  const handleSendInviteNow = async () => {
    try {
      const role = form.getValues("role")
      if (role !== "client") {
        toast({ variant: "destructive", title: "Invitație indisponibilă", description: "Invitația se aplică doar pentru rolul Client." })
        return
      }
      if (!inviteRecipients.length) {
        toast({ variant: "destructive", title: "Nu există destinatari valizi", description: "Verificați email-ul utilizatorului și al clientului/locațiilor." })
        return
      }
      const origin = typeof window !== "undefined" ? window.location.origin : ""
      const email = form.getValues("email")
      const subject = "Invitație acces Portal Client – FOM"
      const content = `Bună ziua,\n\nV-am activat/actualizat accesul în Portalul Client FOM.\n\nEmail: ${email}\nPortal: ${origin}/portal\n\nDupă autentificare, vă rugăm să schimbați parola din cont (dacă a fost resetată).\n\nVă mulțumim!`
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2 style="margin:0 0 12px;color:#0f56b3">Invitație acces Portal Client – FOM</h2>
          <p>V-am activat/actualizat accesul în Portalul Client FOM.</p>
          <p><strong>Email:</strong> ${email}<br/>
             <strong>Portal:</strong> <a href="${origin}/portal" target="_blank">${origin}/portal</a></p>
          <p>După autentificare, vă rugăm să schimbați parola din cont (dacă a fost resetată).</p>
          <p>Vă mulțumim!</p>
        </div>`
      const resp = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: inviteRecipients, subject, content, html }),
      })
      if (!resp.ok) throw new Error("Invite email failed")
      toast({ title: "Invitație trimisă", description: `Email trimis către: ${inviteRecipients.join(", ")}` })
    } catch (e) {
      console.warn("Trimitere invitație eșuată:", e)
      toast({ variant: "destructive", title: "Invitație eșuată", description: "Nu s-a putut trimite emailul de invitație." })
    }
  }

  // Funcția pentru trimiterea formularului
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true)

    try {
      // Verificăm dacă emailul s-a schimbat
      if (values.email !== user.email) {
        await updateUserEmail(user.uid, values.email)
      }

      // Actualizăm datele utilizatorului în Firestore
      // Acest cod ar trebui să fie adaptat la structura aplicației tale
      const userRef = doc(db, "users", user.uid)
      await updateDoc(userRef, {
        displayName: values.displayName,
        email: values.email,
        role: values.role,
        phoneNumber: values.phoneNumber || "",
        notes: values.notes || "",
        clientId: values.role === "client" ? (selectedClientId || null) : null,
        allowedLocationNames: values.role === "client" ? selectedClientLocations : null,
        updatedAt: new Date(),
      })

      // Trimitere invitație după salvare, dacă s-a bifat
      if (values.role === "client" && sendInvite) {
        if (!inviteRecipients.length) {
          toast({ variant: "destructive", title: "Nu există destinatari valizi", description: "Verificați email-ul utilizatorului și al clientului/locațiilor." })
        } else {
          const origin = typeof window !== "undefined" ? window.location.origin : ""
          const subject = "Invitație acces Portal Client – FOM"
          const content = `Bună ziua,\n\nV-am activat/actualizat accesul în Portalul Client FOM.\n\nEmail: ${values.email}\nPortal: ${origin}/portal\n\nDupă autentificare, vă rugăm să schimbați parola din cont (dacă a fost resetată).\n\nVă mulțumim!`
          const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5">
              <h2 style="margin:0 0 12px;color:#0f56b3">Invitație acces Portal Client – FOM</h2>
              <p>V-am activat/actualizat accesul în Portalul Client FOM.</p>
              <p><strong>Email:</strong> ${values.email}<br/>
                 <strong>Portal:</strong> <a href="${origin}/portal" target="_blank">${origin}/portal</a></p>
              <p>După autentificare, vă rugăm să schimbați parola din cont (dacă a fost resetată).</p>
              <p>Vă mulțumim!</p>
            </div>`
          const resp = await fetch("/api/users/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: inviteRecipients, subject, content, html }),
          })
          if (!resp.ok) throw new Error("Invite email failed")
          toast({ title: "Invitație trimisă", description: `Email trimis către: ${inviteRecipients.join(", ")}` })
        }
      }

      toast({
        title: "Utilizator actualizat",
        description: "Datele utilizatorului au fost actualizate cu succes.",
      })

      setFormModified(false) // Reset form modified state after successful submission
      if (onSuccess) {
        onSuccess()
      }
    } catch (error: any) {
      console.error("Eroare la actualizarea utilizatorului:", error)
      toast({
        variant: "destructive",
        title: "Eroare",
        description: error.message || "A apărut o eroare la actualizarea utilizatorului.",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className={`py-0 ${form.watch("role") === "client" ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : "grid gap-6"}`}>
          {/* Coloana stângă - informații de bază */}
          <div className="space-y-6">
          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nume complet</FormLabel>
                <FormControl>
                  <Input placeholder="Nume complet" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rol</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selectați un rol" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="admin">Administrator</SelectItem>
                    <SelectItem value="dispecer">Dispecer</SelectItem>
                    <SelectItem value="tehnician">Tehnician</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Număr de telefon</FormLabel>
                <FormControl>
                  <Input placeholder="Număr de telefon" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Note</FormLabel>
                <FormControl>
                  <Textarea placeholder="Note despre utilizator" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col sm:flex-row gap-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Se salvează..." : "Salvează modificările"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPasswordResetOpen(true)}
              className="flex items-center gap-2"
            >
              <Key className="h-4 w-4" />
              Resetare parolă
            </Button>
          </div>
          </div>

          {/* Coloana dreaptă - zona client (doar pentru rol client) */}
          {form.watch("role") === "client" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <FormLabel>Client asociat</FormLabel>
                <Popover open={isClientPickerOpen} onOpenChange={setIsClientPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={isClientPickerOpen} className="w-full justify-between">
                      {selectedClientId ? (sortedClientsForSelect.find((c) => c.id === selectedClientId)?.nume || "Selectați clientul") : "Selectați clientul"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-w-[90vw]">
                    <Command shouldFilter={true}>
                      <CommandInput placeholder="Căutați clientul..." />
                      <CommandEmpty>Nu s-au găsit clienți.</CommandEmpty>
                      <CommandList className="max-h-[240px] overflow-y-auto overflow-x-auto whitespace-nowrap">
                        <CommandGroup>
                          {sortedClientsForSelect.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={`${c.nume}__${c.id}`}
                              onSelect={() => {
                                setSelectedClientId(c.id)
                                setSelectedClientLocations([])
                                setIsClientPickerOpen(false)
                              }}
                              className="whitespace-nowrap"
                            >
                              <Check className={`mr-2 h-4 w-4 ${selectedClientId === c.id ? "opacity-100" : "opacity-0"}`} />
                              <span className="inline-block min-w-max">{c.nume}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {selectedClientId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FormLabel>Locații permise</FormLabel>
                    <Badge variant="secondary">{selectedClientLocations.length}</Badge>
                  </div>
                  <div className="max-h-48 overflow-auto rounded border p-2 space-y-1">
                    {(sortedClientsForSelect
                      .find((c) => c.id === selectedClientId)?.locatii || [])
                      .slice()
                      .sort((a: any, b: any) => (a?.nume || "").localeCompare(b?.nume || "", "ro", { sensitivity: "base" }))
                      .map((l: any, idx: number) => (
                        <label key={idx} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedClientLocations.includes(l.nume)}
                            onChange={() => setSelectedClientLocations((prev) => prev.includes(l.nume) ? prev.filter((n) => n !== l.nume) : [...prev, l.nume])}
                          />
                          <span>{l.nume}</span>
                        </label>
                      ))}
                    {!(sortedClientsForSelect.find((c) => c.id === selectedClientId)?.locatii?.length) && (
                      <div className="text-sm text-muted-foreground">Clientul nu are locații definite</div>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground mt-2">
                    Emailul de invitație se va trimite către: {inviteRecipients.length ? inviteRecipients.join(", ") : "—"}
                  </div>
                  <label className="flex items-center gap-2 text-sm mt-2">
                    <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
                    <span>Trimite invitație pe email după salvare</span>
                  </label>
                  <div className="flex gap-2 mt-2">
                    <Button type="button" variant="outline" onClick={handleSendInviteNow}>
                      Trimite invitație acum
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </Form>

      <PasswordResetDialog
        user={user}
        open={isPasswordResetOpen}
        onOpenChange={setIsPasswordResetOpen}
        onSuccess={() => {
          toast({
            title: "Parolă resetată",
            description: "Parola utilizatorului a fost resetată cu succes.",
          })
        }}
      />
    </div>
  )
})

export { UserEditForm }
