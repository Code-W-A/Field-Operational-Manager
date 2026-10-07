import { jsPDF } from "jspdf";
import { drawSimpleHeader, drawFooter, MARGIN, CONTENT_WIDTH } from "./common";
import { ensurePdfFont } from "./font-loader";
import type { InstallationDocument } from "@/types/installation";

export async function renderInstallationPdf(
  snapshot: InstallationDocument,
  workId: string,
  sheetId: string | undefined,
  photoBytes: (photo: InstallationDocument["photos"][number]) => Promise<Uint8Array>,
) {
  const doc = new jsPDF();
  await ensurePdfFont(doc);
  let y = drawSimpleHeader(doc, {
    title: sheetId ? "Fișă de montaj" : "Proces-verbal de terminare a lucrării",
  });
  doc.setFont("NotoSans", "normal").setTextColor(25, 25, 25).setFontSize(10);
  const room = (height: number) => {
    if (y + height > 272) {
      doc.addPage();
      y = MARGIN + 5;
    }
  };
  const line = (label: string, value: string) => {
    const lines = doc.splitTextToSize(
      `${label}${label ? ": " : ""}${value || "—"}`,
      CONTENT_WIDTH - 8,
    );
    for (const row of lines) {
      room(6);
      doc.text(row, MARGIN + 4, y);
      y += 5;
    }
    y += 2;
  };
  line("Tichet", snapshot.workNumber);
  line("Document", sheetId || "Proces-verbal final");
  line("Data lucrării", snapshot.workDate);
  line("Client", snapshot.client.client);
  line("CUI", snapshot.client.clientInfo.cui);
  line(
    "Locație",
    `${snapshot.client.locatie} ${snapshot.client.clientInfo.locationAddress}`,
  );
  snapshot.equipment.forEach((e) =>
    line(
      "Echipament",
      `${e.name} · ${e.code}${e.model ? ` · ${e.model}` : ""}`,
    ),
  );
  if (sheetId) {
    if (snapshot.principalName)
      line("Principalul fișei", snapshot.principalName);
    snapshot.participants?.forEach((p) =>
      line(
        "Participant",
        `${p.name} · ${p.role === "principal" ? "principal" : "secundar"}${p.moved ? " · a continuat pe altă fișă" : ""}`,
      ),
    );
    line("Constatare la locație", snapshot.finding || "");
    line("Operațiuni executate", snapshot.operations || "");
    line(
      "Status instalare",
      { in_progress: "În lucru", blocked: "Blocat", completed: "Finalizat" }[
        snapshot.installationStatus || "in_progress"
      ],
    );
    if (snapshot.installationStatus === "blocked")
      line("Motivul blocajului", snapshot.blockReason || "");
  } else {
    line(
      "Obiect",
      "Terminarea instalării echipamentelor enumerate, conform fișelor de montaj de mai jos.",
    );
    snapshot.sheetReferences?.forEach((s) =>
      line(
        "Fișă de montaj",
        `${s.workDate} · ${s.equipmentName} · ${s.sheetId}`,
      ),
    );
    if (snapshot.observations) line("Observații finale", snapshot.observations);
  }
  for (const photo of snapshot.photos) {
    const bytes = await photoBytes(photo);
    const properties = doc.getImageProperties(bytes);
    const width = Math.min(CONTENT_WIDTH - 8, 150);
    const height = Math.min(
      100,
      (width * properties.height) / properties.width,
    );
    const actualWidth = (height * properties.width) / properties.height;
    room(height + 12);
    line("Fotografie", photo.name);
    doc.addImage(
      bytes,
      photo.contentType === "image/png" ? "PNG" : "JPEG",
      MARGIN + 4,
      y,
      actualWidth,
      height,
    );
    y += height + 5;
  }
  const halfWidth = (CONTENT_WIDTH - 12) / 2;
  const technicianLabel = doc.splitTextToSize(
    `${snapshot.participants ? "Tehnician semnatar" : "Tehnician"}: ${snapshot.technicianName}`,
    halfWidth,
  );
  const beneficiaryLabel = doc.splitTextToSize(
    `Beneficiar: ${snapshot.beneficiaryName}`,
    halfWidth,
  );
  const labelHeight =
    Math.max(technicianLabel.length, beneficiaryLabel.length) * 5;
  room(labelHeight + 32);
  doc.text(technicianLabel, MARGIN + 4, y);
  doc.text(beneficiaryLabel, MARGIN + 8 + halfWidth, y);
  doc.addImage(
    snapshot.technicianSignature,
    "PNG",
    MARGIN + 4,
    y + labelHeight + 3,
    70,
    22,
  );
  doc.addImage(
    snapshot.beneficiarySignature,
    "PNG",
    MARGIN + 8 + halfWidth,
    y + labelHeight + 3,
    70,
    22,
  );
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    drawFooter(doc);
  }
  return doc;
}

