import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseStockSituation,
  stockSituationPeriod,
} from "./stock-situation.server";
const period = { start: "2026-01-01", end: "2026-11-11" };
const row = (code = "00001") =>
  `<LinieSituatieXML><GESTIUNE>0005</GESTIUNE><DEN_GEST>Depozit &amp; marfă</DEN_GEST><COD_ART>${code}</COD_ART><DENUMIRE>Piuliță</DENUMIRE><UM>BUC</UM><TIP>01</TIP><DEN_TIP>Mărfuri</DEN_TIP><TVA>0</TVA><CANT_FIN>0.5000</CANT_FIN><DISPONIBIL>0</DISPONIBIL></LinieSituatieXML>`;
test("stock report preserves decimal strings, zeroes, codes, diacritics and real-report size", () => {
  const xml = `<Situatie>${Array.from({ length: 4641 }, (_, i) => row(String(i).padStart(8, "0")).replace("</LinieSituatieXML>", `<TEXT_SUPL>${"x".repeat(500)}</TEXT_SUPL></LinieSituatieXML>`)).join("")}</Situatie>`;
  assert.ok(Buffer.byteLength(xml) > 3606911);
  const parsed = parseStockSituation(xml, period, "now", []);
  assert.equal(parsed.rows.length, 4641);
  assert.deepEqual(parsed.rows[0], {
    code: "00000000",
    name: "Piuliță",
    typeCode: "01",
    typeName: "Mărfuri",
    warehouseCode: "0005",
    warehouseName: "Depozit & marfă",
    unit: "BUC",
    vat: "0",
    quantity: "0.5000",
    available: "0",
  });
});
test("stock report rejects missing quantities, entities, invalid values and contradictory duplicates", () => {
  for (const xml of [
    "<invalid/>",
    `<Situatie>${row().replace("0.5000", "wrong")}</Situatie>`,
    `<Situatie>${row().replace("<CANT_FIN>0.5000</CANT_FIN>", "")}</Situatie>`,
    `<Situatie>${row()}${row()}</Situatie>`,
    '<!DOCTYPE x [<!ENTITY q "bad">]><Situatie/>',
  ])
    assert.throws(() => parseStockSituation(xml, period, "now", []));
  assert.deepEqual(
    parseStockSituation("<Situatie/>", period, "now", []).rows,
    [],
  );
});
test("report accepts namespaces and uses Bucharest calendar year", () => {
  assert.equal(
    parseStockSituation(
      `<s:Situatie xmlns:s="x">${row()}</s:Situatie>`,
      period,
      "now",
      [],
    ).rows[0].code,
    "00001",
  );
  assert.deepEqual(stockSituationPeriod(Date.parse("2025-12-31T22:30:00Z")), {
    start: "2026-01-01",
    end: "2026-01-01",
  });
});

test("missing unit in report is retained for authoritative GetArticol validation", () => {
  const report = parseStockSituation(
    `<Situatie>${row().replace("<UM>BUC</UM>", "<UM/>")}</Situatie>`,
    period,
    "now",
    [],
  );
  assert.equal(report.rows[0].unit, "");
});
