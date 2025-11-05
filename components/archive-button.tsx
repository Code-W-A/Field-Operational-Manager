"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Archive } from "lucide-react"
import { updateLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { WORK_STATUS } from "@/lib/utils/constants"
import { useAuth } from "@/contexts/AuthContext"
import { serverTimestamp } from "firebase/firestore"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { canArchiveLucrare } from "@/lib/utils/archive-validation"

interface ArchiveButtonProps {
  lucrareId: string
  lucrareStatus: string
  lucrareData?: any // Adăugăm datele complete ale lucrării pentru validare
  size?: "sm" | "default" | "lg"
  variant?: "default" | "outline" | "ghost"
  showLabel?: boolean
  onSuccess?: () => void
  className?: string
}

export function ArchiveButton({
  lucrareId,
  lucrareStatus,
  lucrareData,
  size = "sm",
  variant = "outline",
  showLabel = false,
  onSuccess,
  className = ""
}: ArchiveButtonProps) {
  const { userData } = useAuth()
  const [isArchiving, setIsArchiving] = useState(false)

  // Doar lucrările finalizate pot fi arhivate
  if (lucrareStatus !== WORK_STATUS.COMPLETED) {
    return null
  }

  // Verificăm regulile de arhivare
  const archiveValidation = lucrareData ? canArchiveLucrare(lucrareData) : { canArchive: true }
  const canArchive = archiveValidation.canArchive
  const archiveReason = archiveValidation.reason || "Arhivează lucrarea finalizată"

  const handleArchive = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!canArchive) {
      return
    }

    const confirmMessage = "Sigur doriți să arhivați această lucrare? Lucrarea va fi mutată în secțiunea Arhivate."
    
    if (!window.confirm(confirmMessage)) {
      return
    }

    setIsArchiving(true)
    try {
      // Setăm statusul de arhivare împreună cu data și utilizatorul care a arhivat
      await updateLucrare(lucrareId, { 
        statusLucrare: WORK_STATUS.ARCHIVED,
        archivedAt: serverTimestamp() as any, // Firestore va converti automat la Timestamp
        archivedBy: userData?.displayName || userData?.email || "Utilizator necunoscut"
      })
      
      toast({
        title: "Succes",
        description: "Lucrarea a fost arhivată cu succes.",
      })
      
      // Apelăm callback-ul de succes dacă există
      onSuccess?.()
    } catch (error) {
      console.error("Eroare la arhivare:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut arhiva lucrarea.",
        variant: "destructive",
      })
    } finally {
      setIsArchiving(false)
    }
  }

  const ButtonComponent = (
    <Button
      variant={variant}
      size={size}
      onClick={handleArchive}
      disabled={!canArchive || isArchiving}
      className={`text-gray-600 border-gray-200 hover:bg-gray-50 ${className}`}
    >
      <Archive className={`${showLabel ? "mr-2" : ""} h-4 w-4`} />
      {showLabel && (isArchiving ? "Se arhivează..." : "Arhivează")}
    </Button>
  )

  if (showLabel) {
    return ButtonComponent
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {ButtonComponent}
        </TooltipTrigger>
        <TooltipContent>
          {isArchiving ? "Se arhivează..." : archiveReason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
} 