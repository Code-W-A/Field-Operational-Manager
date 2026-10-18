import { jsPDF } from "jspdf";
import { drawSimpleHeader, drawFooter, MARGIN, CONTENT_WIDTH } from "./common";
import { ensurePdfFont } from "./font-loader";
import type { InstallationDocument } from "@/types/installation";

const normalize = (value: string) =>
  value.normalize("NFC").replace(/\u015F/g, "ș").replace(/\u0163/g, "ț");

export async function renderInstallationPdf(
  snapshot: InstallationDocument,
  workId: string,
  sheetId: string | undefined,
  photoBytes: (photo: InstallationDocument["photos"][number]) => Promise<Uint8Array>,
  options: { logoDataUrl?: string | null } = {},
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensurePdfFont(doc);
  const bottom = doc.internal.pageSize.getHeight() - MARGIN - 28;
  const lineHeight = 5;
  let y = drawSimpleHeader(doc, {
    title: sheetId ? "Fișă de montaj" : "Proces-verbal de terminare a lucrării",
    logoDataUrl: options.logoDataUrl,
  });
  const bodyFont = () =>
    doc.setFont("NotoSans", "normal").setTextColor(25, 25, 25).setFontSize(10);
  const room = (height: number) => {
    if (y + height > bottom) {
      doc.addPage();
      y = MARGIN + 5;
    }
  };
  const wrap = (value: string, width: number): string[] =>
    doc.splitTextToSize(normalize(value || "-"), width);
  const textLines = (lines: string[], x = MARGIN + 2) => {
    for (const row of lines) {
      room(lineHeight);
      bodyFont();
      doc.text(row, x, y);
      y += lineHeight;
    }
  };
  const line = (label: string, value: string) => {
    bodyFont();
    textLines(wrap(`${label}${label ? ": " : ""}${value || "-"}`, CONTENT_WIDTH - 4));
    y += 2;
  };
  const section = (title: string) => {
    // Keep each section heading with at least one content line.
    room(17);
    doc.setFillColor(220, 230, 244).rect(MARGIN, y, CONTENT_WIDTH, 5, "F");
    doc.setFont("NotoSans", "bold").setFontSize(10).setTextColor(74, 118, 184);
    doc.text(title, MARGIN + 2, y + 4);
    y += 12;
    bodyFont();
  };

  // Wrap both identities independently, retaining their two-column alignment.
  const columnWidth = CONTENT_WIDTH / 2 - 4;
  doc.setFont("NotoSans", "bold").setFontSize(10).setTextColor(0, 0, 0);
  doc.text("Prestator", MARGIN, y);
  doc.text("Beneficiar", MARGIN + CONTENT_WIDTH, y, { align: "right" });
  y += 6;
  bodyFont();
  const left = ["NRG Access Systems SRL", "RO34272913", "Rezervelor 70, Chiajna, Ilfov"]
    .flatMap((value) => wrap(value, columnWidth));
  const right = [snapshot.client.client, snapshot.client.clientInfo.cui, snapshot.client.clientInfo.adresa]
    .flatMap((value) => wrap(value, columnWidth));
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    room(lineHeight);
    if (left[i]) doc.text(left[i], MARGIN, y);
    if (right[i]) doc.text(right[i], MARGIN + CONTENT_WIDTH, y, { align: "right" });
    y += lineHeight;
  }
  y += 8;

  section("Datele lucrării");
  line("Tichet", snapshot.workNumber || workId);
  line("Document", sheetId || "Proces-verbal final");
  line("Data lucrării", snapshot.workDate);
  line("Locație", [snapshot.client.locatie, snapshot.client.clientInfo.locationAddress].filter(Boolean).join(" · "));

  section("Echipamente");
  snapshot.equipment.forEach((equipment) =>
    line("Echipament", [equipment.name, equipment.code, equipment.model].filter(Boolean).join(" · ")),
  );
  if (sheetId) {
    section("Echipa de montaj");
    if (snapshot.principalName) line("Principalul fișei", snapshot.principalName);
    snapshot.participants?.forEach((participant) =>
      line("Participant", `${participant.name} · ${participant.role === "principal" ? "principal" : "secundar"}${participant.moved ? " · a continuat pe altă fișă" : ""}`),
    );
    section("Constatare la locație");
    line("", snapshot.finding || "");
    section("Operațiuni executate");
    line("", snapshot.operations || "");
    section("Status instalare");
    line("Status", { in_progress: "În lucru", blocked: "Blocat", completed: "Finalizat" }[snapshot.installationStatus || "in_progress"]);
    if (snapshot.installationStatus === "blocked") line("Motivul blocajului", snapshot.blockReason || "");
  } else {
    section("Terminarea lucrării");
    line("Obiect", "Terminarea instalării echipamentelor enumerate, conform fișelor de montaj de mai jos.");
    section("Fișe de montaj aferente");
    snapshot.sheetReferences?.forEach((sheet) =>
      line("Fișă de montaj", `${sheet.workDate} · ${sheet.equipmentName} · ${sheet.sheetId}`),
    );
    if (snapshot.observations) {
      section("Observații finale");
      line("", snapshot.observations);
    }
  }

  if (snapshot.photos.length) {
    room(132);
    section("Fotografii");
  }
  for (const photo of snapshot.photos) {
    const bytes = await photoBytes(photo);
    const properties = doc.getImageProperties(bytes);
    const scale = Math.min(150 / properties.width, 100 / properties.height);
    const width = properties.width * scale;
    const height = properties.height * scale;
    bodyFont();
    const caption = wrap(`Fotografie: ${photo.name}`, CONTENT_WIDTH - 4);
    // Keep ordinary captions and images together; very long names may flow first.
    room(Math.min(bottom - MARGIN - 5, caption.length * lineHeight + height + 7));
    textLines(caption);
    room(height + 7);
    doc.addImage(bytes, photo.contentType === "image/png" ? "PNG" : "JPEG",
      MARGIN + (CONTENT_WIDTH - width) / 2, y, width, height);
    y += height + 7;
  }

  bodyFont();
  const halfWidth = (CONTENT_WIDTH - 12) / 2;
  const technicianLabel = wrap(`${snapshot.participants ? "Tehnician semnatar" : "Tehnician"}: ${snapshot.technicianName}`, halfWidth);
  const beneficiaryLabel = wrap(`Beneficiar: ${snapshot.beneficiaryName}`, halfWidth);
  const labelRows = Math.max(technicianLabel.length, beneficiaryLabel.length);
  room(Math.min(bottom - MARGIN - 5, 12 + labelRows * lineHeight + 32));
  section("Semnături");
  for (let i = 0; i < labelRows; i++) {
    room(lineHeight + 32);
    if (technicianLabel[i]) doc.text(technicianLabel[i], MARGIN + 2, y);
    if (beneficiaryLabel[i]) doc.text(beneficiaryLabel[i], MARGIN + 10 + halfWidth, y);
    y += lineHeight;
  }
  for (const [signature, x] of [
    [snapshot.technicianSignature, MARGIN + 2],
    [snapshot.beneficiarySignature, MARGIN + 10 + halfWidth],
  ] as const) {
    const properties = doc.getImageProperties(signature);
    const scale = Math.min(70 / properties.width, 22 / properties.height);
    doc.addImage(signature, "PNG", x, y + 3, properties.width * scale, properties.height * scale);
  }
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    drawFooter(doc);
  }
  return doc;
}
