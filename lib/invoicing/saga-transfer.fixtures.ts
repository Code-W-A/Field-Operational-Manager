import { snapshotFixture } from "./xml.fixtures";
import { calculateInvoiceTotals } from "./draft";
import { calculateXmlLines } from "./xml";
import { invoiceXml, type PreparedInvoice } from "./xml";
import { digest } from "./saga-artifact.server";
export function preparedFixture(
  workId = "w",
  quantity = "1.25",
): PreparedInvoice {
  const s = snapshotFixture();
  s.workId = workId;
  s.generatorVersion = 2;
  s.content.lines[0].quantity = quantity;
  s.lines = calculateXmlLines(s.content);
  s.totals = calculateInvoiceTotals(s.content);
  const f = invoiceXml(s, "NRG000126");
  return {
    workId,
    fiscalCode: "123456",
    number: "NRG000126",
    state: "prepared_local",
    compatibility: "unverified",
    stock: "not_checked",
    snapshot: s,
    sha256: digest(f.xml),
    filename: f.filename,
    operationId: workId,
    preparedAt: "now",
    preparedBy: "admin",
  };
}
