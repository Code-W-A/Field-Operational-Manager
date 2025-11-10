"use client"

import { ChevronRight, Home, Folder } from "lucide-react"
import type { Setting } from "@/types/settings"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SettingsBreadcrumbsProps {
  currentPath: Setting[]
  onNavigate: (parentId: string | null) => void
}

export function SettingsBreadcrumbs({ currentPath, onNavigate }: SettingsBreadcrumbsProps) {
  return (
    <nav className="flex items-center flex-wrap gap-1 text-sm bg-muted/30 p-3 rounded-lg border">
      <button
        onClick={() => onNavigate(null)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-background hover:text-foreground transition-all font-medium"
      >
        <Home className="h-4 w-4" />
        <span>Setări</span>
      </button>

      {currentPath.map((setting, index) => (
        <div key={setting.id} className="flex items-center">
          <ChevronRight className="h-4 w-4 mx-0.5 text-muted-foreground" />
          <button
            onClick={() => onNavigate(setting.id)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-all",
              index === currentPath.length - 1
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "hover:bg-background hover:text-foreground text-muted-foreground"
            )}
          >
            <Folder className="h-3.5 w-3.5" />
            <span>{setting.name}</span>
          </button>
        </div>
      ))}
    </nav>
  )
}

