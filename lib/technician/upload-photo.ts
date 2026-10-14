/** Keep camera uploads below the server's 3 MB limit before sending any bytes. */
export async function prepareUploadPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (["image/jpeg", "image/png"].includes(file.type) && file.size <= 1_000_000) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Fotografia nu poate fi citită. Alege o fotografie JPEG sau PNG."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Fotografia nu poate fi pregătită pe acest dispozitiv.");
    for (const maxSide of [2048, 1600, 1200, 960]) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (blob && blob.size <= 1_000_000) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
      }
    }
    throw new Error("Fotografia este prea mare. Alege o fotografie cu rezoluție mai mică.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
