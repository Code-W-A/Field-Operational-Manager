"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, Eye, EyeOff } from "lucide-react"
import { signOut } from "@/lib/firebase/auth"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/components/ui/use-toast"

export function AutoLogoutDebug() {
  const [isVisible, setIsVisible] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const { userData } = useAuth()

  // Only show debug in development environment
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Only show for admin/dispatcher
  if (userData?.role !== 'admin' && userData?.role !== 'dispecer') {
    return null
  }

  const calculateTimeUntil2AM = () => {
    const now = new Date()
    const twoAM = new Date()
    twoAM.setHours(2, 0, 0, 0)
    
    // If it's already past 2 AM today, calculate for tomorrow
    if (now > twoAM) {
      twoAM.setDate(twoAM.getDate() + 1)
    }
    
    const timeUntilLogout = twoAM.getTime() - now.getTime()
    const hours = Math.floor(timeUntilLogout / (1000 * 60 * 60))
    const minutes = Math.floor((timeUntilLogout % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((timeUntilLogout % (1000 * 60)) / 1000)
    
    return { hours, minutes, seconds, totalMs: timeUntilLogout }
  }

  const timeUntil2AM = calculateTimeUntil2AM()

  const handleTestLogout = async () => {
    try {
      toast({
        title: "Test Logout",
        description: "Se execută logout de test...",
        variant: "default",
      })
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      await signOut()
    } catch (error) {
      console.error("Eroare la test logout:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut executa logout-ul de test.",
        variant: "destructive",
      })
    }
  }

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsVisible(true)}
          className="bg-white/90 backdrop-blur-sm border-gray-300"
        >
          <Eye className="h-4 w-4 mr-2" />
          Debug Logout
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className="w-80 bg-white/95 backdrop-blur-sm border-gray-200 shadow-lg">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Debug Auto Logout
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVisible(false)}
              className="h-6 w-6 p-0"
            >
              <EyeOff className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-gray-600 mb-1">Ora curentă:</p>
            <Badge variant="outline" className="font-mono text-xs">
              {currentTime.toLocaleTimeString('ro-RO')}
            </Badge>
          </div>
          
          <div>
            <p className="text-xs text-gray-600 mb-1">Timp până la logout automat (02:00):</p>
            <div className="flex gap-1">
              <Badge variant="secondary" className="font-mono text-xs">
                {timeUntil2AM.hours}h
              </Badge>
              <Badge variant="secondary" className="font-mono text-xs">
                {timeUntil2AM.minutes}m
              </Badge>
              <Badge variant="secondary" className="font-mono text-xs">
                {timeUntil2AM.seconds}s
              </Badge>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-600 mb-1">Status utilizator:</p>
            <Badge variant="default" className="text-xs">
              {userData?.displayName || "Necunoscut"} ({userData?.role})
            </Badge>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleTestLogout}
              className="flex-1 text-xs"
            >
              Test Logout
            </Button>
          </div>

          <div className="text-xs text-gray-500 text-center">
            💡 Logout automat se activează la 02:00
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 