"use client";

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

// A4 portrait in jsPDF is 210 × 297 mm.  We keep everything inside a uniform
// 20 mm margin to guarantee that nothing is cropped by printers.
const PAGE_MARGIN = 20;
const TABLE_COL_WIDTHS = [10, 80, 15, 20, 22.5, 22.5] as const; // mm, MUST sum to 170 (i.e. 210 − 2×20)
const getColumnX = (index: number) => PAGE_MARGIN + TABLE_COL_WIDTHS.slice(0, index).reduce((a, b) => a + b, 0);

export const ReportGenerator = forwardRef<HTMLButtonElement, ReportGeneratorProps>(
  ({ lucrare, onGenerate }, ref) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);

    /* -------------------------- PDF GENERATION CORE ------------------------- */
    const generatePDF = useStableCallback(async () => {
      if (!lucrare) return;

      setIsGenerating(true);

      try {
        // Create a new PDF document.  We work in mm (default units).
        const doc = new jsPDF({ format: "a4", unit: "mm" });

        // Pre‑compute frequently used data
        const pageW = doc.internal.pageSize.width; // 210 mm
        const pageH = doc.internal.pageSize.height; // 297 mm
        const contentW = pageW - 2 * PAGE_MARGIN; // 170 mm

        /* ------------------------------------------------------------------ */
        /*                             PAGE HEADER                            */
        /* ------------------------------------------------------------------ */

        // Header boxes (Prestator / Beneficiar)
        doc.setDrawColor(0);
        doc.setLineWidth(0.2);
        const headerBoxH = 40;

        // PRESTATOR
        doc.rect(PAGE_MARGIN, PAGE_MARGIN, contentW / 2 - 2.5, headerBoxH, "S");
        doc.setFontSize(10).setFont("helvetica", "bold");
        doc.text("PRESTATOR", PAGE_MARGIN + (contentW / 4) - 2.5, PAGE_MARGIN + 6, { align: "center" });

        // BENEFICIAR
        doc.rect(PAGE_MARGIN + contentW / 2 + 2.5, PAGE_MARGIN, contentW / 2 - 2.5, headerBoxH, "S");
        doc.text(
          "BENEFICIAR",
          PAGE_MARGIN + contentW * 0.75 + 2.5,
          PAGE_MARGIN + 6,
          { align: "center" },
        );

        // PRESTATOR details
        doc.setFont("helvetica", "normal");
        const prestatorDetails = [
          "SC. NRG Access Systems S.R.L.",
          "CUI: RO12345678",
          "R.C.: J12/3456/2015",
          "Adresa: Strada Exemplu",
          "Banca: Transilvania",
          "IBAN: RO12BTRLRONCRT0123456789",
        ];
        prestatorDetails.forEach((line, i) =>
          doc.text(line, PAGE_MARGIN + 2, PAGE_MARGIN + 12 + i * 5),
        );

        // BENEFICIAR details
        const beneficiarDetails = [
          removeDiacritics(lucrare.client || "N/A"),
          "CUI: -",
          "R.C.: -",
          `Adresa: ${removeDiacritics(lucrare.locatie || "N/A")}`,
          "Cont: -",
        ];
        beneficiarDetails.forEach((line, i) =>
          doc.text(line, PAGE_MARGIN + contentW / 2 + 4.5, PAGE_MARGIN + 12 + i * 5),
        );

        /* --------------------------- INTERNAL TITLE ------------------------ */
        doc.setFontSize(12).setFont("helvetica", "bold");
        doc.text("FIELD OPERATIONAL MANAGER", pageW / 2, PAGE_MARGIN + headerBoxH + 8, {
          align: "center",
        });
        doc.setFontSize(10).text("FOM", pageW / 2, PAGE_MARGIN + headerBoxH + 14, { align: "center" });

        doc.setFontSize(16).text("RAPORT DE INTERVENTIE", pageW / 2, PAGE_MARGIN + headerBoxH + 22, {
          align: "center",
        });

        /* --------------------------- META SECTION -------------------------- */
        const metaStartY = PAGE_MARGIN + headerBoxH + 32;
        doc.setFontSize(10).setFont("helvetica", "normal");
        doc.text(`Nr. Raport: ${lucrare.id || "N/A"}`, PAGE_MARGIN, metaStartY);

        const dateInterventie = removeDiacritics(lucrare.dataInterventie || "N/A");
        const [datePart = "N/A", timePart = "N/A"] = dateInterventie.split(" ");

        doc.text(`Data emiterii: ${removeDiacritics(lucrare.dataEmiterii || "N/A")}`, PAGE_MARGIN, metaStartY + 5);
        doc.text(`Data interventiei: ${datePart}`, PAGE_MARGIN, metaStartY + 10);
        doc.text(`Ora sosire: ${timePart}`, PAGE_MARGIN + 70, metaStartY + 10);
        doc.text(`Ora plecare: ${timePart}`, PAGE_MARGIN + 140, metaStartY + 10);

        /* --------------------------- WORK DETAILS -------------------------- */
        const workStartY = metaStartY + 18;
        doc.setFont("helvetica", "bold").text("Tip lucrare:", PAGE_MARGIN, workStartY);
        doc.setFont("helvetica", "normal").text(removeDiacritics(lucrare.tipLucrare || "N/A"), PAGE_MARGIN + 30, workStartY);

        if (lucrare.tipLucrare === "Intervenție în contract" && lucrare.contractNumber) {
          doc.setFont("helvetica", "bold").text("Contract:", PAGE_MARGIN + 100, workStartY);
          doc.setFont("helvetica", "normal").text(removeDiacritics(lucrare.contractNumber), PAGE_MARGIN + 130, workStartY);
        }

        doc.setFont("helvetica", "bold").text("Tehnicieni:", PAGE_MARGIN, workStartY + 5);
        const tehnicieniText = removeDiacritics(lucrare.tehnicieni?.join(", ") || "N/A");
        doc.setFont("helvetica", "normal").text(tehnicieniText, PAGE_MARGIN + 30, workStartY + 5);

        doc.setFont("helvetica", "bold").text("Persoana contact:", PAGE_MARGIN, workStartY + 10);
        const contactPerson = removeDiacritics(lucrare.persoanaContact || "N/A");
        doc.setFont("helvetica", "normal").text(contactPerson, PAGE_MARGIN + 50, workStartY + 10);

        doc.setFont("helvetica", "bold").text("Telefon:", PAGE_MARGIN + 100, workStartY + 10);
        doc.setFont("helvetica", "normal").text(removeDiacritics(lucrare.telefon || "N/A"), PAGE_MARGIN + 130, workStartY + 10);

        /* ----------------------------- TEXT AREAS -------------------------- */
        const addBlock = (label: string, text: string, startY: number): number => {
          doc.setFont("helvetica", "bold").text(label, PAGE_MARGIN, startY);
          doc.setFont("helvetica", "normal");
          const lines = doc.splitTextToSize(text, contentW);
          doc.text(lines, PAGE_MARGIN, startY + 5);
          return startY + 5 + lines.length * 5;
        };

        let currentY = workStartY + 18;
        currentY = addBlock("Defect reclamat:", removeDiacritics(lucrare.defectReclamat || "N/A"), currentY);
        currentY = addBlock("Constatare la locatie:", removeDiacritics(lucrare.descriere || "N/A"), currentY + 5);
        currentY = addBlock("Descriere interventie:", removeDiacritics(lucrare.descriereInterventie || "N/A"), currentY + 5);

        doc.setFont("helvetica", "bold").text("Status lucrare:", PAGE_MARGIN, currentY + 5);
        doc.setFont("helvetica", "normal").text(removeDiacritics(lucrare.statusLucrare || "N/A"), PAGE_MARGIN + 40, currentY + 5);

        doc.setFont("helvetica", "bold").text("Status facturare:", PAGE_MARGIN + 100, currentY + 5);
        doc.setFont("helvetica", "normal").text(removeDiacritics(lucrare.statusFacturare || "N/A"), PAGE_MARGIN + 150, currentY + 5);

        currentY += 15;

        /* ------------------------------------------------------------------ */
        /*                              PRODUCTS TABLE                        */
        /* ------------------------------------------------------------------ */

        const tableHeaderY = currentY + 10;
        const headerHeight = 8;

        doc.setFont("helvetica", "bold").setFontSize(12);
        doc.text("DATE ESTIMATIV", pageW / 2, tableHeaderY - 4, { align: "center" });

        // Table header background
        doc.setFillColor(240);
        doc.rect(PAGE_MARGIN, tableHeaderY, contentW, headerHeight, "FD");

        // Column titles
        const colTitles = [
          "NR",
          "Denumire produse",
          "UM",
          "Cantitate",
          "Pret unitar",
          "Total",
        ];
        doc.setFontSize(8);
        colTitles.forEach((title, i) => {
          const xCenter = getColumnX(i) + TABLE_COL_WIDTHS[i] / 2;
          doc.setFont("helvetica", "bold").text(title, xCenter, tableHeaderY + 5, { align: "center" });
        });

        // Vertical lines (table header)
        for (let i = 0; i <= TABLE_COL_WIDTHS.length; i++) {
          const x = getColumnX(i);
          doc.line(x, tableHeaderY, x, tableHeaderY + headerHeight);
        }
        // Bottom line of header
        doc.line(PAGE_MARGIN, tableHeaderY + headerHeight, PAGE_MARGIN + contentW, tableHeaderY + headerHeight);

        /* ------------------------- TABLE BODY ----------------------------- */
        let rowY = tableHeaderY + headerHeight; // first row top edge
        const maxRowBottom = pageH - PAGE_MARGIN - 60; // leave room for totals & signatures

        const ensurePageSpace = (rowHeight: number) => {
          if (rowY + rowHeight > maxRowBottom) {
            doc.line(PAGE_MARGIN, rowY, PAGE_MARGIN + contentW, rowY); // close last row before break
            doc.addPage();
            // reset positions
            rowY = PAGE_MARGIN;
            // redraw header on new page
            doc.setFillColor(240);
            doc.rect(PAGE_MARGIN, rowY, contentW, headerHeight, "FD");
            colTitles.forEach((title, i) => {
              const xCenter = getColumnX(i);
              doc.setFont("helvetica", "bold").text(title, xCenter + TABLE_COL_WIDTHS[i] / 2, rowY + 5, { align: "center" });
              doc.line(getColumnX(i), rowY, getColumnX(i), rowY + headerHeight);
            });
            doc.line(PAGE_MARGIN, rowY + headerHeight, PAGE_MARGIN + contentW, rowY + headerHeight);
            rowY += headerHeight; // space for new rows
          }
        };

        doc.setFont("helvetica", "normal");
        products.forEach((prod, idx) => {
          const nameLines = doc.splitTextToSize(removeDiacritics(prod.name), TABLE_COL_WIDTHS[1] - 2);
          const rowHeight = Math.max(8, nameLines.length * 4 + 2); // dynamic height

          ensurePageSpace(rowHeight);

          // Horizontal top line of the row
          doc.line(PAGE_MARGIN, rowY, PAGE_MARGIN + contentW, rowY);

          // Cell verticals for the row
          for (let i = 0; i <= TABLE_COL_WIDTHS.length; i++) {
            const x = getColumnX(i);
            doc.line(x, rowY, x, rowY + rowHeight);
          }

          // Row content
          doc.setFontSize(8);
          const cellCenter = (colIndex: number) => getColumnX(colIndex) + TABLE_COL_WIDTHS[colIndex] / 2;
          doc.text(String(idx + 1), cellCenter(0), rowY + 4, { align: "center" });

          nameLines.forEach((line, i) => {
            doc.text(line, getColumnX(1) + 1, rowY + 4 + i * 4);
          });

          doc.text(prod.um, cellCenter(2), rowY + 4, { align: "center" });
          doc.text(String(prod.quantity), cellCenter(3), rowY + 4, { align: "center" });
          doc.text(prod.price.toFixed(2), cellCenter(4), rowY + 4, { align: "center" });
          const total = (prod.quantity * prod.price).toFixed(2);
          doc.text(total, cellCenter(5), rowY + 4, { align: "center" });

          rowY += rowHeight;
        });

        // Bottom border of the last row
        doc.line(PAGE_MARGIN, rowY, PAGE_MARGIN + contentW, rowY);

        /* ----------------------------- TABLE FOOTER ------------------------ */
        const subtotal = products.reduce((s, p) => s + p.quantity * p.price, 0);
        const totalWithVAT = subtotal * 1.19;

        const totalsY = rowY + 8;
        doc.setFont("helvetica", "bold").text("Total fara TVA:", PAGE_MARGIN + 120, totalsY, { align: "right" });
        doc.setFont("helvetica", "normal").text(subtotal.toFixed(2) + " RON", PAGE_MARGIN + 125, totalsY);

        doc.setFont("helvetica", "bold").text("Total cu TVA (19%):", PAGE_MARGIN + 120, totalsY + 5, { align: "right" });
        doc.setFont("helvetica", "normal").text(totalWithVAT.toFixed(2) + " RON", PAGE_MARGIN + 125, totalsY + 5);

        /* --------------------------- SIGNATURES --------------------------- */
        const sigY = totalsY + 20;
        doc.setFontSize(10);
        doc.text("Nume tehnician:", PAGE_MARGIN, sigY);
        doc.text("Reprezentant beneficiar:", PAGE_MARGIN + 105, sigY);

        doc.text("Semnatura:", PAGE_MARGIN, sigY + 20);
        doc.text("Semnatura:", PAGE_MARGIN + 105, sigY + 20);

        doc.text(tehnicieniText, PAGE_MARGIN, sigY + 6);
        doc.text(contactPerson, PAGE_MARGIN + 105, sigY + 6);

        if (lucrare.semnaturaTehnician) {
          try {
            doc.addImage(lucrare.semnaturaTehnician, "PNG", PAGE_MARGIN, sigY + 22, 60, 30);
          } catch (err) {
            console.error("Eroare la adaugarea semnaturii tehnicianului:", err);
          }
        }
        if (lucrare.semnaturaBeneficiar) {
          try {
            doc.addImage(lucrare.semnaturaBeneficiar, "PNG", PAGE_MARGIN + 105, sigY + 22, 60, 30);
          } catch (err) {
            console.error("Eroare la adaugarea semnaturii beneficiarului:", err);
          }
        }

        /* ---------------------------- FINALISE ---------------------------- */
        const pdfBlob = doc.output("blob");
        onGenerate?.(pdfBlob);
        doc.save(`Raport_Interventie_${lucrare.id}.pdf`);

        toast({
          title: "PDF generat cu succes",
          description: "Raportul a fost generat si descarcat.",
        });

        return pdfBlob;
      } catch (err) {
        console.error("Eroare la generarea PDF‑ului:", err);
        toast({
          title: "Eroare",
          description: "A aparut o eroare la generarea raportului PDF.",
          variant: "destructive",
        });
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
            disabled={
              isGenerating ||
              !lucrare?.semnaturaTehnician ||
              !lucrare?.semnaturaBeneficiar
            }
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
