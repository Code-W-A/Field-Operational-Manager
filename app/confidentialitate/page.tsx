import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Politica de confidențialitate | FOM Teren",
  description: "Informații despre datele folosite de FOM Teren pentru pontaj și activități de service.",
  robots: { index: false, follow: false },
}

const sections = [
  {
    title: "Cine răspunde de datele tale",
    paragraphs: [
      "FOM Teren este o aplicație profesională pentru evidența activităților de teren. Accesul se face cu un cont furnizat de organizația în care lucrezi. Organizația care stabilește scopurile și regulile de utilizare a datelor de serviciu trebuie identificată în informarea finală, împreună cu datele sale de contact și, dacă este cazul, contactul responsabilului cu protecția datelor.",
      "Această versiune nu stabilește o identitate juridică sau un contact care nu au fost încă confirmate de organizație. Pentru informațiile specifice raportului tău de muncă, adresează-te administratorului FOM din organizația ta.",
    ],
  },
  {
    title: "Ce date folosește aplicația",
    paragraphs: [
      "Date de cont și identificare: adresa de email, identificatorul contului, numele și rolul profesional, necesare pentru autentificare și stabilirea accesului. Autentificarea este gestionată prin Firebase Authentication.",
      "Date de activitate: orele de pontare și depontare, sesiunile de lucru, tichetele atribuite, intervențiile, reviziile, instalările, echipamentele, observațiile și documentele de service. Documentele pot include datele de contact ale clienților și semnăturile persoanelor implicate.",
      "Localizare: poziția aproximativă sau precisă și punctele traseului de serviciu, în funcție de permisiunile acordate. În timpul unui pontaj activ, aplicația poate înregistra localizarea inclusiv în fundal sau când ecranul este blocat. Înregistrarea traseului se oprește la depontare. Punctele deja colectate pot fi trimise ulterior dacă nu exista conexiune la internet.",
      "Fotografii și fișiere: imaginile realizate sau selectate pentru lucrări, codurile QR scanate și fișierele atașate documentelor. Dacă fluxul de pontaj folosit solicită un selfie, acesta este tratat ca fotografie de pontaj. Confirmarea prin blocarea telefonului folosește mecanismul sistemului de operare; aplicația nu primește șablonul amprentei, datele Face ID sau codul de deblocare al telefonului.",
      "Date tehnice: informații despre dispozitiv și versiunea aplicației, identificatori pentru autentificare și notificări, starea conexiunii și informații necesare livrării operațiilor de lucru.",
    ],
  },
  {
    title: "De ce sunt folosite datele",
    paragraphs: [
      "Datele susțin autentificarea, controlul accesului, evidența timpului de lucru și a deplasărilor de serviciu, atribuirea și executarea lucrărilor, întocmirea documentelor, notificările operaționale și funcționarea tehnică a aplicației.",
      "Organizația trebuie să precizeze separat temeiul juridic aplicabil fiecărui scop și regulile de monitorizare a activității de serviciu. Acordarea unei permisiuni Android sau acceptarea termenilor din aplicație nu înlocuiește stabilirea acestui temei juridic.",
    ],
  },
  {
    title: "Permisiunile telefonului",
    paragraphs: [
      "Localizarea, inclusiv accesul în fundal, susține pontajul și traseul din timpul sesiunii de lucru. Camera susține fotografiile de lucru și scanarea codurilor QR. Selectorul de fotografii și fișiere permite alegerea documentelor pe care le atașezi. Notificările transmit informații despre activitatea de serviciu.",
      "Poți administra sau retrage permisiunile din setările telefonului. Refuzarea unei permisiuni poate împiedica funcțiile care depind de ea, inclusiv pornirea pontajului sau înregistrarea traseului. Pentru confirmarea pontajului, telefonul poate solicita propriul PIN, parola de deblocare sau o verificare biometrică.",
    ],
  },
  {
    title: "Cine poate primi datele",
    paragraphs: [
      "Datele de serviciu sunt accesibile persoanelor autorizate potrivit rolurilor configurate în organizație. Documentele de lucru pot fi transmise beneficiarilor și destinatarilor desemnați în fluxurile de service.",
      "Aplicația folosește servicii tehnice Firebase/Google pentru autentificare, stocarea datelor și fișierelor și notificări, precum și infrastructura de găzduire a serviciilor FOM. Lista contractuală a furnizorilor, locațiile de prelucrare și garanțiile aplicabile eventualelor transferuri internaționale trebuie confirmate de organizație înainte de publicarea informării finale.",
      "Aplicația mobilă nu conține reclame. Datele de serviciu nu sunt prezentate public în pagina Google Play.",
    ],
  },
  {
    title: "Păstrarea, accesul și securitatea",
    paragraphs: [
      "Accesul la informațiile de lucru este limitat prin autentificare și drepturi de cont. În aplicația mobilă, detaliile lucrărilor sunt condiționate și de pontajul activ. După depontare, istoricul notificărilor poate rămâne disponibil contului autentificat.",
      "Datele de autentificare și anumite preferințe sunt păstrate pe dispozitiv. Unele operații sau puncte de traseu colectate în timpul unei sesiuni pot aștepta conexiunea pentru a fi trimise. Dezinstalarea aplicației nu șterge automat evidențele de serviciu de pe server.",
      "Duratele de păstrare pentru conturi, pontaje, trasee, fotografii și documente trebuie stabilite de organizație în funcție de scopurile și obligațiile sale. Aceste durate nu sunt încă confirmate în această versiune de lucru; nu se promite o ștergere automată după un termen inventat.",
    ],
  },
  {
    title: "Drepturi și solicitări",
    paragraphs: [
      "În condițiile legislației aplicabile, poți solicita informații despre datele tale, acces, rectificare, ștergere sau restricționare și poți exercita dreptul la opoziție și, unde este aplicabil, la portabilitate. Unele evidențe de serviciu pot trebui păstrate pentru îndeplinirea unor obligații legale.",
      "Pentru închiderea contului sau o solicitare referitoare la date, contactează administratorul FOM din organizația ta. Conturile sunt furnizate de organizație; aplicația mobilă nu oferă înregistrare publică. Datele de contact directe și procedura finală de răspuns trebuie completate în informarea aprobată de organizație.",
      "Dacă prelucrarea intră sub incidența GDPR, ai și dreptul de a depune o plângere la autoritatea de supraveghere competentă.",
    ],
  },
  {
    title: "Utilizare profesională și actualizări",
    paragraphs: [
      "FOM Teren este destinată utilizatorilor autorizați pentru activități profesionale și nu este concepută pentru copii. Politica trebuie actualizată atunci când se schimbă funcțiile aplicației sau regulile de prelucrare a datelor.",
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#14171f] text-white">
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
          <p className="mb-5 text-sm font-semibold tracking-widest text-orange-400">FOM / TEREN</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Politica de confidențialitate</h1>
          <p className="mt-4 text-slate-300">Aplicația FOM Teren · Versiune de lucru din 3 noiembrie 2026</p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-8 px-5 py-8 sm:px-8">
        <aside className="rounded-xl border border-amber-300 bg-amber-50 p-5" aria-label="Starea documentului">
          <h2 className="font-semibold">Document în pregătire</h2>
          <p className="mt-2 leading-7">Înainte de publicare trebuie confirmate identitatea și contactul operatorului, temeiurile juridice, destinatarii și duratele de păstrare. Această pagină nu este încă informarea finală pentru lansarea în Google Play.</p>
        </aside>
        <nav aria-label="Cuprins" className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Cuprins</h2>
          <ol className="mt-3 list-inside list-decimal space-y-2">
            {sections.map((section, index) => (
              <li key={section.title}><a className="text-teal-800 underline underline-offset-4" href={`#sectiunea-${index + 1}`}>{section.title}</a></li>
            ))}
          </ol>
        </nav>
        {sections.map((section, index) => (
          <section key={section.title} id={`sectiunea-${index + 1}`} className="scroll-mt-6 rounded-xl border bg-white p-5 sm:p-7">
            <h2 className="text-xl font-semibold">{index + 1}. {section.title}</h2>
            <div className="mt-4 space-y-4 leading-7 text-slate-700">
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </section>
        ))}
        <footer className="space-y-3 pb-6 text-sm text-slate-600">
          <p><a className="underline underline-offset-4" href="https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en">Informații despre drepturile persoanelor vizate — Comisia Europeană</a></p>
          <p><Link className="underline underline-offset-4" href="/">Înapoi la FOM</Link></p>
        </footer>
      </div>
    </main>
  )
}
