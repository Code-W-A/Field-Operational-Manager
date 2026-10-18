import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { jsPDF } from "jspdf";
import { checklistFromSettings, validateRevision } from "../../packages/fom-domain";
import { renderRevisionEquipmentPDF, renderRevisionOperationsPDF } from "./revision-render";

test("both revision PDFs show only the immediate parent with terminal checks and wrap long titles", async () => {
  const checklist = checklistFromSettings([
    { id: "root", name: "Fișă ușă" },
    { id: "assembly", parentId: "root", type: "variable", name: "Ansamblu ușă" },
    { id: "parent", parentId: "assembly", type: "variable", name: "Canat mobil" },
    { id: "integrity", parentId: "parent", type: "variable", name: "Verificare integritate canat mobil" },
    { id: "glass", parentId: "parent", type: "variable", name: "Verificare sticlă" },
    { id: "corners", parentId: "parent", type: "variable", name: "Verificare colțare de îmbinare" },
    { id: "long", parentId: "parent", type: "variable", name: "Verificare detaliată a elementelor de îmbinare și a suprafețelor exterioare ".repeat(4) },
    { id: "other", parentId: "long", type: "variable", name: "Verificare finisaj" },
  ], "root");
  const sections = validateRevision(checklist.map(s => ({ ...s, items: s.items.map(i => ({ ...i, state: "functional" as const })) })), checklist);
  const revision = { id: "eq", equipmentId: "eq", equipmentName: "Ușă", sections };
  const work = { id: "work", client: "Client test", locatie: "Sediu", nrLucrare: "TEST", tipLucrare: "Revizie", echipament: "Ușă" };
  await mkdir("tmp/pdfs", { recursive: true });
  for (const variant of ["equipment", "operations"]) {
    const texts: Array<{ text: string; x: number; y: number }> = [];
    const event = ["initialized", function (this: jsPDF) {
      const original = this.text;
      this.text = function (this: jsPDF, ...args: any[]) {
        if (typeof args[1] === "number") texts.push({ text: Array.isArray(args[0]) ? args[0].join(" ") : String(args[0]), x: args[1], y: args[2] });
        return (original as any).apply(this, args);
      } as typeof original;
    }];
    (jsPDF.API.events as any).push(event);
    let blob: Blob;
    try {
      blob = variant === "equipment"
        ? await renderRevisionEquipmentPDF("work", "eq", work, revision, null, null)
        : await renderRevisionOperationsPDF("work", work, [revision], null, null);
    } finally {
      const events = jsPDF.API.events as any;
      events.splice(events.indexOf(event), 1);
    }
    const parent = texts.find(t => t.text === "Canat mobil");
    const leaf = texts.find(t => t.text === "Verificare integritate canat mobil");
    assert(parent && leaf);
    assert(parent.y < leaf.y);
    assert.equal(texts.filter(t => t.text === "Canat mobil").length, 1);
    assert.equal(texts.some(t => t.text === "Ansamblu ușă"), false);
    assert(texts.some(t => t.text === "Verificare sticlă"));
    assert(texts.some(t => t.text === "Verificare colțare de îmbinare"));
    assert(texts.some(t => t.text.includes("Verificare detaliată")));
    assert(texts.every(t => t.y < 297), "all text fits on the page");
    await writeFile(`tmp/pdfs/revision-hierarchy-${variant}.pdf`, Buffer.from(await blob.arrayBuffer()));
  }
});
