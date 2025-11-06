"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface StatusBoxProps {
  title: string
  count?: number
  colorClass?: string
  footer?: string
  children?: React.ReactNode
  heightClass?: string
}

export function StatusBox({ title, count, colorClass, footer, children, heightClass = "h-64" }: StatusBoxProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3">
        <CardTitle className="text-base truncate">
          <div className="flex items-center gap-4">
            <span className="truncate">{title}</span>
            {count !== undefined && (
              <>
                <span className="text-gray-300">|</span>
                <span className="font-semibold text-base">{count}</span>
              </>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <ScrollArea className={`${heightClass} w-full`}>
          <div className="space-y-2 pr-4">{children}</div>
        </ScrollArea>
        {footer && (
          <div className="pt-3 text-center border-t mt-3">
            <span className="text-sm font-bold text-foreground">{footer}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


