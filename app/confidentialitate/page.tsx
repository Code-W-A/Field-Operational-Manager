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
      "FOM Teren este o aplicație profesională pentru evidența activităților de teren, deținută de NRG ACCESS SYSTEMS SRL, CUI 34272913, cu sediul în sat Roșu, județul Ilfov, Str. Rezervelor nr. 70, bl. 1, ap. 15, cod poștal 077042. NRG ACCESS SYSTEMS SRL este operatorul datelor prelucrate pentru activitățile sale prin FOM Teren. Accesul se face cu un cont furnizat de organizație.",
      "Pentru întrebări despre protecția datelor sau exercitarea drepturilor tale, ne poți contacta la mobitoolsro@gmail.com. Pentru informațiile specifice raportului tău de muncă, te poți adresa și administratorului FOM din organizație.",
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
      "Traseele GPS și fotografiile folosite pentru verificarea pontajului se păstrează 30 de zile de la colectare. Păstrarea peste acest termen se limitează la situațiile prevăzute de lege sau temeinic justificate, de exemplu pentru clarificarea unui incident ori a unui litigiu, numai pentru datele necesare și pe durata justificată de situația respectivă.",
      "Pontajele care constituie documente justificative pentru calculul salariilor se păstrează 5 ani, calculați de la 1 iulie a anului următor încheierii exercițiului financiar în care au fost întocmite, conform regulilor de arhivare financiar-contabilă. Această perioadă nu prelungește automat păstrarea traseelor GPS sau a fotografiilor de verificare a pontajului.",
      "Rapoartele, documentele și fotografiile de service se păstrează pe durata contractului și a garanției aplicabile. Ulterior, se păstrează numai documentele necesare îndeplinirii obligațiilor legale sau constatării, exercitării ori apărării unui drept în instanță, până la expirarea termenului legal aplicabil sau soluționarea definitivă a litigiului. Documentele justificative financiar-contabile urmează termenul legal de arhivare.",
      "Conturile rămân active cât timp persoanele au acces autorizat la FOM. La încetarea autorizării, accesul se dezactivează. Datele contului care nu mai sunt necesare se șterg sau se anonimizează; evidențele de serviciu supuse termenelor de mai sus se păstrează separat, cu acces limitat.",
      "La expirarea perioadelor aplicabile, datele se șterg sau se anonimizează. NRG ACCESS SYSTEMS SRL răspunde de aplicarea acestor termene și de limitarea accesului la datele păstrate pentru obligații legale sau litigii.",
    ],
  },
  {
    title: "Drepturi și solicitări",
    paragraphs: [
      "În condițiile legislației aplicabile, poți solicita informații despre datele tale, acces, rectificare, ștergere sau restricționare și poți exercita dreptul la opoziție și, unde este aplicabil, la portabilitate. Unele evidențe de serviciu pot trebui păstrate pentru îndeplinirea unor obligații legale.",
      "Pentru închiderea contului sau o solicitare referitoare la date, scrie la mobitoolsro@gmail.com și precizează contul FOM la care se referă solicitarea. Poți contacta și administratorul FOM din organizație. Conturile sunt furnizate de organizație; aplicația mobilă nu oferă înregistrare publică.",
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
          <p className="mt-4 text-slate-300">Aplicația FOM Teren · Versiune de lucru actualizată la 4 noiembrie 2026</p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl space-y-8 px-5 py-8 sm:px-8">
        <aside className="rounded-xl border border-amber-300 bg-amber-50 p-5" aria-label="Starea documentului">
          <h2 className="font-semibold">Document în pregătire</h2>
          <p className="mt-2 leading-7">Operatorul și adresa de contact au fost completate. Înainte de finalizarea documentului trebuie confirmate temeiurile juridice și destinatarii și verificată aplicarea în sistem a termenelor de păstrare de mai jos. Această pagină nu este încă informarea finală pentru lansarea în Google Play.</p>
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
