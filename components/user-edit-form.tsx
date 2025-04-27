"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { updateUserEmail } from "@/lib/firebase/auth"
import { Key } from "lucide-react"
import { PasswordResetDialog } from "./password-reset-dialog"
import { doc, updateDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"

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

export function UserEditForm({ user, onSuccess }: { user: any; onSuccess?: () => void }) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false)

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
        updatedAt: new Date(),
      })

      toast({
        title: "Utilizator actualizat",
        description: "Datele utilizatorului au fost actualizate cu succes.",
      })

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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
}
