"use client";
import { InvoiceCommercialSettings } from "./invoice-commercial-settings";
import { InvoiceIssuerSettings } from "./invoice-issuer-settings";
import { SagaReferences } from "./saga-references";
import { UserInvoiceNumberingSettings } from "./user-invoice-numbering-settings";
import { SagaClientsImport } from "./saga-clients-import";
import { SagaCatalogSettings } from "./saga-catalog";
export default function SagaAdvanced() {
  return (
    <>
      <SagaCatalogSettings />
      <SagaClientsImport />
      <SagaReferences />
      <InvoiceCommercialSettings />
      <UserInvoiceNumberingSettings correctionsOnly />
      <InvoiceIssuerSettings />
    </>
  );
}
