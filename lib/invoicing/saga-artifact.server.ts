import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { normalizeTaxId } from "@/lib/saga/clients";
import { calculateInvoiceTotals, parseInvoiceContent } from "./draft";
import { calculateXmlLines, type PreparedInvoice } from "./xml";
import { TransferError, decimalSum, stockGroups } from "./saga-transfer";
export const digest = (v: string) =>
  createHash("sha256").update(v, "utf8").digest("hex");
export function verifyInvoiceArtifact(
  doc: PreparedInvoice,
  artifact: { xml?: unknown; sha256?: unknown },
  fiscalCode: string,
) {
  const fail = () =>
    new TransferError(
      "INVALID_ARTIFACT",
      "Factura sau XML-ul înghețat necesită verificare.",
      409,
    );
  if (
    doc.fiscalCode !== fiscalCode ||
    doc.snapshot.fiscalCode !== fiscalCode ||
    typeof artifact.xml !== "string" ||
    Buffer.byteLength(artifact.xml, "utf8") > 512 * 1024 ||
    artifact.sha256 !== doc.sha256 ||
    digest(artifact.xml) !== doc.sha256
  )
    throw fail();
  const content = parseInvoiceContent(doc.snapshot.content);
  content.lines.forEach((line, i) => {
    if (!line.saga || !doc.snapshot.content.lines[i]?.saga?.snapshot)
      throw fail();
    line.saga.snapshot = doc.snapshot.content.lines[i].saga!.snapshot;
  });
  const totals = calculateInvoiceTotals(content),
    lines = calculateXmlLines(content);
  if (
    totals.incomplete ||
    !isDeepStrictEqual(totals, doc.snapshot.totals) ||
    !isDeepStrictEqual(lines, doc.snapshot.lines)
  )
    throw fail();
  const money = (n: number) =>
    `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
  const xml = artifact.xml;
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw fail();
  const parsed = new XMLParser({
    parseTagValue: false,
    ignoreAttributes: true,
    isArray: (name) => name === "Factura" || name === "Linie",
  }).parse(xml);
  const invoices = parsed?.Facturi?.Factura;
  if (!Array.isArray(invoices) || invoices.length !== 1) throw fail();
  const invoice = invoices[0],
    header = invoice.Antet,
    xmlLines = invoice.Detalii?.Continut?.Linie;
  if (
    !header ||
    normalizeTaxId(header.FurnizorCIF, "RO") !== fiscalCode ||
    header.FacturaNumar !== doc.number ||
    header.FacturaData !== content.date.split("-").reverse().join(".") ||
    (content.commercial &&
      (header.FacturaAgent !== doc.snapshot.agent?.code ||
        header.FacturaScadenta !==
          content.dueDate.split("-").reverse().join(".") ||
        header.FacturaInformatiiSuplimentare !==
          `Tichet ${doc.snapshot.ticketNumber}; referință FOM ${doc.workId}${content.extraInfo ? "; " + content.extraInfo : ""}`)) ||
    header.Cod !== doc.snapshot.clientCode ||
    header.GUID_cod_client !== doc.snapshot.clientId ||
    invoice.GUID_factura !== doc.workId ||
    !Array.isArray(xmlLines) ||
    xmlLines.length !== lines.length
  )
    throw fail();
  for (let i = 0; i < lines.length; i++) {
    const x = xmlLines[i],
      l = lines[i];
    if (
      x.CodArticolClient !== l.code ||
      x.GUID_cod_articol !== l.productId ||
      x.UM !== l.unit ||
      decimalSum(x.Cantitate, l.quantity, true) !== "0" ||
      decimalSum(x.Pret, l.unitPrice, true) !== "0" ||
      decimalSum(x.Valoare, money(l.baseCents), true) !== "0" ||
      decimalSum(x.TVA, money(l.vatCents), true) !== "0" ||
      (content.commercial &&
        (decimalSum(x.ProcTVA, l.vatPercent!, true) !== "0" ||
          (x.InformatiiSuplimentare || "") !== (l.extraInfo || ""))) ||
      (l.kind === "goods"
        ? x.Gestiune !== l.warehouseCode
        : x.Gestiune !== undefined)
    )
      throw fail();
  }
  stockGroups(doc);
  return { xml, filename: doc.filename };
}
