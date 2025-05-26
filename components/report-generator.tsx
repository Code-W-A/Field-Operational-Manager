import type React from "react"

interface Lucrare {
  id: number
  dataInterventie: string
  dataSosire: string
  oraSosire: string
  oraPlecare: string
  descriere: string
  rezolvare: string
  materiale: string
  costTotal: number
  tehnician: string
  client: string
}

interface ReportGeneratorProps {
  lucrare: Lucrare
}

const ReportGenerator: React.FC<ReportGeneratorProps> = ({ lucrare }) => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Raport de Intervenție</h1>

      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Detalii Intervenție</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex justify-between">
              <span className="font-semibold">Data Intervenție:</span>
              <span>{lucrare.dataInterventie || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Sosire:</span>
              <span>
                {lucrare.dataSosire || lucrare.dataInterventie} - {lucrare.oraSosire || "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Plecare:</span>
              <span>
                {lucrare.dataSosire || lucrare.dataInterventie} - {lucrare.oraPlecare || "N/A"}
              </span>
            </div>
          </div>
          <div>
            <div className="flex justify-between">
              <span className="font-semibold">Tehnician:</span>
              <span>{lucrare.tehnician || "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold">Client:</span>
              <span>{lucrare.client || "N/A"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Descriere Problemă</h2>
        <p>{lucrare.descriere || "N/A"}</p>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Rezolvare</h2>
        <p>{lucrare.rezolvare || "N/A"}</p>
      </div>

      <div className="mb-4">
        <h2 className="text-xl font-semibold mb-2">Materiale Folosite</h2>
        <p>{lucrare.materiale || "N/A"}</p>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-2">Cost Total</h2>
        <p>{lucrare.costTotal || "N/A"} RON</p>
      </div>
    </div>
  )
}

export default ReportGenerator
