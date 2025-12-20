"use client"

import { cn } from "@/lib/utils"

export function ClampedText({
  text,
  lines = 4,
  className,
}: {
  text?: string | null
  lines?: number
  className?: string
}) {
  const value = (text ?? "").trim()
  if (!value) return <span className={cn("text-muted-foreground", className)}>-</span>

  return (
    <div
      className={cn(
        // Prevent horizontal overflow in table cells even for very long tokens / no-spaces strings
        "min-w-0 w-full max-w-full break-words whitespace-pre-wrap",
        className,
      )}
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: lines,
        overflow: "hidden",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
      title={value}
    >
      {value}
    </div>
  )
}


