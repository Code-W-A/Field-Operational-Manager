"use client"

import { useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useRouter } from "next/navigation"
import { LogOut, User, LockKeyhole } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { signOut } from "@/lib/firebase/auth"
import { UserPasswordChangeDialog } from "@/components/user-password-change-dialog"

export function UserNav() {
  const router = useRouter()
  const { user, userData } = useAuth()
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push("/login")
    } catch (error) {
      console.error("Eroare la deconectare:", error)
    }
  }

  // Formatează data pentru afișare
  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      const year = date.getFullYear()
      const hour = date.getHours().toString().padStart(2, "0")
      const minute = date.getMinutes().toString().padStart(2, "0")
      
      return `${day}.${month}.${year} ${hour}:${minute}`
    } catch (err) {
      console.error("Eroare la formatarea datei:", err)
      return "N/A"
    }
  }

  // Obține textul pentru rol
  const getRoleText = (role: string | undefined) => {
    switch (role) {
      case "admin":
        return "Administrator"
      case "dispecer":
        return "Dispecer"
      case "tehnician":
        return "Tehnician"
      default:
        return "Utilizator"
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 flex items-center gap-2 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src="/placeholder-user.jpg" alt="@user" />
              <AvatarFallback>{userData?.displayName?.charAt(0) || "U"}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{userData?.displayName || "Utilizator"}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" alignOffset={-10} forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{userData?.displayName || "Utilizator"}</p>
              <p className="text-xs leading-none text-muted-foreground">{userData?.email || ""}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
              <User className="mr-2 h-4 w-4" />
              <span>Profil</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsPasswordChangeOpen(true)}>
              <LockKeyhole className="mr-2 h-4 w-4" />
              <span>Schimbare parolă</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Deconectare</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog pentru afișarea profilului utilizatorului */}
      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Profil Utilizator</DialogTitle>
            <DialogDescription>Informații despre contul dumneavoastră</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex justify-center">
              <Avatar className="h-20 w-20">
                <AvatarImage src="/placeholder-user.jpg" alt="@user" />
                <AvatarFallback className="text-xl">{userData?.displayName?.substring(0, 2) || "U"}</AvatarFallback>
              </Avatar>
            </div>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Nume complet</h3>
                  <p className="text-base">{userData?.displayName || "N/A"}</p>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
                  <p className="text-base">{userData?.email || "N/A"}</p>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Rol</h3>
                  <p className="text-base">{getRoleText(userData?.role)}</p>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Telefon</h3>
                  <p className="text-base">{userData?.telefon || "N/A"}</p>
                </div>
                <Separator />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Ultima autentificare</h3>
                  <p className="text-base">{formatDate(userData?.lastLogin)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pentru schimbarea parolei */}
      <UserPasswordChangeDialog open={isPasswordChangeOpen} onOpenChange={setIsPasswordChangeOpen} />
    </>
  )
}
