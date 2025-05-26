/**
 * Utility for handling logo data URL conversion
 * This file provides a data URL for the company logo to be used in PDF generation
 */

// Default logo data URL (transparent 1x1 pixel as fallback)
const defaultLogoDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

/**
 * Converts an image to a data URL
 * @param imgUrl - URL of the image to convert
 * @returns Promise that resolves to a data URL string
 */
export const convertImageToDataUrl = async (imgUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL("image/png"))
      } else {
        reject(new Error("Could not get canvas context"))
      }
    }
    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imgUrl}`))
    }
    img.src = imgUrl
  })
}

/**
 * Default logo data URL to use in PDF generation
 * This can be replaced with an actual logo data URL in production
 */
export const logoDataUrl = defaultLogoDataUrl
