"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { LockKeyhole, User, AlertCircle, Eye, EyeOff } from "lucide-react"
import { signIn } from "@/lib/firebase/auth"
import { useAuth } from "@/contexts/AuthContext"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useMockData } from "@/contexts/MockDataContext"
import { ForgotPasswordDialog } from "@/components/forgot-password-dialog"

export default function Login() {
  const router = useRouter()
  const { user, userData, loading } = useAuth()
  const { isPreview, users, setCurrentUser } = useMockData()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      // Redirect by role
      if (userData?.role === "client") {
        router.push("/portal")
      } else if (userData?.role === "tehnician") {
        router.push("/dashboard/lucrari")
      } else {
        router.push("/dashboard")
      }
    }
  }, [user, userData, loading, router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      setError("Vă rugăm să completați toate câmpurile")
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Dacă suntem în mediul de preview, simulăm autentificarea
      if (isPreview) {
        // Simulăm un timp de încărcare
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Căutăm utilizatorul după email
        const mockUser = users.find((u) => u.email === email)
        if (mockUser && (password === "password" || password === "123456")) {
          setCurrentUser(mockUser)
          // Redirect by role
          if (mockUser.role === "client") {
            router.push("/portal")
          } else if (mockUser.role === "tehnician") {
            router.push("/dashboard/lucrari")
          } else {
            router.push("/dashboard")
          }
        } else {
          setError("Email sau parolă incorectă")
        }
      } else {
        // Altfel, utilizăm Firebase Auth
        await signIn(email, password)
        // The redirection will be handled by the useEffect above
      }
    } catch (error: any) {
      console.error("Eroare la autentificare:", error)

      if (error.code === "auth/invalid-credential") {
        setError("Email sau parolă incorectă")
      } else if (error.code === "auth/user-not-found") {
        setError("Utilizatorul nu există")
      } else if (error.code === "auth/wrong-password") {
        setError("Parolă incorectă")
      } else {
        setError("A apărut o eroare la autentificare. Încercați din nou.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto"></div>
          <p className="mt-4 text-gray-600">Se încarcă...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-blue-700">Autentificare</CardTitle>
          <CardDescription>Introduceți datele de autentificare pentru a continua</CardDescription>
          {isPreview && (
            <Alert className="mt-2 bg-blue-50 border-blue-200 text-blue-800">
              <AlertDescription>
                În modul preview, puteți utiliza următoarele credențiale:
                <ul className="mt-2 list-disc list-inside">
                  <li>Email: admin@example.com, Parolă: password</li>
                  <li>Email: dispecer@example.com, Parolă: password</li>
                  <li>Email: tehnician@example.com, Parolă: password</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="nume@companie.ro"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Parolă</Label>
              <div className="relative">
                <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                  aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
                  title={showPassword ? "Ascunde parola" : "Arată parola"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
              {isLoading ? (
                <>
                  <span className="animate-spin mr-2">&#9696;</span>
                  Se procesează...
                </>
              ) : (
                "Autentificare"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-gray-500">
            Ați uitat parola?{" "}
            <Button variant="link" className="p-0 h-auto text-blue-600" onClick={() => setForgotPasswordOpen(true)}>
              Resetați parola
            </Button>
          </p>
        </CardFooter>
      </Card>
      <ForgotPasswordDialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen} />
    </div>
  )
}
