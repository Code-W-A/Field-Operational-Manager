import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { jsPDF } from "jspdf";
import { renderServiceReport } from "./service-report";

const types = ["Pregătire în atelier", "Instalare", "Predare", "Intervenție în garanție",
  "Intervenție contra cost", "Intervenție în contract", "Re-Intervenție", "Revizie"];

for (const type of types) {
  test(`service report keeps both signature images and proportions: ${type}`, async () => {
    const images: Array<{ data: string; x: number; y: number; width: number; height: number }> = [];
    const technician = await sharp(Buffer.from('<svg width="300" height="180"><path d="M10 160 L60 20 L100 140 L270 50" stroke="black" fill="none" stroke-width="3"/></svg>')).png().toBuffer();
    // Optionally use the actual PNG exported by the Expo modal browser test.
    const beneficiary = process.env.FOM_SIGNATURE_PNG
      ? await readFile(process.env.FOM_SIGNATURE_PNG)
      : await sharp(Buffer.from('<svg width="120" height="300"><path d="M10 280 L60 20 L100 250" stroke="black" fill="none" stroke-width="3"/></svg>')).png().toBuffer();
    const techUrl = `data:image/png;base64,${technician.toString("base64")}`;
    const benefUrl = `data:image/png;base64,${beneficiary.toString("base64")}`;
    const event: [string, (this: jsPDF) => void] = ["initialized", function () {
      const original = this.addImage;
      this.addImage = function (this: jsPDF, ...args: any[]) {
        if (args[0] === techUrl || args[0] === benefUrl)
          images.push({ data: args[0], x: args[2], y: args[3], width: args[4], height: args[5] });
        return (original as any).apply(this, args);
      } as typeof original;
    }];
    (jsPDF.API.events as any).push(event);
    try {
      const doc = await renderServiceReport({ id: "test", client: "Client de test", locatie: "Locație de test", tipLucrare: type,
        products: [], numeTehnician: "Tehnician Test", numeBeneficiar: "Beneficiar Test",
        semnaturaTehnician: techUrl, semnaturaBeneficiar: benefUrl }, { image: async () => null, revisions: async () => [] });
      assert.equal(images.length, 2);
      for (const [index, bytes] of [technician, beneficiary].entries()) {
        const size = await sharp(bytes).metadata();
        assert(Math.abs(images[index].width / images[index].height - size.width! / size.height!) < 1e-9);
        assert(images[index].height <= 14);
        assert(images[index].width <= 100);
      }
      assert.equal(images[0].data, techUrl, "technician image remains exact");
      assert.equal(images[1].data, benefUrl, "beneficiary image remains exact");
      if (process.env.FOM_SIGNATURE_PDF_DIR && type === "Intervenție contra cost") {
        await mkdir(process.env.FOM_SIGNATURE_PDF_DIR, {recursive:true});
        await writeFile(`${process.env.FOM_SIGNATURE_PDF_DIR}/report.pdf`, Buffer.from(doc.output("arraybuffer")));
      }
    } finally {
      const events = jsPDF.API.events as any[];
      events.splice(events.indexOf(event), 1);
    }
  });
}
