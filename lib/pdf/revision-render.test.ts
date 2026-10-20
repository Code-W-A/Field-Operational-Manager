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

test("technician revision PDFs show the equipment name even when equal to its code, but hide the code field", async () => {
  const work = { id: "work", client: "Client test", locatie: "Sediu", nrLucrare: "TEST", tipLucrare: "Revizie",
    revision: { equipment: [{ equipmentId: "eq", equipmentName: "ADMIN-UP1", equipmentCode: "ADMIN-UP1", model: "Ușă pietonală" }] } };
  const revision = { id: "eq", equipmentId: "eq", equipmentName: "ADMIN-UP1", equipmentCode: "ADMIN-UP1",
    sections: [{ id: "s", title: "Canat mobil", items: [{ id: "i", label: "Verificare integritate", state: "functional" as const }] }] };
  for (const variant of ["equipment", "operations", "empty"] as const) {
    for (const hidden of [true, false]) {
      const texts: string[] = [];
      const event = ["initialized", function (this: jsPDF) {
        const original = this.text;
        this.text = function (this: jsPDF, ...args: any[]) {
          texts.push(Array.isArray(args[0]) ? args[0].join(" ") : String(args[0]));
          return (original as any).apply(this, args);
        } as typeof original;
      }];
      (jsPDF.API.events as any).push(event);
      let blob: Blob;
      try {
        blob = variant === "operations"
          ? await renderRevisionOperationsPDF("work", work, [revision], null, null, { hideEquipmentIdentity: hidden })
          : await renderRevisionEquipmentPDF("work", "eq", work, variant === "empty" ? null : revision, null, null, { hideEquipmentIdentity: hidden });
      } finally {
        const events = jsPDF.API.events as any;
        events.splice(events.indexOf(event), 1);
      }
      assert.equal(texts.some(text => text.includes("ADMIN-UP1")), true, `${variant}: raw equipment name/code visibility`);
      assert.equal(texts.some(text => text.includes("Cod unic:")), !hidden, `${variant}: code field visibility`);
      assert(texts.some(text => text.includes("Client test")));
      assert(texts.some(text => text.includes("Sediu")));
      if (hidden && variant === "equipment") {
        await mkdir("tmp/pdfs", { recursive: true });
        await writeFile("tmp/pdfs/revision-technician-no-code.pdf", Buffer.from(await blob.arrayBuffer()));
      }
    }
  }
});
