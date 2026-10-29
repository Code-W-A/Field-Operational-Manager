/** Fictitious input shared by offer validation and isolated route tests. */
export function completeOffer() {
  return {
    opportunityId: "test-opportunity", recipientEmail: "client@example.test", subject: "Ofertă", message: "Bună ziua,",
    pdfUrl: "https://example.test/offer.pdf", pdfStoragePath: "test/offer.pdf",
    snapshot: {
      validityText: "30 de zile de la emitere", conditions: ["Plata: conform contract"], comments: "Comentariu intern secret",
      vatPercent: 21, adjustmentPercent: 0, subtotal: 100, total: 100,
      products: [{ id: "p1", name: "Montaj", um: "buc", quantity: 1, price: 100, total: 100 }],
      optionalProducts: [] as Record<string, unknown>[],
    },
  }
}
