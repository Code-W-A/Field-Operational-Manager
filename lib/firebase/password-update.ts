import { auth } from "./config"

export async function updateUserPassword(userId: string, newPassword: string) {
  try {
    // Get the current admin user
    const adminUser = auth.currentUser
    if (!adminUser) {
      throw new Error("Nu sunteți autentificat")
    }

    // Use our API route to update the password
    const response = await fetch("/api/users/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        newPassword,
        adminUser: {
          uid: adminUser.uid,
          email: adminUser.email,
          displayName: adminUser.displayName,
        },
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Server error: ${response.status}`)
    }

    const result = await response.json()
    return { success: true, message: result.message || "Parola a fost actualizată cu succes" }
  } catch (error: any) {
    console.error("Error updating password:", error)
    throw new Error(error.message || "A apărut o eroare la actualizarea parolei")
  }
}
