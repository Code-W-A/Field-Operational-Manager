"use client"

import type React from "react"

import type { ReactNode } from "react"
import Link from "next/link"

interface SafeLinkProps {
  href: string
  children: ReactNode
  className?: string
  onNavigate: (url: string) => boolean
  [key: string]: any // For any other props that might be passed
}

export function SafeLink({ href, children, className, onNavigate, ...props }: SafeLinkProps) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If the navigation handler returns false, prevent the default navigation
    if (!onNavigate(href)) {
      e.preventDefault()
    }
  }

  return (
    <Link href={href} className={className} onClick={handleClick} {...props}>
      {children}
    </Link>
  )
}
