export interface Lucrare {
  id?: string
  denumire: string
  descriere: string
  status: "noua" | "in lucru" | "finalizata" | "blocata"
  echipaId: string
  dataCreare: string // Format: dd-MM-yyyy
  dataFinalizareEstimata?: string // Format: dd-MM-yyyy
  dataFinalizareRealizata?: string // Format: dd-MM-yyyy
  prioritate: "scazuta" | "medie" | "ridicata"
  verificareEchipamentElectric?: boolean
  verificareEchipamentMecanic?: boolean
  verificareEchipamentHidraulic?: boolean
  verificareEchipamentPneumatic?: boolean

  // Câmpuri pentru timpul de sosire
  dataSosire?: string // Format: dd-MM-yyyy
  oraSosire?: string // Format: HH:mm
  // Câmp pentru timpul de plecare
  oraPlecare?: string // Format: HH:mm
}
