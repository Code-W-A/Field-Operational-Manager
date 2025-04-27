import { auth } from "./config"

export const updateUserPassword = async (userId: string, newPassword: string): Promise<void> => {
  try {
    // Get the current admin user
    const adminUser = auth.currentUser

    // Call the API to update the password
    const response = await fetch("/api/users/update-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        newPassword,
        adminUser: adminUser
          ? {
              uid: adminUser.uid,
              email: adminUser.email,
              displayName: adminUser.displayName,
            }
          : null,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "A apărut o eroare la actualizarea parolei")
    }

    return Promise.resolve()
  } catch (error) {
    console.error("Eroare la actualizarea parolei utilizatorului:", error)
    throw error
  }
}
