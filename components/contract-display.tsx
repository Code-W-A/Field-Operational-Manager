"use client"

import { useState, useEffect } from "react"
import { doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { Loader2 } from "lucide-react"

interface ContractDisplayProps {
  contractId?: string
  className?: string
}

export function ContractDisplay({ contractId, className = "text-sm text-gray-500" }: ContractDisplayProps) {
  const [contractNumber, setContractNumber] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchContract = async () => {
      if (!contractId) {
        setContractNumber(null)
        setLoading(false)
        return
      }

      try {
        const contractRef = doc(db, "contracts", contractId)
        const contractSnap = await getDoc(contractRef)

        if (contractSnap.exists()) {
          setContractNumber(contractSnap.data().number || null)
        } else {
          setContractNumber(null)
        }
      } catch (error) {
        console.error("Eroare la încărcarea contractului:", error)
        setContractNumber(null)
      } finally {
        setLoading(false)
      }
    }

    fetchContract()
  }, [contractId])

  if (loading) {
    return (
      <span className={className}>
        <Loader2 className="h-3 w-3 inline animate-spin mr-1" /> Se încarcă...
      </span>
    )
  }

  return <p className={className}>{contractNumber || "N/A"}</p>
}
