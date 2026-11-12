import type { jsPDF } from "jspdf";

/** Fit the original image uniformly inside its allotted document area. */
export function drawSignature(
  doc: jsPDF,
  image: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  align: "left" | "right" = "left",
) {
  const { width, height } = doc.getImageProperties(image);
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    throw new Error("Dimensiuni invalide pentru semnătură.");
  const scale = Math.min(maxWidth / width, maxHeight / height);
  const fittedWidth = width * scale;
  const fittedHeight = height * scale;
  doc.addImage(image, "PNG", align === "right" ? x + maxWidth - fittedWidth : x,
    y, fittedWidth, fittedHeight);
}
