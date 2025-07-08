"use client"

import { useState, useEffect, useRef } from "react"
import { QrReader } from "react-qr-reader"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, XCircle, Camera, KeyRound, Flashlight, ZoomIn, ZoomOut, Settings } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
// Adăugăm importuri pentru funcționalitatea de garanție
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { calculateWarranty, getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import type { Echipament } from "@/lib/firebase/firestore"
import { Slider } from "@/components/ui/slider"

interface QRCodeScannerProps {
  expectedEquipmentCode?: string
  expectedLocationName?: string
  expectedClientName?: string
  onScanSuccess?: (data: any) => void
  onScanError?: (error: string) => void
  onVerificationComplete?: (success: boolean) => void
  // Adăugăm props pentru funcționalitatea de garanție
  isWarrantyWork?: boolean  // Dacă lucrarea este de tip "Intervenție în garanție"
  onWarrantyVerification?: (isInWarranty: boolean) => void  // Callback pentru declararea garanției de către tehnician
  equipmentData?: Echipament  // Datele echipamentului pentru calculul garanției
}

// Schema pentru validarea codului introdus manual
const manualCodeSchema = z.object({
  equipmentCode: z.string().min(1, "Codul echipamentului este obligatoriu"),
})

type ManualCodeFormValues = z.infer<typeof manualCodeSchema>

// Constanta pentru durata timeout-ului global (în milisecunde)
const GLOBAL_SCAN_TIMEOUT = 15000 // 15 secunde

export function QRCodeScanner({
  expectedEquipmentCode,
  expectedLocationName,
  expectedClientName,
  onScanSuccess,
  onScanError,
  onVerificationComplete,
  isWarrantyWork,
  onWarrantyVerification,
  equipmentData,
}: QRCodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean
    message: string
    details?: string[]
  } | null>(null)
  const { toast } = useToast()
  const [debugMode, setDebugMode] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<"prompt" | "granted" | "denied" | "unknown">(
    "unknown",
  )

  // Adăugăm un contor pentru încercările de scanare eșuate
  const [failedScanAttempts, setFailedScanAttempts] = useState(0)
  // Adăugăm un state pentru a afișa butonul de introducere manuală
  const [showManualEntryButton, setShowManualEntryButton] = useState(false)
  // Adăugăm un state pentru a afișa formularul de introducere manuală
  const [showManualCodeInput, setShowManualCodeInput] = useState(false)
  // Timestamp pentru ultima scanare încercată
  const lastScanAttemptRef = useRef<number>(0)
  // Timeout pentru scanare continuă
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Timeout global pentru scanare
  const globalTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Adăugăm un state pentru a urmări progresul timerului global
  const [globalTimeoutProgress, setGlobalTimeoutProgress] = useState(0)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  // Adăugăm un state pentru a urmări dacă timerul global a expirat
  const [globalTimeoutExpired, setGlobalTimeoutExpired] = useState(false)
  // Adăugăm un state pentru a afișa timpul rămas
  const [timeRemaining, setTimeRemaining] = useState(GLOBAL_SCAN_TIMEOUT / 1000)

  // Adăugăm state pentru funcționalitatea de garanție
  const [warrantyInfo, setWarrantyInfo] = useState<any>(null)
  const [showWarrantyVerification, setShowWarrantyVerification] = useState(false)
  const [technicianWarrantyDeclaration, setTechnicianWarrantyDeclaration] = useState<boolean | null>(null)

  // State-uri pentru controale avansate camera
  const [torchEnabled, setTorchEnabled] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [showAdvancedControls, setShowAdvancedControls] = useState(false)
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null)
  const [supportsTorch, setSupportsTorch] = useState(false)
  const [supportsZoom, setSupportsZoom] = useState(false)
  const [scanSensitivity, setScanSensitivity] = useState(300) // scanDelay în ms

  // State-uri pentru automatizări inteligente
  const [autoMode, setAutoMode] = useState(true)
  const [lightLevel, setLightLevel] = useState<'dark' | 'normal' | 'bright'>('normal')
  const [autoTorchTriggered, setAutoTorchTriggered] = useState(false)
  const [autoZoomTriggered, setAutoZoomTriggered] = useState(false)
  const [scanAttempts, setScanAttempts] = useState(0)
  const [isAutoOptimizing, setIsAutoOptimizing] = useState(false)
  const lightDetectionRef = useRef<NodeJS.Timeout | null>(null)
  const optimizationRef = useRef<NodeJS.Timeout | null>(null)

  // Inițializăm formularul pentru introducerea manuală a codului
  const form = useForm<ManualCodeFormValues>({
    resolver: zodResolver(manualCodeSchema),
    defaultValues: {
      equipmentCode: "",
    },
  })

  // Detectăm dacă suntem pe un dispozitiv mobil
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
      setIsMobile(mobileRegex.test(userAgent.toLowerCase()))
    }

    checkMobile()
  }, [])

  // Effect pentru a obține track-ul video din QrReader
  useEffect(() => {
    if (isScanning && !showManualCodeInput) {
      const interval = setInterval(() => {
        getVideoTrackFromQrReader()
      }, 1000) // Verificăm la fiecare secundă
      
      return () => clearInterval(interval)
    }
  }, [isScanning, showManualCodeInput])

  // Efect pentru a afișa butonul de introducere manuală când timerul global expiră
  useEffect(() => {
    if (globalTimeoutExpired && isScanning && !showManualCodeInput && !showManualEntryButton) {
      console.log("Afișare buton introducere manuală după expirarea timerului global")
      setShowManualEntryButton(true)
    }
  }, [globalTimeoutExpired, isScanning, showManualCodeInput, showManualEntryButton])

  // Resetăm starea când se deschide/închide dialogul
  useEffect(() => {
    if (!isOpen) {
      setScanResult(null)
      setScanError(null)
      setVerificationResult(null)
      setIsVerifying(false)
      setIsScanning(false)
      setFailedScanAttempts(0)
      setShowManualEntryButton(false)
      setShowManualCodeInput(false)
      setGlobalTimeoutProgress(0)
      setGlobalTimeoutExpired(false)
      setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000)
      // Resetăm state-ul pentru garanție
      setWarrantyInfo(null)
      setShowWarrantyVerification(false)
      setTechnicianWarrantyDeclaration(null)
      // Resetăm controalele avansate
      setTorchEnabled(false)
      setZoomLevel(1)
      setShowAdvancedControls(false)
      setVideoTrack(null)
      setSupportsTorch(false)
      setSupportsZoom(false)
      setScanSensitivity(300)
      // Resetăm automatizările
      stopAutoOptimizations()
      setLightLevel('normal')
      form.reset()

      // Curățăm timeout-urile la închiderea dialogului
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      if (globalTimeoutRef.current) {
        clearTimeout(globalTimeoutRef.current)
        globalTimeoutRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    } else {
      // Verificăm permisiunile camerei când se deschide dialogul
      checkCameraPermissions()
      // Activăm starea de scanare când se deschide dialogul
      setIsScanning(true)
      // Resetăm contorul de încercări eșuate
      setFailedScanAttempts(0)
      // Resetăm timestamp-ul ultimei scanări
      lastScanAttemptRef.current = Date.now()
      // Resetăm starea de expirare a timerului global
      setGlobalTimeoutExpired(false)
      // Resetăm timpul rămas
      setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000)

      // Inițiem un timeout pentru a verifica dacă scanarea continuă nu produce rezultate
      startContinuousScanTimeout()

      // Pornim timerul global pentru timeout
      startGlobalScanTimeout()
    }
  }, [isOpen, form])

  // Funcție pentru a porni timeout-ul pentru scanare continuă
  const startContinuousScanTimeout = () => {
    // Curățăm timeout-ul existent dacă există
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
    }

    // Setăm un nou timeout pentru a verifica dacă scanarea continuă nu produce rezultate
    scanTimeoutRef.current = setTimeout(() => {
      // Dacă suntem încă în modul de scanare și nu am avut un rezultat valid
      if (isScanning && !scanResult && !showManualCodeInput) {
        console.log("Scanare continuă fără rezultat valid")
        incrementFailedAttempts()

        // Resetăm și pornim un nou timeout dacă încă nu am ajuns la 3 încercări
        if (failedScanAttempts < 2) {
          // < 2 pentru că incrementFailedAttempts va adăuga 1
          startContinuousScanTimeout()
        }
      }
    }, 5000) // Verificăm la fiecare 5 secunde
  }

  // Funcție simplificată pentru timerul global
  const startGlobalScanTimeout = () => {
    console.log("Pornire timer global de 15 secunde")

    // Resetăm starea
    setGlobalTimeoutProgress(0)
    setGlobalTimeoutExpired(false)
    setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000)

    // Curățăm timeout-urile existente
    if (globalTimeoutRef.current) {
      clearTimeout(globalTimeoutRef.current)
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    // Setăm un interval pentru actualizarea progresului (la fiecare secundă)
    const startTime = Date.now()
    const endTime = startTime + GLOBAL_SCAN_TIMEOUT

    progressIntervalRef.current = setInterval(() => {
      const now = Date.now()
      const elapsed = now - startTime
      const remaining = Math.max(0, GLOBAL_SCAN_TIMEOUT - elapsed)
      const progress = (elapsed / GLOBAL_SCAN_TIMEOUT) * 100

      setGlobalTimeoutProgress(Math.min(100, progress))
      setTimeRemaining(Math.ceil(remaining / 1000))

      // Verificăm dacă timpul a expirat
      if (now >= endTime) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current)
          progressIntervalRef.current = null
        }

        // Marcăm timerul ca expirat și afișăm butonul de introducere manuală
        console.log("Timerul global a expirat")
        setGlobalTimeoutExpired(true)
        setGlobalTimeoutProgress(100)
        setTimeRemaining(0)

        // Afișăm butonul de introducere manuală direct
        if (isScanning && !showManualCodeInput && !showManualEntryButton) {
          console.log("Afișare buton introducere manuală după expirarea timerului global")
          setShowManualEntryButton(true)
        }
      }
    }, 100)

    // Setăm un timeout pentru a marca expirarea timerului global
    globalTimeoutRef.current = setTimeout(() => {
      console.log("Timeout global de 15 secunde atins")
      setGlobalTimeoutExpired(true)
      setGlobalTimeoutProgress(100)
      setTimeRemaining(0)

      // Afișăm butonul de introducere manuală direct
      if (isScanning && !showManualCodeInput && !showManualEntryButton) {
        console.log("Afișare buton introducere manuală după expirarea timerului global")
        setShowManualEntryButton(true)
      }
    }, GLOBAL_SCAN_TIMEOUT)
  }

  // Verificăm permisiunile camerei și capabilitățile
  const checkCameraPermissions = async () => {
    try {
      // Verificăm dacă API-ul de permisiuni este disponibil
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: "camera" as PermissionName })
        setCameraPermissionStatus(permissionStatus.state as "prompt" | "granted" | "denied")

        permissionStatus.onchange = () => {
          setCameraPermissionStatus(permissionStatus.state as "prompt" | "granted" | "denied")
        }
      }

      // Constraints optimizate pentru scanare QR în condiții variate
      const constraints = {
        video: {
          facingMode: isMobile ? "environment" : "user",
          width: isMobile ? { ideal: 1920, max: 2560 } : { min: 720, ideal: 1280 },
          height: isMobile ? { ideal: 1080, max: 1440 } : { min: 540, ideal: 720 },
          // Setări optimizate pentru scanare QR
          frameRate: { ideal: 30, max: 60 },
        },
      }

      // Încercăm să accesăm camera cu setări optimizate
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      // Verificăm capabilitățile track-ului video
      const track = stream.getVideoTracks()[0]
      if (track) {
        setVideoTrack(track)
        
        // Verificăm suportul pentru torch
        const capabilities = track.getCapabilities() as any
        if (capabilities.torch) {
          setSupportsTorch(true)
          console.log("Camera suportă torch/flash")
        }
        
        // Verificăm suportul pentru zoom
        if (capabilities.zoom) {
          setSupportsZoom(true)
          const { min, max } = capabilities.zoom
          console.log(`Camera suportă zoom: ${min}x - ${max}x`)
        }
        
        console.log("Camera capabilities:", capabilities)
      }

      // Eliberăm stream-ul după ce am verificat că avem acces
      stream.getTracks().forEach((track) => track.stop())

      setScanError(null)
    } catch (err) {
      console.error("Camera permission error:", err)
      setScanError("Nu s-a putut accesa camera. Verificați permisiunile browserului.")
      setCameraPermissionStatus("denied")
      setIsScanning(false)

      // Considerăm și aceasta o încercare eșuată
      incrementFailedAttempts()
    }
  }

  // Funcție pentru controlul torch-ului
  const toggleTorch = async () => {
    if (!videoTrack || !supportsTorch) return
    
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: !torchEnabled } as any]
      })
      setTorchEnabled(!torchEnabled)
      console.log(`Torch ${!torchEnabled ? 'activated' : 'deactivated'}`)
    } catch (err) {
      console.error("Error toggling torch:", err)
    }
  }

  // Funcție pentru controlul zoom-ului
  const handleZoomChange = async (newZoom: number[]) => {
    if (!videoTrack || !supportsZoom) return
    
    const zoomValue = newZoom[0]
    try {
      await videoTrack.applyConstraints({
        advanced: [{ zoom: zoomValue } as any]
      })
      setZoomLevel(zoomValue)
      console.log(`Zoom set to: ${zoomValue}x`)
    } catch (err) {
      console.error("Error applying zoom:", err)
    }
  }

  // Funcție pentru a obține track-ul video activ din QrReader
  const getVideoTrackFromQrReader = () => {
    const videoElement = document.getElementById("qr-video-element") as HTMLVideoElement
    if (videoElement && videoElement.srcObject) {
      const stream = videoElement.srcObject as MediaStream
      const track = stream.getVideoTracks()[0]
      if (track && track !== videoTrack) {
        setVideoTrack(track)
        
        // Verificăm din nou capabilitățile pentru track-ul nou
        const capabilities = track.getCapabilities() as any
        setSupportsTorch(!!capabilities.torch)
        setSupportsZoom(!!capabilities.zoom)
        
        // Pornește automatizările când avem track-ul video
        if (autoMode) {
          startAutoOptimizations(videoElement, track)
        }
      }
    }
  }

  // Funcție pentru detectarea automată a luminii ambientale
  const detectAmbientLight = (videoElement: HTMLVideoElement) => {
    if (!videoElement || !videoElement.videoWidth) return

    try {
      // Creăm un canvas pentru a analiza pixelii
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      canvas.width = 100 // Reducem dimensiunea pentru performanță
      canvas.height = 100
      
      // Desenăm frame-ul curent în canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
      
      // Obținem datele pixelilor
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      
      // Calculăm luminozitatea medie
      let totalBrightness = 0
      for (let i = 0; i < data.length; i += 4) {
        // Formula pentru luminozitate: 0.299*R + 0.587*G + 0.114*B
        const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        totalBrightness += brightness
      }
      
      const avgBrightness = totalBrightness / (data.length / 4)
      
      // Determinăm nivelul de lumină
      let newLightLevel: 'dark' | 'normal' | 'bright'
      if (avgBrightness < 50) {
        newLightLevel = 'dark'
      } else if (avgBrightness > 180) {
        newLightLevel = 'bright'
      } else {
        newLightLevel = 'normal'
      }
      
      if (newLightLevel !== lightLevel) {
        setLightLevel(newLightLevel)
        console.log(`🔍 Detectată schimbare lumină: ${newLightLevel} (${avgBrightness.toFixed(1)})`)
      }
      
      return avgBrightness
    } catch (error) {
      console.error('Eroare la detectarea luminii:', error)
      return null
    }
  }

  // Funcție pentru auto-torch în condiții de întuneric
  const autoToggleTorch = async (track: MediaStreamTrack, lightLevel: string) => {
    if (!supportsTorch || !autoMode) return

    try {
      if (lightLevel === 'dark' && !torchEnabled && !autoTorchTriggered) {
        console.log('🔦 AUTO: Activez torch-ul pentru condiții de întuneric')
        await track.applyConstraints({
          advanced: [{ torch: true } as any]
        })
        setTorchEnabled(true)
        setAutoTorchTriggered(true)
        
        toast({
          title: "Auto-optimizare",
          description: "Am activat flash-ul pentru condiții de întuneric",
          duration: 2000,
        })
      } else if (lightLevel !== 'dark' && torchEnabled && autoTorchTriggered) {
        console.log('🔦 AUTO: Dezactivez torch-ul - lumină suficientă')
        await track.applyConstraints({
          advanced: [{ torch: false } as any]
        })
        setTorchEnabled(false)
        setAutoTorchTriggered(false)
      }
    } catch (error) {
      console.error('Eroare la auto-torch:', error)
    }
  }

  // Funcție pentru auto-zoom progresiv
  const autoProgressiveZoom = async (track: MediaStreamTrack, attempts: number) => {
    if (!supportsZoom || !autoMode || autoZoomTriggered) return

    try {
      // După 5 încercări fără succes, încep zoom-ul progresiv
      if (attempts >= 5 && attempts <= 15) {
        const targetZoom = Math.min(2.0, 1 + (attempts - 5) * 0.1)
        
        if (Math.abs(targetZoom - zoomLevel) > 0.05) {
          console.log(`🔍 AUTO: Zoom progresiv la ${targetZoom.toFixed(1)}x (încercarea ${attempts})`)
          await track.applyConstraints({
            advanced: [{ zoom: targetZoom } as any]
          })
          setZoomLevel(targetZoom)
          
          if (attempts === 6) { // Prima dată când activăm zoom-ul
            setAutoZoomTriggered(true)
            toast({
              title: "Auto-optimizare",
              description: "Încerc zoom pentru a detecta mai bine QR-ul",
              duration: 2000,
            })
          }
        }
      }
      
      // După 15 încercări, revin la zoom normal și încerc din nou
      if (attempts === 16 && autoZoomTriggered) {
        console.log('🔍 AUTO: Revin la zoom normal')
        await track.applyConstraints({
          advanced: [{ zoom: 1 } as any]
        })
        setZoomLevel(1)
        setAutoZoomTriggered(false)
      }
    } catch (error) {
      console.error('Eroare la auto-zoom:', error)
    }
  }

  // Funcție pentru auto-ajustare sensibilitate
  const autoAdjustSensitivity = (attempts: number) => {
    if (!autoMode) return

    // În primele 10 secunde, folosim sensibilitate mai mare pentru detectare rapidă
    if (attempts < 10 && scanSensitivity !== 200) {
      console.log('⚡ AUTO: Sensibilitate ridicată pentru detectare rapidă')
      setScanSensitivity(200)
    }
    // După 10 secunde, reducem sensibilitatea pentru a evita procesarea excesivă
    else if (attempts >= 10 && attempts < 20 && scanSensitivity !== 400) {
      console.log('⚡ AUTO: Sensibilitate medie pentru echilibru')
      setScanSensitivity(400)
    }
    // După 20 de secunde, sensibilitate redusă pentru stabilitate
    else if (attempts >= 20 && scanSensitivity !== 600) {
      console.log('⚡ AUTO: Sensibilitate redusă pentru stabilitate')
      setScanSensitivity(600)
    }
  }

  // Funcție principală pentru pornirea automatizărilor
  const startAutoOptimizations = (videoElement: HTMLVideoElement, track: MediaStreamTrack) => {
    if (!autoMode) return

    console.log('🤖 AUTO: Pornesc optimizările automate')
    setIsAutoOptimizing(true)

    // Detectare lumină la fiecare 2 secunde
    lightDetectionRef.current = setInterval(() => {
      const brightness = detectAmbientLight(videoElement)
      if (brightness !== null) {
        autoToggleTorch(track, lightLevel)
      }
    }, 2000)

    // Optimizare progresivă la fiecare 3 secunde
    optimizationRef.current = setInterval(() => {
      setScanAttempts(prev => {
        const newAttempts = prev + 1
        
        // Auto-zoom progresiv
        autoProgressiveZoom(track, newAttempts)
        
        // Auto-ajustare sensibilitate
        autoAdjustSensitivity(newAttempts)
        
        return newAttempts
      })
    }, 3000)
  }

  // Funcție pentru oprirea automatizărilor
  const stopAutoOptimizations = () => {
    if (lightDetectionRef.current) {
      clearInterval(lightDetectionRef.current)
      lightDetectionRef.current = null
    }
    if (optimizationRef.current) {
      clearInterval(optimizationRef.current)
      optimizationRef.current = null
    }
    setIsAutoOptimizing(false)
    setScanAttempts(0)
    setAutoTorchTriggered(false)
    setAutoZoomTriggered(false)
    console.log('🤖 AUTO: Opresc optimizările automate')
  }

  // Funcție pentru verificarea datelor scanate
  const verifyScannedData = (data: any) => {
    setIsVerifying(true)
    setIsScanning(false)
    setScanError(null)

    try {
      // If data is a string, try to parse it as JSON
      let parsedData
      try {
        parsedData = typeof data === "string" ? JSON.parse(data) : data
        console.log("Processing QR data:", parsedData)
      } catch (parseError) {
        console.log("QR code is not valid JSON, using as raw text:", data)
        parsedData = { raw: data, type: "unknown" }
      }

      // Handle raw text QR codes
      if (parsedData.type === "unknown") {
        setVerificationResult({
          success: false,
          message: "QR code necunoscut",
          details: ["Acest QR code nu conține informații despre un echipament. Conținut: " + parsedData.raw],
        })
        if (onScanError) onScanError("QR code necunoscut")
        if (onVerificationComplete) onVerificationComplete(false)
        setIsVerifying(false)
        setIsScanning(true) // Reactivăm scanarea

        // Incrementăm contorul de încercări eșuate
        incrementFailedAttempts()
        return
      }

      // Verificăm dacă este un QR code de echipament
      if (parsedData.type !== "equipment") {
        setVerificationResult({
          success: false,
          message: "QR code invalid",
          details: ["Acest QR code nu este pentru un echipament."],
        })
        if (onScanError) onScanError("QR code invalid")
        if (onVerificationComplete) onVerificationComplete(false)
        setIsVerifying(false)
        setIsScanning(true) // Reactivăm scanarea

        // Incrementăm contorul de încercări eșuate
        incrementFailedAttempts()
        return
      }

      // Verificăm codul echipamentului
      const errors: string[] = []
      let isMatch = true

      if (expectedEquipmentCode && parsedData.code !== expectedEquipmentCode) {
        errors.push(`Cod echipament necorespunzător`)
        isMatch = false
      }

      // Verificăm numele locației
      if (expectedLocationName && parsedData.location !== expectedLocationName) {
        errors.push(`Locație necorespunzătoare`)
        isMatch = false
      }

      // Verificăm numele clientului
      if (expectedClientName && parsedData.client !== expectedClientName) {
        errors.push(`Client necorespunzător`)
        isMatch = false
      }

      // Setăm rezultatul verificării
      if (isMatch) {
        setVerificationResult({
          success: true,
          message: "Verificare reușită!",
          details: ["Echipamentul scanat corespunde cu lucrarea."],
        })
        
        // Verificăm garanția pentru lucrări de tip "Intervenție în garanție"
        if (isWarrantyWork && equipmentData) {
          const warranty = getWarrantyDisplayInfo(equipmentData)
          setWarrantyInfo(warranty)
          setShowWarrantyVerification(true)
          
          // Nu chemăm callback-urile încă - așteptăm declarația tehnicianului
        } else {
          // Pentru alte tipuri de lucrări, chemăm callback-urile direct
          if (onScanSuccess) onScanSuccess(parsedData)
          if (onVerificationComplete) onVerificationComplete(true)

          // Resetăm contorul de încercări eșuate
          setFailedScanAttempts(0)
          setShowManualEntryButton(false)

          // Închide dialogul automat după o verificare reușită
          setTimeout(() => {
            setIsOpen(false)
            toast({
              title: "Verificare reușită",
              description: "Echipamentul scanat corespunde cu lucrarea. Puteți continua intervenția.",
            })
          }, 2000)
        }
      } else {
        setVerificationResult({
          success: false,
          message: "Verificare eșuată!",
          details: errors,
        })
        if (onScanError) onScanError(errors.join(", "))
        if (onVerificationComplete) onVerificationComplete(false)
        setIsScanning(true) // Reactivăm scanarea pentru QR code-uri necorespunzătoare

        // Incrementăm contorul de încercări eșuate
        incrementFailedAttempts()
      }
    } catch (error) {
      console.error("Eroare la verificarea datelor scanate:", error)
      setVerificationResult({
        success: false,
        message: "Eroare la procesarea QR code-ului",
        details: ["Formatul QR code-ului nu este valid."],
      })
      if (onScanError) onScanError("Format QR code invalid")
      if (onVerificationComplete) onVerificationComplete(false)
      setIsScanning(true) // Reactivăm scanarea după eroare

      // Incrementăm contorul de încercări eșuate
      incrementFailedAttempts()
    }

    setIsVerifying(false)

    // Resetăm și pornim un nou timeout pentru scanare continuă
    if (isScanning) {
      startContinuousScanTimeout()
    }
  }

  // Funcție pentru incrementarea contorului de încercări eșuate
  const incrementFailedAttempts = () => {
    setFailedScanAttempts((prev) => {
      const newCount = prev + 1
      console.log(`Încercare eșuată ${newCount}/3`)

      // După 3 încercări eșuate, afișăm butonul de introducere manuală
      if (newCount >= 3) {
        setShowManualEntryButton(true)
      }

      return newCount
    })
  }

  // Funcție pentru a activa formularul de introducere manuală
  const activateManualCodeInput = () => {
    setShowManualCodeInput(true)
    setIsScanning(false) // Oprim scanarea când se activează introducerea manuală
    setGlobalTimeoutProgress(0) // Resetăm progresul
    setGlobalTimeoutExpired(false) // Resetăm starea de expirare a timerului global
    setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000) // Resetăm timpul rămas

    // Curățăm timeout-urile când se activează introducerea manuală
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }
    if (globalTimeoutRef.current) {
      clearTimeout(globalTimeoutRef.current)
      globalTimeoutRef.current = null
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
  }

  // Funcție pentru a reveni la scanare
  const returnToScanning = () => {
    setShowManualCodeInput(false)
    setShowManualEntryButton(false)
    setFailedScanAttempts(0)
    setScanResult(null)
    setScanError(null)
    setVerificationResult(null)
    setIsScanning(true)
    setGlobalTimeoutProgress(0) // Resetăm progresul
    setGlobalTimeoutExpired(false) // Resetăm starea de expirare a timerului global
    setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000) // Resetăm timpul rămas
    form.reset()

    // Resetăm timestamp-ul ultimei scanări
    lastScanAttemptRef.current = Date.now()

    // Pornim un nou timeout pentru scanare continuă
    startContinuousScanTimeout()

    // Pornim un nou timer global
    startGlobalScanTimeout()
  }

  const handleScan = (result: any) => {
    if (result?.text) {
      console.log("QR Code detected:", result.text)
      setScanResult(result.text)
      setIsScanning(false) // Oprim starea de scanare când am detectat un QR code
      setGlobalTimeoutProgress(0) // Resetăm progresul
      setGlobalTimeoutExpired(false) // Resetăm starea de expirare a timerului global
      setTimeRemaining(GLOBAL_SCAN_TIMEOUT / 1000) // Resetăm timpul rămas

      // Oprim automatizările când detectăm un QR code
      stopAutoOptimizations()

      // Curățăm timeout-urile când detectăm un cod QR
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      if (globalTimeoutRef.current) {
        clearTimeout(globalTimeoutRef.current)
        globalTimeoutRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }

      verifyScannedData(result.text)
    }
  }

  const handleError = (error: any) => {
    console.error("Eroare la scanarea QR code-ului:", error)
    setScanError("A apărut o eroare la scanarea QR code-ului. Verificați permisiunile camerei.")
    setIsScanning(false)
    if (onScanError) onScanError("Eroare la scanare")
    if (onVerificationComplete) onVerificationComplete(false)

    // Incrementăm contorul de încercări eșuate
    incrementFailedAttempts()
  }

  // Funcție pentru verificarea codului introdus manual
  const onSubmitManualCode = (values: ManualCodeFormValues) => {
    console.log("Verificare cod manual:", values.equipmentCode)
    setIsVerifying(true)

    // Simulăm un obiect de date similar cu cel obținut din scanarea QR
    const manualData = {
      type: "equipment",
      code: values.equipmentCode,
      client: expectedClientName || "",
      location: expectedLocationName || "",
    }

    // Verificăm dacă codul introdus manual corespunde cu cel așteptat
    if (expectedEquipmentCode && values.equipmentCode === expectedEquipmentCode) {
      setVerificationResult({
        success: true,
        message: "Verificare reușită!",
        details: ["Codul introdus manual corespunde cu echipamentul din lucrare."],
      })

      if (onScanSuccess) onScanSuccess(manualData)
      if (onVerificationComplete) onVerificationComplete(true)

      // Închide dialogul automat după o verificare reușită
      setTimeout(() => {
        setIsOpen(false)
        toast({
          title: "Verificare reușită",
          description: "Codul introdus manual corespunde cu echipamentul din lucrare. Puteți continua intervenția.",
        })
      }, 2000)
    } else {
      setVerificationResult({
        success: false,
        message: "Verificare eșuată!",
        details: [
          `Cod echipament necorespunzător`,
        ],
      })

      if (onScanError)
        onScanError(
          `Cod echipament necorespunzător`,
        )
      if (onVerificationComplete) onVerificationComplete(false)
    }

    setIsVerifying(false)
  }

  // Renderăm un mesaj de permisiuni pentru cameră
  const renderCameraPermissionMessage = () => {
    if (cameraPermissionStatus === "denied") {
      return (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Acces cameră blocat</AlertTitle>
          <AlertDescription>
            <p>
              Browserul a blocat accesul la cameră. Pentru a scana QR code-uri, trebuie să permiteți accesul la cameră.
            </p>
            <p className="mt-2">
              Pe dispozitive mobile, verificați setările browserului sau ale aplicației pentru a permite accesul la
              cameră.
            </p>
            <Button variant="outline" className="mt-2" onClick={checkCameraPermissions}>
              <Camera className="mr-2 h-4 w-4" />
              Solicită din nou acces la cameră
            </Button>
          </AlertDescription>
        </Alert>
      )
    }

    if (cameraPermissionStatus === "prompt") {
      return (
        <Alert className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Permisiune cameră necesară</AlertTitle>
          <AlertDescription>
            <p>
              Pentru a scana QR code-uri, trebuie să permiteți accesul la cameră când browserul vă solicită acest lucru.
            </p>
          </AlertDescription>
        </Alert>
      )
    }

    return null
  }

  // Renderăm butonul de introducere manuală a codului
  const renderManualEntryButton = () => {
    if (showManualEntryButton && !showManualCodeInput) {
      return (
        <div className="mt-4 p-4 border rounded-lg bg-muted/30">
          <p className="text-sm text-muted-foreground mb-3">
            Nu s-a putut scana codul. Încercați introducerea manuală.
          </p>
          <Button onClick={activateManualCodeInput} className="w-full">
            <KeyRound className="mr-2 h-4 w-4" />
            Introdu codul manual
          </Button>
        </div>
      )
    }
    return null
  }

  // Renderăm formularul de introducere manuală a codului
  const renderManualCodeInput = () => {
    if (!showManualCodeInput) return null

    return (
      <div className="p-4 border rounded-lg mt-4">
        <h3 className="text-lg font-medium mb-2">Introducere manuală cod</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Introduceți codul unic al echipamentului pentru verificare.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitManualCode)} className="space-y-4">
            <FormField
              control={form.control}
              name="equipmentCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cod echipament</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Introduceți codul echipamentului" 
                      {...field}
                      onChange={(e) => {
                        // Capitalizăm automat literele
                        const uppercaseValue = e.target.value.toUpperCase()
                        field.onChange(uppercaseValue)
                      }}
                      style={{ textTransform: 'uppercase' }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="submit" className="flex-1" disabled={isVerifying}>
                {isVerifying ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Se verifică...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Verifică codul
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={returnToScanning} className="flex-1">
                <Camera className="mr-2 h-4 w-4" />
                Reîncearcă scanarea
              </Button>
            </div>
          </form>
        </Form>
      </div>
    )
  }

  // Curățăm intervalele de scanare la dezmontarea componentei
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
        scanTimeoutRef.current = null
      }
      if (globalTimeoutRef.current) {
        clearTimeout(globalTimeoutRef.current)
        globalTimeoutRef.current = null
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      // Curățăm și automatizările
      stopAutoOptimizations()
    }
  }, [])

  // Funcție pentru gestionarea declarației tehnicianului despre garanție
  const handleWarrantyDeclaration = (isInWarranty: boolean) => {
    setTechnicianWarrantyDeclaration(isInWarranty)
    
    // Chemăm callback-ul pentru declararea garanției
    if (onWarrantyVerification) {
      onWarrantyVerification(isInWarranty)
    }
    
    // Chemăm callback-urile pentru scanarea reușită
    if (onScanSuccess && scanResult) {
      onScanSuccess(scanResult)
    }
    if (onVerificationComplete) {
      onVerificationComplete(true)
    }

    // Resetăm contorul de încercări eșuate
    setFailedScanAttempts(0)
    setShowManualEntryButton(false)

    // Închide dialogul după declarația tehnicianului
    setTimeout(() => {
      setIsOpen(false)
      toast({
        title: "Verificare completă",
        description: `Echipamentul a fost verificat. Garanție: ${isInWarranty ? 'DA' : 'NU'}`,
      })
    }, 1500)
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="outline">
        Scanează QR Code
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <div className="dialog-content-scrollable">
            <DialogHeader>
              <DialogTitle>Scanare QR Code Echipament</DialogTitle>
              <DialogDescription>
                Îndreptați camera către QR code-ul echipamentului pentru a-l scana.
                {autoMode && (
                  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                    🤖 <strong>Modul AUTO activ:</strong> Scanner-ul se optimizează automat pentru lumină, zoom și sensibilitate.
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>

            {renderCameraPermissionMessage()}

            {isScanning && !showManualCodeInput && cameraPermissionStatus !== "denied" && (
              <>
                <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-lg">
                  <QrReader
                    constraints={{
                      facingMode: isMobile ? "environment" : "user",
                      width: isMobile ? { ideal: 1920, max: 2560 } : { min: 720, ideal: 1280 },
                      height: isMobile ? { ideal: 1080, max: 1440 } : { min: 540, ideal: 720 },
                      // Setări optimizate pentru scanare QR în condiții variate
                      frameRate: { ideal: 30, max: 60 },
                    }}
                    onResult={handleScan}
                    scanDelay={scanSensitivity}
                    videoId="qr-video-element"
                    className="w-full h-full"
                    videoStyle={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: isMobile ? "scaleX(1)" : "scaleX(-1)", // Flip camera for desktop
                    }}
                    videoContainerStyle={{
                      width: "100%",
                      height: "100%",
                      position: "relative",
                      overflow: "hidden",
                    }}
                    containerStyle={{
                      width: "100%",
                      height: "100%",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  />
                  <div className="absolute inset-0 border-2 border-dashed border-white pointer-events-none"></div>

                  {/* Indicator de scanare animat */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {isScanning && (
                      <div className="relative w-full h-full">
                        {/* Linie de scanare animată */}
                        <div className="absolute left-0 right-0 h-0.5 bg-green-500 opacity-70 animate-scan-line"></div>

                        {/* Indicator de scanare în colțul din dreapta sus */}
                        <div className="absolute top-2 right-2 flex items-center bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-full">
                          <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></div>
                          <span>Scanare...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  {isMobile
                    ? "Asigurați-vă că QR code-ul este în cadrul camerei și bine iluminat."
                    : "Dacă camera nu se afișează, verificați permisiunile browserului și reîncărcați pagina."}
                </p>

                {/* Controale avansate pentru cameră */}
                <div className="mt-4 space-y-3">
                  {/* Indicator auto-optimizare și level lumină */}
                  {autoMode && (
                    <div className="flex justify-center items-center gap-2 mb-2">
                      <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 rounded-full text-xs">
                        <div className={`w-2 h-2 rounded-full ${isAutoOptimizing ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
                        <span className="text-blue-800">AUTO</span>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full text-xs">
                        <span className="text-gray-700">
                          {lightLevel === 'dark' ? '🌙' : lightLevel === 'bright' ? '☀️' : '🌤️'} 
                          {lightLevel}
                        </span>
                      </div>
                      {scanAttempts > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 rounded-full text-xs">
                          <span className="text-orange-800">#{scanAttempts}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Butoane pentru torch și controale */}
                  <div className="flex justify-center gap-2">
                    <Button
                      variant={autoMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setAutoMode(!autoMode)
                        if (!autoMode) {
                          toast({
                            title: "Auto-optimizare activată",
                            description: "Scanner-ul se va optimiza automat pentru condiții optime",
                            duration: 2000,
                          })
                        } else {
                          stopAutoOptimizations()
                          toast({
                            title: "Auto-optimizare dezactivată", 
                            description: "Controlați manual setările scanner-ului",
                            duration: 2000,
                          })
                        }
                      }}
                      className="flex items-center gap-1"
                    >
                      🤖 {autoMode ? "AUTO ON" : "AUTO OFF"}
                    </Button>

                    {supportsTorch && (
                      <Button
                        variant={torchEnabled ? "default" : "outline"}
                        size="sm"
                        onClick={toggleTorch}
                        className="flex items-center gap-1"
                        disabled={autoMode && autoTorchTriggered}
                      >
                        <Flashlight className="h-4 w-4" />
                        {torchEnabled ? "Flash ON" : "Flash OFF"}
                        {autoMode && autoTorchTriggered && <span className="text-xs">(AUTO)</span>}
                      </Button>
                    )}
                    
                    <Button
                      variant={showAdvancedControls ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowAdvancedControls(!showAdvancedControls)}
                      className="flex items-center gap-1"
                    >
                      <Settings className="h-4 w-4" />
                      Setări
                    </Button>
                  </div>

                  {/* Controale avansate */}
                  {showAdvancedControls && (
                    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                      {/* Control zoom */}
                      {supportsZoom && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">Zoom: {zoomLevel.toFixed(1)}x</label>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleZoomChange([Math.max(1, zoomLevel - 0.5)])}
                                disabled={zoomLevel <= 1}
                              >
                                <ZoomOut className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleZoomChange([Math.min(3, zoomLevel + 0.5)])}
                                disabled={zoomLevel >= 3}
                              >
                                <ZoomIn className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                                                     <Slider
                             value={[zoomLevel]}
                             onValueChange={handleZoomChange}
                             min={1}
                             max={3}
                             step={0.1}
                             className="w-full"
                             disabled={autoMode && autoZoomTriggered}
                           />
                           {autoMode && autoZoomTriggered && (
                             <p className="text-xs text-blue-600">🤖 Zoom controlat automat</p>
                           )}
                        </div>
                      )}

                      {/* Control sensibilitate scanare */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Sensibilitate scanare: {scanSensitivity}ms
                        </label>
                        <Slider
                          value={[scanSensitivity]}
                          onValueChange={(value) => setScanSensitivity(value[0])}
                          min={100}
                          max={1000}
                          step={50}
                          className="w-full"
                          disabled={autoMode}
                        />
                        <p className="text-xs text-muted-foreground">
                          {autoMode 
                            ? "🤖 Sensibilitate controlată automat" 
                            : "Valori mai mici = scanare mai rapidă, mai multe procesări"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Afișăm butonul de introducere manuală după 3 încercări eșuate sau după expirarea timerului global */}
            {renderManualEntryButton()}

            {/* Afișăm formularul de introducere manuală când utilizatorul apasă butonul */}
            {renderManualCodeInput()}

            {scanError && cameraPermissionStatus !== "denied" && !showManualCodeInput && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Eroare</AlertTitle>
                <AlertDescription>{scanError}</AlertDescription>
              </Alert>
            )}

            {isVerifying && !showManualCodeInput && (
              <div className="flex flex-col items-center justify-center p-4">
                <Spinner className="h-8 w-8" />
                <p className="mt-2">Se verifică echipamentul...</p>
              </div>
            )}

            {verificationResult && (
              <Alert variant={verificationResult.success ? "default" : "destructive"}>
                {verificationResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                <AlertTitle>{verificationResult.message}</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 mt-2">
                    {verificationResult.details?.map((detail, index) => (
                      <li key={index}>{detail}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Secțiunea pentru verificarea garanției de către tehnician */}
            {showWarrantyVerification && verificationResult?.success && warrantyInfo && (
              <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-blue-900">
                    <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">G</span>
                    </div>
                    Verificare Garanție Echipament
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Informații despre garanție calculate automat */}
                  <div className="p-3 bg-white rounded-md border">
                    <h4 className="font-medium text-sm mb-2">Calculul automat al garanției:</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <Badge className={warrantyInfo.statusBadgeClass + " ml-1"}>
                          {warrantyInfo.statusText}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-gray-600">Zile rămase:</span>
                        <span className={`ml-1 font-medium ${warrantyInfo.isInWarranty ? 'text-green-600' : 'text-red-600'}`}>
                          {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-600">Data instalării:</span>
                        <span className="ml-1">{warrantyInfo.installationDate || "Nedefinită"}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Expiră la:</span>
                        <span className="ml-1">{warrantyInfo.warrantyExpires || "Nedefinită"}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">{warrantyInfo.warrantyMessage}</p>
                  </div>

                  {/* Declarația tehnicianului */}
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <h4 className="font-medium text-sm mb-3 text-yellow-800">
                      Declarație tehnician (după verificarea fizică):
                    </h4>
                    <p className="text-xs text-yellow-700 mb-3">
                      Pe baza verificării fizice a echipamentului, confirmați dacă acesta este sau nu în garanție:
                    </p>
                    
                    {technicianWarrantyDeclaration === null ? (
                      <div className="flex flex-col space-y-2">
                        <Button 
                          onClick={() => handleWarrantyDeclaration(true)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                        >
                          ✓ DA - Echipamentul este în garanție
                        </Button>
                        <Button 
                          onClick={() => handleWarrantyDeclaration(false)}
                          variant="destructive"
                          size="sm"
                        >
                          ✗ NU - Echipamentul NU este în garanție
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Badge 
                          className={technicianWarrantyDeclaration 
                            ? "bg-green-100 text-green-800 border-green-200" 
                            : "bg-red-100 text-red-800 border-red-200"
                          }
                        >
                          {technicianWarrantyDeclaration ? "✓ În garanție" : "✗ Nu este în garanție"}
                        </Badge>
                        <span className="text-xs text-gray-600">Declarție confirmată</span>
                      </div>
                    )}
                  </div>

                  {/* Avertisment pentru discrepanțe */}
                  {technicianWarrantyDeclaration !== null && 
                   technicianWarrantyDeclaration !== warrantyInfo.isInWarranty && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                      <div className="flex items-center space-x-2">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span className="font-medium text-sm text-amber-800">Discrepanță detectată</span>
                      </div>
                      <p className="text-xs text-amber-700 mt-1">
                        Declarația tehnicianului ({technicianWarrantyDeclaration ? "în garanție" : "nu este în garanție"}) 
                        diferă de calculul automat ({warrantyInfo.isInWarranty ? "în garanție" : "nu este în garanție"}).
                        Declarația tehnicianului va fi folosită în raport.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {debugMode && (
              <div className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">
                <p className="font-bold">Debug Info:</p>
                <p>Device: {isMobile ? "Mobile" : "Desktop"}</p>
                <p>Camera Permission: {cameraPermissionStatus}</p>
                <p>Scanning: {isScanning ? "Yes" : "No"}</p>
                <p>Verifying: {isVerifying ? "Yes" : "No"}</p>
                <p>Failed Attempts: {failedScanAttempts}</p>
                <p>Show Manual Entry Button: {showManualEntryButton ? "Yes" : "No"}</p>
                <p>Show Manual Input: {showManualCodeInput ? "Yes" : "No"}</p>
                <p>Global Timeout Progress: {globalTimeoutProgress.toFixed(1)}%</p>
                <p>Global Timeout Expired: {globalTimeoutExpired ? "Yes" : "No"}</p>
                <p>Time Remaining: {timeRemaining}s</p>
                <p>Scan Result: {scanResult ? scanResult.substring(0, 100) + "..." : "None"}</p>
                <p>Error: {scanError || "None"}</p>
                <p>
                  Verification:{" "}
                  {verificationResult ? JSON.stringify(verificationResult).substring(0, 100) + "..." : "None"}
                </p>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full sm:w-auto">
                Închide
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDebugMode(!debugMode)}
                className="text-xs w-full sm:w-auto"
              >
                {debugMode ? "Dezactivează Debug" : "Activează Debug"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
