/**
 * Returns the appropriate CSS classes for a given work order status
 * @param status The work order status
 * @returns CSS classes for styling the status badge
 */
export function getWorkStatusClass(status: string): string {
  switch (status) {
    case "Listată":
      return "bg-blue-100 text-blue-800 border-blue-200"
    case "Atribuită":
      return "bg-purple-100 text-purple-800 border-purple-200"
    case "În lucru":
      return "bg-amber-100 text-amber-800 border-amber-200"
    case "Finalizat":
      return "bg-green-100 text-green-800 border-green-200"
    case "Anulat":
      return "bg-red-100 text-red-800 border-red-200"
    case "În așteptare":
      return "bg-gray-100 text-gray-800 border-gray-200"
    case "Necesită ofertă":
      return "bg-indigo-100 text-indigo-800 border-indigo-200"
    case "Ofertă acceptată":
      return "bg-teal-100 text-teal-800 border-teal-200"
    case "Ofertă respinsă":
      return "bg-rose-100 text-rose-800 border-rose-200"
    case "Amânată":
      return "bg-violet-100 text-violet-800 border-violet-200"
    default:
      return "bg-gray-100 text-gray-800 border-gray-200"
  }
}
