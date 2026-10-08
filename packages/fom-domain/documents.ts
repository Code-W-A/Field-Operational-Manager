/** Signed document identity and product contracts originating in Next.js. */
export type DocumentClientSnapshot = {
  version: 1;
  clientId: string;
  client: string;
  locatie: string;
  persoanaContact: string;
  telefon: string;
  persoanaContactEmail: string;
  clientInfo: {
    nume: string;
    cui: string;
    rc: string;
    adresa: string;
    locationName: string;
    locationAddress: string;
  };
};

export interface OfferResponseCertifiedPdf {
  action: "accept" | "reject";
  actedAt: string;
  verifiedEmail: string;
  reason?: string;
  renderedProofText: string;
  storagePath: string;
  filename: string;
  mime: "application/pdf";
  size: number;
  generatedAt: string;
  sourceVersion?: string;
}
