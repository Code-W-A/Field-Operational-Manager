import QRCode from "qrcode"

// Generare cod QR ca URL de date
export const generateQRCode = async (text: string): Promise<string> => {
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(text, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 200,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })

    return qrCodeDataUrl
  } catch (error) {
    console.error("Error generating QR code:", error)
    throw error
  }
}

// Generare cod QR ca canvas
export const generateQRCodeToCanvas = async (text: string, canvas: HTMLCanvasElement): Promise<void> => {
  try {
    await QRCode.toCanvas(canvas, text, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 200,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
  } catch (error) {
    console.error("Error generating QR code to canvas:", error)
    throw error
  }
}
