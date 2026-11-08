/** Isolated fixtures only. No external HTTP, no SAGA, no credentials. */
import type { Firestore } from "firebase-admin/firestore";
import type { InvoiceContent } from "./draft";
import { createEurRateService } from "./eur-rate.server";
import { eurRateHandlers } from "./eur-rate-http";
export const withEurOmitted = (content: InvoiceContent): InvoiceContent => ({
  ...content,
  eurReference: { status: "omitted", requestedDate: content.date },
});
export function bnrXmlFixture(
  rows: { date: string; value: string }[],
  prefix = "",
) {
  const tag = (s: string) => (prefix ? prefix + ":" + s : s);
  return `<?xml version="1.0"?><${tag("DataSet")} ${prefix ? `xmlns:${prefix}` : "xmlns"}="http://www.bnr.ro/xsd"><${tag("Body")}><${tag("OrigCurrency")}>RON</${tag("OrigCurrency")}>${rows.map((r) => `<${tag("Cube")} date="${r.date}"><${tag("Rate")} currency="EUR">${r.value}</${tag("Rate")}></${tag("Cube")}>`).join("")}</${tag("Body")}></${tag("DataSet")}>`;
}
export function eurFixtureHandlers(
  db: Firestore,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  const service = createEurRateService(db, {
    now: () => new Date("2026-11-08T12:00:00Z"),
    fetch: async (input) => {
      const url = String(input);
      if (!url.startsWith("https://curs.bnr.ro/"))
        throw Error("Unexpected fixture host");
      const year = Number(url.match(/nbrfxrates(\d{4})\.xml/)?.[1] || 2026);
      return new Response(
        bnrXmlFixture([
          { date: `${year}-01-02`, value: "5.0000" },
          ...(year === 2026
            ? [{ date: "2026-11-06", value: "5.1234" }]
            : [{ date: `${year}-12-31`, value: "5.1111" }]),
        ]),
        { headers: { "Content-Type": "text/xml" } },
      );
    },
  });
  return eurRateHandlers(service, authenticate);
}
