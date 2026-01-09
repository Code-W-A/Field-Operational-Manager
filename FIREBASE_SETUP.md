## Firebase setup (pentru “totul dinamic”)

Ca paginile să fie complet dinamice, aplicația trebuie să aibă Firebase configurat corect în:
- **Vercel Environment Variables** (Production/Preview)
- **local `.env.local`** (în development)

### Variabile necesare (client)

Setează următoarele variabile (exact cu aceste nume):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (dacă folosești upload-uri)
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (opțional)

### Firestore (date)

Pentru modulele HR, datele vin din Firestore (realtime):
- colecția `hrEmployees`
- colecția `hrTimesheets`

### Firebase Storage (fișiere)

**Storage nu e obligatoriu pentru HR** (salariați/condică/rapoarte), dar devine necesar dacă există funcționalități de upload (poze/PDF etc.) în alte module.

### Seed / “mock” HR (doar pentru dev/demo)

Există un seed de exemple HR care poate popula Firestore dacă baza e goală.
În cod, seed-ul este:
- **activ implicit în development**
- **dezactivat implicit în production**
- activabil explicit prin:
  - `NEXT_PUBLIC_ENABLE_HR_SEED=true`


