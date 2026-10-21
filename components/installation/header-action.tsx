"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function InstallationHeaderAction({
  label,
  reason,
  children,
}: {
  label: string;
  reason?: string | string[];
  children: ReactNode;
}) {
  const reasons = (typeof reason === "string" ? [reason] : reason || []).filter(
    Boolean,
  );
  return (
    <div className="relative inline-flex shrink-0">
      {children}
      {reasons.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`De ce este indisponibil: ${label}`}
              className="absolute -right-1 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Info className="h-3 w-3" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 text-sm">
            {reasons.length === 1 ? (
              <p>{reasons[0]}</p>
            ) : (
              <ul className="list-disc space-y-1 pl-4">
                {reasons.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
