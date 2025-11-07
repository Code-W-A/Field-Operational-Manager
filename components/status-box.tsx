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

export function StatusBox({ title, count, colorClass, footer, children, heightClass = "h-[341px]" }: StatusBoxProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base">
          <div className="flex items-start justify-between w-full gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="truncate flex-1 cursor-help">{title}</span>
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


