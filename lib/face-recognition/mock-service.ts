import type { FaceRecognitionResult } from "@/types/attendance"

/**
 * Mock face recognition service
 * Simulates camera capture and face recognition processing
 * In production, this would be replaced with actual face recognition API
 */

export interface MockFaceRecognitionOptions {
  successRate?: number // 0-1, default 0.95 (95% success rate)
  processingTime?: number // milliseconds, default 2000
  userId?: string // For kiosk mode, to match against selected user
}

/**
 * Simulate camera capture
 */
export async function captureImage(): Promise<string> {
  // Simulate camera delay
  await delay(500)
  
  // Return mock image data (base64 placeholder)
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
}

/**
 * Process face recognition (mock)
 */
export async function processFaceRecognition(
  imageData: string,
  options: MockFaceRecognitionOptions = {}
): Promise<FaceRecognitionResult> {
  const {
    successRate = 0.95,
    processingTime = 2000,
    userId,
  } = options

  // Simulate processing time
  const startTime = Date.now()
  await delay(processingTime)
  const endTime = Date.now()

  // Random success/failure based on success rate
  const isSuccessful = Math.random() < successRate

  if (!isSuccessful) {
    return {
      success: false,
      error: "Face not recognized. Please try again.",
      processingTime: endTime - startTime,
    }
  }

  // Generate mock face ID
  const faceId = userId 
    ? `face_${userId}_${Date.now()}`
    : `face_${generateRandomId()}_${Date.now()}`

  return {
    success: true,
    confidence: 0.85 + Math.random() * 0.15, // 85-100% confidence
    faceId,
    processingTime: endTime - startTime,
  }
}

/**
 * Complete flow: capture + process
 */
export async function recognizeFace(
  options: MockFaceRecognitionOptions = {}
): Promise<FaceRecognitionResult> {
  try {
    // Step 1: Capture image
    const imageData = await captureImage()

    // Step 2: Process recognition
    const result = await processFaceRecognition(imageData, options)

    return result
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Face recognition failed",
    }
  }
}

/**
 * Check if camera is available
 */
export async function isCameraAvailable(): Promise<boolean> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false
    }

    // Try to get camera permissions
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    
    // Stop the stream immediately
    stream.getTracks().forEach(track => track.stop())
    
    return true
  } catch (error) {
    console.error("Camera not available:", error)
    return false
  }
}

/**
 * Request camera permission
 */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach(track => track.stop())
    return true
  } catch (error) {
    console.error("Camera permission denied:", error)
    return false
  }
}

// Helper functions

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function generateRandomId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
}

/**
 * Mock face recognition with specific user matching (for kiosk mode)
 */
export async function recognizeFaceForUser(
  userId: string,
  userName: string
): Promise<FaceRecognitionResult> {
  const result = await recognizeFace({ userId, processingTime: 1500 })
  
  if (result.success) {
    // Add user info to result
    return {
      ...result,
      faceId: `face_${userId}_${Date.now()}`,
    }
  }
  
  return result
}
