export function getEquipmentStatusClass(status: string): string {
  switch (status?.toLowerCase()) {
    case "funcțional":
    case "functional":
      return "bg-green-500 hover:bg-green-600"
    case "defect":
      return "bg-red-500 hover:bg-red-600"
    case "în service":
    case "in service":
      return "bg-amber-500 hover:bg-amber-600"
    case "în mentenanță":
    case "in mentenanta":
      return "bg-blue-500 hover:bg-blue-600"
    default:
      return "bg-slate-500 hover:bg-slate-600"
  }
}
