/** Additive mobile codes; legacy servers are classified by the same rules on the client. */
export function mobileErrorCode(
  message: string,
  status = 0,
): string | undefined {
  if (/data.*invalid|dată.*invalid|ora.*invalid|oră.*invalid/i.test(message))
    return "DATE_INVALID";
  if (
    /Verifică echipamentul înainte|Verificarea QR este obligatorie/i.test(
      message,
    )
  )
    return "EQUIPMENT_VERIFICATION_REQUIRED";
  if (/Completează toate fișele de revizie/i.test(message))
    return "REVISION_REQUIRED";
  if (/semnătur.*obligator|semnătur.*necesar/i.test(message))
    return "SIGNATURE_REQUIRED";
  if (/email.*invalid|destinatar.*necesar|adres.*email.*necesar/i.test(message))
    return "RECIPIENT_REQUIRED";
  if (/maximum 3 MB|cel mult 3 MB/i.test(message)) return "FILE_TOO_LARGE";
  if (/maximum 4 fotografii/i.test(message)) return "PHOTO_LIMIT";
  if (/Așteaptă.*secunde.*oprirea pontajului/i.test(message))
    return "WAIT_BEFORE_CHECKOUT";
  if (
    /locați.*nu.*determinat|determinarea locației|locați.*nu.*disponibil/i.test(
      message,
    )
  )
    return "LOCATION_TIMEOUT";
  if (
    /Buildul instalat|tracking GPS.*build|contractului FOM.*compatibil/i.test(
      message,
    )
  )
    return "NATIVE_UPDATE_REQUIRED";
  if (/Acceptă.*termen|termenii.*acceptați/i.test(message))
    return "MOBILE_TERMS_REQUIRED";
  if (
    /locați.*[«„]Tot timpul|localizare în fundal|locație.*Tot timpul/i.test(
      message,
    )
  )
    return "BACKGROUND_LOCATION_REQUIRED";
  if (/permite.*camer|accesul la camer/i.test(message))
    return "CAMERA_REQUIRED";
  if (/GPS oprit|Activează Locația|Activează.*GPS/i.test(message))
    return "LOCATION_DISABLED";
  if (/permite.*locați|permisiun.*locați/i.test(message))
    return "LOCATION_REQUIRED";
  if (
    /QR-ul nu corespunde|Echipament neasociat|cod.*nu corespunde/i.test(message)
  )
    return "EQUIPMENT_MISMATCH";
  if (/asociat.*salariat|asociere.*HR|salariat.*asociat/i.test(message))
    return "EMPLOYEE_REQUIRED";
  if (/Confirmă lucrul în ziua specială/i.test(message))
    return "SPECIAL_DAY_CONFIRMATION";
  if (/Există deja un pontaj activ|Sesiune existentă/i.test(message))
    return "ATTENDANCE_ALREADY_ACTIVE";
  if (/Sesiunea activă s-a schimbat|Sesiune inaccesibilă/i.test(message))
    return "ATTENDANCE_CHANGED";
  if (/Pornește pontajul|pontaj activ confirmat/i.test(message))
    return "MOBILE_ATTENDANCE_REQUIRED";
  if (/Completează constatarea și descrierea/i.test(message))
    return "INTERVENTION_REQUIRED";
  if (/Selectează cauza principală/i.test(message)) return "CAUSE_REQUIRED";
  if (
    /Completează|câmp.*obligator|semnătur.*obligator|semn.*necesar/i.test(
      message,
    )
  )
    return "REQUIRED_FIELDS";
  if (/Ai deja o intervenție în lucru/i.test(message))
    return "ACTIVE_WORK_EXISTS";
  if (
    /nu îți mai este atribuit|Tichet inaccesibil|Tichet inexistent|Lucrarea nu este disponibilă/i.test(
      message,
    )
  )
    return "WORK_UNAVAILABLE";
  if (
    /Salvarea precedentă nu este confirmată|Confirmarea serverului nu a sosit/i.test(
      message,
    )
  )
    return "CONFIRMATION_PENDING";
  if (/internet|Conexiunea s-a întrerupt/i.test(message))
    return "NETWORK_REQUIRED";
  if (status === 401) return "SESSION_CHANGED";
  if (status === 409) return "DATA_CHANGED";
  if (status === 403) return "ACCESS_DENIED";
  return undefined;
}
