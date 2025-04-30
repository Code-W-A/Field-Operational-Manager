"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { verifyScannedEquipment } from "@/lib/firebase/equipment"
import type { Equipment, EquipmentScanResult } from "@/types/equipment"
import { toast } from "@/components/ui/use-toast"
import { Camera, CheckCircle, XCircle, RefreshCw } from "lucide-react"
import { BrowserMultiFormatReader, type Result, BarcodeFormat } from "@zxing/library"
import type { Exception } from "@zxing/library"

type QrCodeScannerProps = {
  workOrderId: string
  locationId: string
  onScanSuccess?: (equipment: Equipment) => void
  onScanError?: (message: string) => void
}

export function QrCodeScanner({ workOrderId, locationId, onScanSuccess, onScanError }: QrCodeScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<EquipmentScanResult | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null)

  // Inițializare scanner
  useEffect(() => {
    codeReaderRef.current = new BrowserMultiFormatReader()
    codeReaderRef.current.hints.set(
      2, // DecodeHintType.POSSIBLE_FORMATS
      [BarcodeFormat.QR_CODE],
    )

    return () => {
      if (codeReaderRef.current) {
        codeReaderRef.current.reset()
      }
    }
  }, [])

  // Pornire scanner
  const startScanner = async () => {
    if (!codeReaderRef.current) return

    setIsScanning(true)
    setScanResult(null)
    setCameraError(null)

    try {
      await codeReaderRef.current.decodeFromConstraints(
        {
          video: { facingMode: "environment" },
        },
        videoRef.current!,
        async (result: Result | undefined, error: Exception | undefined) => {
          if (result) {
            const code = result.getText()

            // Verificare cod
            try {
              const verificationResult = await verifyScannedEquipment(code, workOrderId, locationId)
              setScanResult(verificationResult)

              if (verificationResult.isValid) {
                if (onScanSuccess && verificationResult.equipment) {
                  onScanSuccess(verificationResult.equipment)
                }
              } else {
                if (onScanError) {
                  onScanError(verificationResult.message)
                }
              }

              // Oprire scanner după scanare reușită
              stopScanner()
            } catch (error) {
              console.error("Error verifying equipment:", error)
              toast({
                title: "Eroare",
                description: "A apărut o eroare la verificarea echipamentului.",
                variant: "destructive",
              })
            }
          }

          if (error) {
            console.error("Error scanning QR code:", error)
          }
        },
      )
    } catch (error) {
      console.error("Error accessing camera:", error)
      setCameraError("Nu s-a putut accesa camera. Vă rugăm să verificați permisiunile.")
      setIsScanning(false)
    }
  }

  // Oprire scanner
  const stopScanner = () => {
    if (codeReaderRef.current) {
      codeReaderRef.current.reset()
    }
    setIsScanning(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scanare cod QR echipament</CardTitle>
        <CardDescription>
          Scanați codul QR al echipamentului pentru a verifica dacă corespunde cu lucrarea.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {cameraError && (
          <Alert variant="destructive" className="mb-4">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Eroare cameră</AlertTitle>
            <AlertDescription>{cameraError}</AlertDescription>
          </Alert>
        )}

        {scanResult && (
          <Alert variant={scanResult.isValid ? "default" : "destructive"} className="mb-4">
            {scanResult.isValid ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <AlertTitle>{scanResult.isValid ? "Verificare reușită" : "Verificare eșuată"}</AlertTitle>
            <AlertDescription>{scanResult.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col items-center">
          {isScanning ? (
            <div className="relative w-full max-w-md aspect-square border rounded-md overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
              <div className="absolute inset-0 border-2 border-dashed border-primary/50 pointer-events-none" />
            </div>
          ) : (
            <div className="w-full max-w-md aspect-square border rounded-md flex items-center justify-center bg-muted">
              <Camera className="h-16 w-16 text-muted-foreground" />
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-center">
        {isScanning ? (
          <Button variant="outline" onClick={stopScanner}>
            <XCircle className="mr-2 h-4 w-4" />
            Oprește scanarea
          </Button>
        ) : (
          <Button onClick={startScanner}>
            {scanResult ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Scanează din nou
              </>
            ) : (
              <>
                <Camera className="mr-2 h-4 w-4" />
                Începe scanarea
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
