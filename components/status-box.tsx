"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface StatusBoxProps {
  title: string
  count?: number
  colorClass?: string
  footer?: string
  children?: React.ReactNode
  heightClass?: string
}

export function StatusBox({ title, count, colorClass, footer, children, heightClass = "h-[625px]" }: StatusBoxProps) {
  return (
    <Card className="flex flex-col h-full min-w-0 overflow-hidden">
      <CardHeader className="py-3 px-4 flex-shrink-0 min-w-0 overflow-hidden">
        <CardTitle className="text-base min-w-0">
          <div className="flex items-start justify-between w-full gap-2 min-w-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate flex-1 cursor-help min-w-0 block">{title}</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{title}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {count !== undefined && (
              <span className="font-semibold text-base flex-shrink-0 text-right min-w-[2.5rem]">{count}</span>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        <ScrollArea className={`${heightClass} w-full flex-1 min-w-0`}>
          <div 
            className="w-full min-w-0"
            style={{
              minWidth: 0,
              maxWidth: "100%",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              paddingRight: "16px",
              paddingLeft: "0px",
            }}
          >
            {children}
          </div>
        </ScrollArea>
        {footer && (
          <div className="pt-3 text-center border-t mt-3 flex-shrink-0">
            <span className="text-sm font-bold text-foreground">{footer}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
