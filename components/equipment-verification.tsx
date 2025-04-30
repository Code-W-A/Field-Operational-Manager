"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { QrCodeScanner } from "./qr-code-scanner"
import type { Equipment } from "@/types/equipment"
import { CheckCircle, XCircle, QrCode } from "lucide-react"

type EquipmentVerificationProps = {
  workOrderId: string
  locationId: string
  expectedEquipmentId?: string
  onVerificationSuccess?: (equipment: Equipment) => void
}

export function EquipmentVerification({
  workOrderId,
  locationId,
  expectedEquipmentId,
  onVerificationSuccess,
}: EquipmentVerificationProps) {
  const [showScanner, setShowScanner] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean
    message: string
    equipment?: Equipment
  } | null>(null)

  const handleScanSuccess = (equipment: Equipment) => {
    // Verificare dacă echipamentul scanat este cel așteptat
    if (expectedEquipmentId && equipment.id !== expectedEquipmentId) {
      setVerificationResult({
        success: false,
        message: "Echipamentul scanat nu corespunde cu cel din lucrare!",
        equipment,
      })
    } else {
      setVerificationResult({
        success: true,
        message: "Echipamentul a fost verificat cu succes!",
        equipment,
      })

      if (onVerificationSuccess) {
        onVerificationSuccess(equipment)
      }
    }
  }

  const handleScanError = (message: string) => {
    setVerificationResult({
      success: false,
      message,
    })
  }

  const resetVerification = () => {
    setVerificationResult(null)
    setShowScanner(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificare echipament</CardTitle>
        <CardDescription>
          Scanați codul QR al echipamentului pentru a verifica dacă corespunde cu lucrarea.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {verificationResult && (
          <Alert variant={verificationResult.success ? "default" : "destructive"} className="mb-4">
            {verificationResult.success ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <AlertTitle>{verificationResult.success ? "Verificare reușită" : "Verificare eșuată"}</AlertTitle>
            <AlertDescription>{verificationResult.message}</AlertDescription>
          </Alert>
        )}

        {showScanner ? (
          <QrCodeScanner
            workOrderId={workOrderId}
            locationId={locationId}
            onScanSuccess={handleScanSuccess}
            onScanError={handleScanError}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <QrCode className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-center text-muted-foreground mb-4">
              Scanați codul QR al echipamentului pentru a verifica dacă corespunde cu lucrarea.
            </p>
            <Button onClick={() => setShowScanner(true)}>Scanează cod QR</Button>
          </div>
        )}
      </CardContent>
      {verificationResult && (
        <CardFooter className="flex justify-center">
          <Button variant="outline" onClick={resetVerification}>
            Resetează verificarea
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
