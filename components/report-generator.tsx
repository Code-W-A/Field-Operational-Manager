"use client";

// ---------------------------------------------------------------------------
// ReportGenerator – PDF layout tweaked to match the handwritten NRG template
// ---------------------------------------------------------------------------
// 🔄  MAIN CHANGES (vs. previous version)
//   • Added the mandatory Next‑JS client directive ("use client").
//   • Inserted an exact‑size frame for the NRG logo between PRESTATOR and
//     BENEFICIAR boxes (expecting a Base‑64 PNG in lucrare.logoNRG).
//   • Dropped the internal "FIELD OPERATIONAL MANAGER / FOM" headings – they
//     do not exist in the scanned paper.
//   • Re‑arranged the meta section to show ONLY the four fields that appear on
//     the form (Data intervenţiei, Ora sosire, Ora plecare, Nr. Raport).
//   • Added rule‑lines inside the PRESTATOR and BENEFICIAR header boxes for the
//     same hand‑written look.
//   • Drew a large comment block (7 horizontal lines) for both “Constatare la
//     locaţie” and “Descriere intervenţie” exactly as in the scan.
//   • Adjusted spacing so everything fits on one page in portrait A4.
// ---------------------------------------------------------------------------

import { useState, forwardRef } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { Lucrare } from "@/lib/firebase/firestore";
import { useStableCallback } from "@/lib/utils/hooks";
import { toast } from "@/components/ui/use-toast";
import { ProductTableForm, type Product } from "./product-table-form";

interface ReportGeneratorProps {
  lucrare: Lucrare;
  onGenerate?: (pdf: Blob) => void;
}

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTION                               */
/* -------------------------------------------------------------------------- */

// jsPDF does not embed a full‑latin font by default; we strip Romanian
// diacritics so we can use the built‑in Helvetica.  Replace this with a custom
// TTF if you want to keep diacritics intact.
const removeDiacritics = (text: string): string =>
  text
    .replace(/ă/g, "a")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/ș/g, "s")
    .replace(/ț/g, "t")
    .replace(/Ă/g, "A")
    .replace(/Â/g, "A")
    .replace(/Î/g, "I")
    .replace(/Ș/g, "S")
    .replace(/Ț/g, "T");

/* -------------------------------------------------------------------------- */
/*                        LAYOUT CONSTANTS & UTILITIES                        */
/* -------------------------------------------------------------------------- */

// A4 portrait in jsPDF is 210 × 297 mm.
const PAGE_MARGIN = 20; // uniform margin
const CONTENT_W = 210 - 2 * PAGE_MARGIN; // 170 mm usable width

// DEVIZ table column widths – MUST sum to CONTENT_W
const TABLE_COL_WIDTHS = [10, 80, 15, 20, 22.5, 22.5] as const;
const getColX = (idx: number) => PAGE_MARGIN + TABLE_COL_WIDTHS.slice(0, idx).reduce((a, b) => a + b, 0);

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(
  ({ lucrare, onGenerate }, ref) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);

    /* -------------------------- PDF GENERATION CORE ------------------------- */
    const generatePDF = useStableCallback(async () => {
      if (!lucrare) return;
      setIsGenerating(true);
      try {
        const doc = new jsPDF({ format: "a4", unit: "mm" });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();

        /* ------------------------------------------------------------------ */
        /*                             PAGE HEADER                            */
        /* ------------------------------------------------------------------ */

        doc.setDrawColor(0).setLineWidth(0.2).setFont("helvetica");
        const headerBoxH = 38; // 38 mm matches the scan

        // PRESTATOR BOX ----------------------------------------------------
        const prestatorW = (CONTENT_W - 40) / 2; // leave 40‑mm gap for NRG logo
        doc.rect(PAGE_MARGIN, PAGE_MARGIN, prestatorW, headerBoxH, "S");

        // Title
        doc.setFontSize(10).setFont(undefined, "bold");
        doc.text("PRESTATOR", PAGE_MARGIN + prestatorW / 2, PAGE_MARGIN + 6, {
          align: "center",
        });

        // Horizontal rule lines for the 6 information rows inside
        const prestatorLines = [
          "SC. NRG Access Systems S.R.L.",
          "CUI: RO43272913",
          "R.C.: J40/991/2015",
          "Chiajna, Ilfov",
          "Banca Transilvania",
          "RO79BTRL RON CRT 0294 5948 01",
        ];
        doc.setFontSize(8).setFont(undefined, "normal");
        prestatorLines.forEach((line, i) => {
          const y = PAGE_MARGIN + 12 + i * 4.5;
          doc.text(line, PAGE_MARGIN + 2, y);
          // decorative underline
          doc.line(PAGE_MARGIN + 1, y + 1.5, PAGE_MARGIN + prestatorW - 1, y + 1.5);
        });

        // BENEFICIAR BOX ----------------------------------------------------
        const beneficiarX = PAGE_MARGIN + prestatorW + 40; // 40‑mm gap = logo area
        const beneficiarW = prestatorW;
        doc.rect(beneficiarX, PAGE_MARGIN, beneficiarW, headerBoxH, "S");

        doc.setFontSize(10).setFont(undefined, "bold");
        doc.text("BENEFICIAR", beneficiarX + beneficiarW / 2, PAGE_MARGIN + 6, {
          align: "center",
        });

        const beneficiarLines = [
          removeDiacritics(lucrare.client || "-"),
          "CUI: -",
          "R.C.: -",
          `Adresa: ${removeDiacritics(lucrare.locatie || "-")}`,
          "Banca: -",
          "Cont: -",
        ];
        doc.setFontSize(8).setFont(undefined, "normal");
        beneficiarLines.forEach((line, i) => {
          const y = PAGE_MARGIN + 12 + i * 4.5;
          doc.text(line, beneficiarX + 2, y);
          doc.line(beneficiarX + 1, y + 1.5, beneficiarX + beneficiarW - 1, y + 1.5);
        });

        // NRG LOGO ----------------------------------------------------------
        const logoX = PAGE_MARGIN + prestatorW + 2; // small padding
        const logoY = PAGE_MARGIN + 4;
        const logoW = 36; // mm – matches visual proportion
        const logoH = 18;
        doc.rect(logoX, PAGE_MARGIN, 40, headerBoxH, "S"); // frame around logo area
        if (lucrare.logoNRG) {
          try {
            doc.addImage(lucrare.logoNRG, "PNG", logoX + 2, logoY, logoW, logoH);
          } catch (_) {
            /* fail silently */
          }
        } else {
          // Fallback text if no image available
          doc.setFontSize(22).setFont(undefined, "bold");
          doc.text("NRG", logoX + 20, logoY + 12, { align: "center" });
        }

        /* ------------------------------------------------------------------ */
        /*                              MAIN TITLE                            */
        /* ------------------------------------------------------------------ */

        doc.setFontSize(14).setFont(undefined, "bold");
        doc.text("RAPORT", pageW / 2, PAGE_MARGIN + headerBoxH + 10, {
          align: "center",
        });
        doc.text("DE", pageW / 2, PAGE_MARGIN + headerBoxH + 16, { align: "center" });
        doc.text("INTERVENTIE", pageW / 2, PAGE_MARGIN + headerBoxH + 22, {
          align: "center",
        });

        /* --------------------------- META SECTION -------------------------- */
        const metaY = PAGE_MARGIN + headerBoxH + 32;
        doc.setFontSize(9).setFont(undefined, "normal");

        const dateInterv = lucrare.dataInterventie || "-";
        const [dPart = "-", tPart = "-"] = dateInterv.split(" ");

        doc.text(`Data interventiei: ${removeDiacritics(dPart)}`, PAGE_MARGIN, metaY);
        doc.text(`Ora sosire: ${tPart}`, PAGE_MARGIN + 90, metaY);
        doc.text(`Ora plecare: ${lucrare.oraPlecare || "-"}`, PAGE_MARGIN + 140, metaY);
        doc.text(`Nr. Raport: ${lucrare.id}`, PAGE_MARGIN, metaY + 5);

        /* -------------------- COMMENT BLOCKS (lined areas) ------------------ */
        const addLinedBlock = (
          label: string,
          text: string,
          startY: number,
          lines = 7,
        ): number => {
          doc.setFont(undefined, "bold").text(label, PAGE_MARGIN, startY);
          doc.setFont(undefined, "normal");

          const blockTop = startY + 3;
          const lineSpacing = 5;
          const blockH = lines * lineSpacing;
          // outline
          doc.rect(PAGE_MARGIN, blockTop, CONTENT_W, blockH, "S");
          // interior horizontal rules
          for (let i = 1; i < lines; i++) {
            const y = blockTop + i * lineSpacing;
            doc.line(PAGE_MARGIN, y, PAGE_MARGIN + CONTENT_W, y);
          }

          // free text (wrap inside block)
          const textLines = doc.splitTextToSize(text, CONTENT_W - 4);
          doc.text(textLines, PAGE_MARGIN + 2, blockTop + 4);
          return blockTop + blockH + 6;
        };

        let cursorY = metaY + 12;
        cursorY = addLinedBlock(
          "Constatare la locatie:",
          removeDiacritics(lucrare.descriere || ""),
          cursorY,
        );
        cursorY = addLinedBlock(
          "Descriere interventie:",
          removeDiacritics(lucrare.descriereInterventie || ""),
          cursorY,
        );

        /* ------------------------------------------------------------------ */
        /*                              PRODUCTS TABLE                        */
        /* ------------------------------------------------------------------ */

        const tableHeaderY = cursorY + 4;
        const headerH = 8;

        doc.setFont(undefined, "bold").setFontSize(11);
        doc.text("DEVIZ ESTIMATIV", pageW / 2, tableHeaderY - 3, { align: "center" });

        // header background
        doc.setFillColor(240);
        doc.rect(PAGE_MARGIN, tableHeaderY, CONTENT_W, headerH, "FD");

        const colTitles = [
          "NR",
          "Denumire produs",
          "UM",
          "Cantitate",
          "Pret unitar",
          "Total",
        ];
        doc.setFontSize(8);
        colTitles.forEach((t, i) => {
          const x = getColX(i) + TABLE_COL_WIDTHS[i] / 2;
          doc.text(t, x, tableHeaderY + 5, { align: "center" });
          doc.line(getColX(i), tableHeaderY, getColX(i), tableHeaderY + headerH);
        });
        // rightmost border & bottom of header
        doc.line(getColX(TABLE_COL_WIDTHS.length), tableHeaderY, getColX(TABLE_COL_WIDTHS.length), tableHeaderY + headerH);
        doc.line(PAGE_MARGIN, tableHeaderY + headerH, PAGE_MARGIN + CONTENT_W, tableHeaderY + headerH);

        /* ------------------------- TABLE BODY ----------------------------- */
        let rowY = tableHeaderY + headerH;
        const maxBodyBottom = pageH - PAGE_MARGIN - 60;
        doc.setFont(undefined, "normal");

        const ensureSpace = (h: number) => {
          if (rowY + h > maxBodyBottom) {
            doc.line(PAGE_MARGIN, rowY, PAGE_MARGIN + CONTENT_W, rowY); // close last row
            doc.addPage();
            rowY = PAGE_MARGIN; // reset
          }
        };

        products.forEach((p, idx) => {
          const nameLines = doc.splitTextToSize(removeDiacritics(p.name), TABLE_COL_WIDTHS[1] - 2);
          const rh = Math.max(8, nameLines.length * 4 + 2);
          ensureSpace(rh);

          // row outline top
          doc.line(PAGE_MARGIN, rowY, PAGE_MARGIN + CONTENT_W, rowY);
          for (let i = 0; i <= TABLE_COL_WIDTHS.length; i++) {
            doc.line(getColX(i), rowY, getColX(i), rowY + rh);
          }

          const center = (i: number) => getColX(i) + TABLE_COL_WIDTHS[i] / 2;
          doc.text(String(idx + 1), center(0), rowY + 4, { align: "center" });
          nameLines.forEach((l, li) => doc.text(l, getColX(1) + 1, rowY + 4 + li * 4));
          doc.text(p.um, center(2), rowY + 4, { align: "center" });
          doc.text(String(p.quantity), center(3), rowY + 4, { align: "center" });
          doc.text(p.price.toFixed(2), center(4), rowY + 4, { align: "center" });
          const tot = (p.quantity * p.price).toFixed(2);
          doc.text(tot, center(5), rowY + 4, { align: "center" });

          rowY += rh;
        });
        // bottom of last row
        doc.line(PAGE_MARGIN, rowY, PAGE_MARGIN + CONTENT_W, rowY);

        /* ----------------------------- TOTALS ------------------------------ */
        const subtotal = products.reduce((s, p) => s + p.quantity * p.price, 0);
        const grand = subtotal * 1.19;
        const totalsY = rowY + 6;
        doc.setFont(undefined, "bold");
        doc.text("Total fara TVA:", PAGE_MARGIN + CONTENT_W - 50, totalsY);
        doc.setFont(undefined, "normal").text(subtotal.toFixed(2) + " RON", PAGE_MARGIN + CONTENT_W - 20, totalsY, {
          align: "right",
        });
        doc.setFont(undefined, "bold").text("Total cu TVA (19%):", PAGE_MARGIN + CONTENT_W - 50, totalsY + 5);
        doc.setFont(undefined, "normal").text(grand.toFixed(2) + " RON", PAGE_MARGIN + CONTENT_W - 20, totalsY + 5, {
          align: "right",
        });

        /* --------------------------- SIGNATURES --------------------------- */
        const sigY = totalsY + 20;
        doc.setFontSize(9).setFont(undefined, "bold");
        doc.text("Nume tehnician:", PAGE_MARGIN, sigY);
        doc.text("Reprezentant beneficiar:", PAGE_MARGIN + 105, sigY);

        doc.text("Semnatura:", PAGE_MARGIN, sigY + 18);
        doc.text("Semnatura:", PAGE_MARGIN + 105, sigY + 18);

        // placeholder text lines
        doc.setFont(undefined, "normal");
        const techNames = removeDiacritics(lucrare.tehnicieni?.join(", ") || "");
        const contactPers = removeDiacritics(lucrare.persoanaContact || "");
        doc.text(techNames, PAGE_MARGIN, sigY + 6);
        doc.text(contactPers, PAGE_MARGIN + 105, sigY + 6);

        // optional signatures images
        if (lucrare.semnaturaTehnician) {
          try {
            doc.addImage(lucrare.semnaturaTehnician, "PNG", PAGE_MARGIN, sigY + 20, 60, 30);
          } catch (_) {/* ignore */}
        }
        if (lucrare.semnaturaBeneficiar) {
          try {
            doc.addImage(lucrare.semnaturaBeneficiar, "PNG", PAGE_MARGIN + 105, sigY + 20, 60, 30);
          } catch (_) {/* ignore */}
        }

        /* ---------------------------- FINALISE ---------------------------- */
        const blob = doc.output("blob");
        onGenerate?.(blob);
        doc.save(`Raport_Interventie_${lucrare.id}.pdf`);
        toast({ title: "PDF generat cu succes", description: "Raportul a fost generat si descarcat." });
        return blob;
      } catch (err) {
        console.error("Eroare la generarea PDF‑ului:", err);
        toast({ title: "Eroare", description: "A aparut o eroare la generarea raportului PDF.", variant: "destructive" });
      } finally {
        setIsGenerating(false);
      }
    });

    /* ----------------------- RENDER COMPONENT ---------------------------- */
    return (
      <div className="space-y-4">
        <ProductTableForm products={products} onProductsChange={setProducts} />
        <div className="flex justify-center mt-6">
          <Button
            ref={ref}
            onClick={generatePDF}
            disabled={isGenerating || !lucrare?.semnaturaTehnician || !lucrare?.semnaturaBeneficiar}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            {isGenerating ? "Se generează..." : "Descarcă PDF"}
          </Button>
        </div>
      </div>
    );
  },
);

ReportGenerator.displayName = "ReportGenerator";
