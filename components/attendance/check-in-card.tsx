// This file exports the CheckInCard component that was used as the design reference
// It's now superseded by FieldCheckInCard for technicians and KioskCheckIn for office
// Keeping this for reference or potential future unified use

"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, StopCircle, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckInCardProps {
  employeeName: string;
  currentStatus: "idle" | "checked_in" | "checked_out" | "processing";
  lastCheckInTime?: string;
  lastCheckOutTime?: string;
  onCheckIn: () => void;
  onCheckOut: () => void;
  isKioskMode?: boolean;
  isTechnicianMode?: boolean;
}

export function CheckInCard({
  employeeName,
  currentStatus,
  lastCheckInTime,
  lastCheckOutTime,
  onCheckIn,
  onCheckOut,
  isKioskMode = false,
  isTechnicianMode = false,
}: CheckInCardProps) {
  const isCheckedIn = currentStatus === "checked_in";
  const isProcessing = currentStatus === "processing";

  return (
    <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-slate-700 via-slate-600 to-slate-500 text-white animate-in fade-in duration-500">
      {/* Decorative circles */}
      <div className="absolute top-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mt-12 animate-pulse" />
      <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -mr-10 -mt-10 animate-pulse" style={{ animationDelay: "1s" }} />
      
      {/* Worker icon in bottom right */}
      <div className="absolute bottom-2 right-2 opacity-20 pointer-events-none">
        <img 
          src="/worker-image.png" 
          alt="" 
          className="h-24 w-24 object-contain"
        />
      </div>

      <CardHeader className="pb-3 relative z-10">
        <CardTitle className="text-xl font-bold animate-in slide-in-from-top duration-700">
          Pontaj Tehnician
        </CardTitle>
        <CardDescription className="text-slate-200">
          {isKioskMode ? "Mod Kiosk (Birou)" : "Mod Tehnician (Mașină)"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 relative z-10">
        <div className="flex items-center gap-3 animate-in slide-in-from-left duration-700" style={{ animationDelay: "200ms" }}>
          <div className="h-12 w-12 rounded-full bg-white/25 flex items-center justify-center text-white font-bold text-lg shadow-md backdrop-blur-sm">
            {employeeName.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold">{employeeName}</p>
            <p className="text-sm text-slate-200">
              Status:{" "}
              {isCheckedIn ? (
                <span className="text-emerald-300 font-medium">CHECKED IN</span>
              ) : (
                <span className="text-orange-300 font-medium">CHECKED OUT</span>
              )}
            </p>
          </div>
        </div>

        {/* Single button that switches between PLAY and STOP */}
        <div className="animate-in slide-in-from-bottom duration-700" style={{ animationDelay: "400ms" }}>
          {!isCheckedIn ? (
            <Button
              className="w-full h-16 text-xl font-bold shadow-lg transition-all duration-300 hover:scale-105 bg-emerald-500 hover:bg-emerald-600"
              onClick={onCheckIn}
              disabled={isProcessing}
            >
              <Play className="mr-2 h-6 w-6" />
              PLAY
            </Button>
          ) : (
            <Button
              className="w-full h-16 text-xl font-bold shadow-lg transition-all duration-300 hover:scale-105 bg-orange-500 hover:bg-orange-600"
              onClick={onCheckOut}
              disabled={isProcessing}
            >
              <StopCircle className="mr-2 h-6 w-6" />
              STOP
            </Button>
          )}
        </div>

        {lastCheckInTime && (
          <p className="text-xs text-slate-200 text-center animate-in fade-in duration-1000" style={{ animationDelay: "600ms" }}>
            Ultimul Check-in: {lastCheckInTime}
          </p>
        )}
        {lastCheckOutTime && (
          <p className="text-xs text-slate-200 text-center animate-in fade-in duration-1000" style={{ animationDelay: "600ms" }}>
            Ultimul Check-out: {lastCheckOutTime}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
