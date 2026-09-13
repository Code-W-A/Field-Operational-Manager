export const REVISION_CLIENT_NOTICE_TEXT =
  "Înștiințare: Vă rugăm să aveți în vedere că durata estimată pentru revizia fiecărui echipament este de 30–45 de minute. Manopera care depășește cele 45 de minute incluse pentru fiecare echipament va fi facturată suplimentar."

export interface RevisionClientNotice {
  html: string
  text: string
}

export function getRevisionClientNotice(workType: unknown, isPostponed: boolean): RevisionClientNotice | null {
  const normalizedWorkType = String(workType || "").trim().toLocaleLowerCase("ro-RO")

  if (isPostponed || normalizedWorkType !== "revizie") {
    return null
  }

  const [, message = ""] = REVISION_CLIENT_NOTICE_TEXT.split(": ", 2)

  return {
    html: `
      <div style="background-color: #fff8e6; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #d97706; color: #78350f;">
        <p style="margin: 0;"><strong>Înștiințare:</strong> ${message}</p>
      </div>
    `,
    text: REVISION_CLIENT_NOTICE_TEXT,
  }
}
