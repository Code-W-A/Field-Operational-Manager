import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-blue-700">Sistem Management Lucrări</h1>
          <p className="mt-2 text-gray-600">Autentificați-vă pentru a continua</p>
        </div>
        <div className="mt-8 space-y-4">
          <Link href="/dashboard" className="w-full">
            <Button className="w-full bg-blue-600 hover:bg-blue-700">Autentificare</Button>
          </Link>
          <div className="text-center text-sm text-gray-500">
            <p>Sistem de management pentru operațiuni de service</p>
          </div>
        </div>
      </div>
    </div>
  )
}
