import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { jsPDF } from "jspdf";
import { renderInstallationPdf } from "./installation-render";
import { renderServiceReport } from "./service-report";
import type { InstallationDocument } from "@/types/installation";

for (const scenario of ["sheet", "long-sheet", "completion", "short-completion"] as const) {
  test(`installation PDF layout: ${scenario}`, async () => {
    const signature = `data:image/png;base64,${(await sharp(Buffer.from('<svg width="300" height="100"><path d="M15 70 Q50 0 65 60 T120 45 T175 65 L275 40" fill="none" stroke="#152450" stroke-width="3"/></svg>')).png().toBuffer()).toString("base64")}`;
    const landscape = await sharp({ create: { width: 900, height: 300, channels: 3, background: "#49649b" } }).jpeg().toBuffer();
    const portrait = await sharp({ create: { width: 300, height: 900, channels: 3, background: "#dce6f4" } }).png().toBuffer();
    const logoDataUrl = `data:image/png;base64,${(await readFile("public/nrglogo.png")).toString("base64")}`;
    const long = scenario === "long-sheet" || scenario === "completion";
    const isSheet = scenario === "sheet" || scenario === "long-sheet";
    const snapshot: InstallationDocument = {
      client: { version: 1, clientId: "example", client: "Beneficiar exemplu SRL", locatie: "Locație București", persoanaContact: "", telefon: "", persoanaContactEmail: "",
        clientInfo: { nume: "", cui: "RO123456", rc: "", adresa: "Strada Științei nr. 10, București", locationName: "", locationAddress: "Șoseaua Instalației nr. 24" } },
      workNumber: "#001234", workDate: "17.10.2026",
      equipment: [{ id: "eq", name: "Barieră acces", code: "EQ-123", model: "Model exemplu" }],
      technicianName: "Ștefan Ionescu", beneficiaryName: "Andreea Șerban",
      technicianSignature: signature, beneficiarySignature: signature,
      principalName: "Ștefan Ionescu",
      timeIntervals: [{uid: "p", startedAt: "2026-10-17T05:30:00Z", endedAt: "2026-10-17T07:15:00Z"}, {uid: "s", startedAt: "2026-10-17T05:30:00Z", endedAt: "2026-10-17T06:30:00Z"}],
      participants: [{ uid: "p", name: "Ștefan Ionescu", role: "principal", active: true }, { uid: "s", name: "Mihai Popescu", role: "secondary", active: false, moved: true }],
      finding: "S-a verificat amplasamentul și alimentarea electrică. ".repeat(long ? 90 : 1),
      operations: "Montaj, reglaj și verificări de funcționare în siguranță. ".repeat(long ? 150 : 2),
      installationStatus: "blocked", blockReason: "Lipsește alimentarea permanentă.",
      observations: "Instalarea este finalizată. Beneficiarul a verificat funcționarea. ".repeat(long ? 100 : 1),
      sheetReferences: Array.from({ length: long ? 20 : 1 }, (_, i) => ({ workId: "work", sheetId: `sheet-${i}`, workDate: "17.10.2026", equipmentName: `Barieră ${i + 1}` })),
      photos: [{ id: "landscape", path: "", name: "Fotografie orizontală", contentType: "image/jpeg" }, { id: "portrait", path: "", name: "Fotografie verticală", contentType: "image/png" }],
    };
    const texts: Array<{ value: string; y: number; page: number }> = [];
    const images: Array<{ x: number; y: number; width: number; height: number }> = [];
    const event: [string, (this: jsPDF) => void] = ["initialized", function () {
      const text = this.text;
      const image = this.addImage;
      this.text = function (this: jsPDF, ...args: any[]) {
        texts.push({ value: String(args[0]), y: args[2], page: this.getNumberOfPages() });
        return (text as any).apply(this, args);
      } as typeof text;
      this.addImage = function (this: jsPDF, ...args: any[]) {
        images.push({ x: args[2], y: args[3], width: args[4], height: args[5] });
        return (image as any).apply(this, args);
      } as typeof image;
    }];
    (jsPDF.API.events as any).push(event);
    let doc: jsPDF;
    try {
      if (scenario === "short-completion") snapshot.photos = [];
      doc = await renderInstallationPdf(snapshot, "work", isSheet ? "sheet-1" : undefined, async photo => photo.id === "portrait" ? portrait : landscape, { logoDataUrl });
    } finally {
      const events = jsPDF.API.events as any;
      events.splice(events.indexOf(event), 1);
    }
    if (isSheet) {
      assert(texts.some(t => t.value.includes("1 h 45 min")));
      assert(texts.some(t => t.value.includes("2 h 45 min")));
    }
    const bottom = doc.internal.pageSize.getHeight() - 35;
    assert(texts.every(text => text.y <= bottom || text.y >= 279));
    assert(images.every(image => image.y + image.height <= bottom));
    assert(images.every(image => image.x >= 7 && image.x + image.width <= 203));
    assert.equal(images.length, snapshot.photos.length + 3, "logo, photos and two signatures");
    if (snapshot.photos.length) {
      for (const [index, ratio] of [[1, 3], [2, 1 / 3], [3, 3]]) assert(Math.abs(images[index].width / images[index].height - ratio) < 0.001);
    }
    const allText = texts.map(text => text.value).join("\n");
    for (const expected of ["Prestator", "Beneficiar", "Datele lucrării", "EQ-123", "Semnături", "Ștefan Ionescu", "Andreea Șerban"]) assert(allText.includes(expected), expected);
    if (isSheet) {
      for (const expected of ["Constatare la locație", "Operațiuni executate", "Blocat", snapshot.blockReason!, "a continuat pe altă fișă"]) assert(allText.includes(expected), expected);
    } else {
      assert(allText.includes(long ? "sheet-19" : "sheet-0"));
      assert(allText.includes("Observații finale"));
    }
    if (long) assert(doc.getNumberOfPages() > 2);
    assert.equal(texts.filter(text => text.value === "Website: www.nrg-acces.ro").length, doc.getNumberOfPages());
    const sectionTitles = new Set(["Datele lucrării", "Echipamente", "Echipa de montaj", "Constatare la locație", "Operațiuni executate", "Status instalare", "Terminarea lucrării", "Fișe de montaj aferente", "Observații finale", "Fotografii", "Semnături"]);
    texts.forEach((text, i) => {
      if (sectionTitles.has(text.value)) assert.equal(texts[i + 1].page, text.page, `${text.value} must stay with its content`);
    });
    if (process.env.FOM_INSTALLATION_PDF_DIR) {
      await mkdir(process.env.FOM_INSTALLATION_PDF_DIR, { recursive: true });
      await writeFile(path.join(process.env.FOM_INSTALLATION_PDF_DIR, `${scenario}.pdf`), Buffer.from(doc.output("arraybuffer")));
      if (scenario === "sheet") {
        const reference = await renderServiceReport({ client: snapshot.client.client, clientInfo: snapshot.client.clientInfo, locatie: snapshot.client.locatie, numarRaport: "1234", dataInterventie: "17.10.2026", products: [] }, { logo: logoDataUrl, image: async () => null, revisions: async () => [] });
        await writeFile(path.join(process.env.FOM_INSTALLATION_PDF_DIR, "reference.pdf"), Buffer.from(reference.output("arraybuffer")));
      }
    }
  });
}
