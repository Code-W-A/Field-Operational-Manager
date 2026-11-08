import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { bucharestDate, invoiceEditReason } from "./draft";
import {
  BNR_BASE,
  eurCalendarDate,
  eurError,
  parseBnrXml,
  selectBnrRate,
  parseEurReference,
  validEurValue,
  isBnrUrl,
  type EurReference,
  type EurQuote,
  type BnrRate,
} from "./eur-rate";
type Actor = { uid: string; role: string };
type Cache = { sourceUrl: string; checkedAt: string; rates: BnrRate[] };
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export function createEurRateService(
  db: Firestore,
  deps: { fetch?: typeof fetch; now?: () => Date; timeoutMs?: number } = {},
) {
  const transport = deps.fetch || fetch,
    now = deps.now || (() => new Date()),
    timeout = deps.timeoutMs || 5000,
    inFlight = new Map<string, Promise<Cache>>();
  const ident = (v: string) => {
    if (!v || v.length > 200 || /[\/\x00-\x1f]/.test(v))
      throw eurError("Identificator invalid.", "EUR_INVALID_INPUT", 400);
    return v;
  };
  async function authorize(actor: Actor, tx?: Transaction) {
    if (!actor?.uid || !["admin", "dispecer"].includes(actor.role))
      throw eurError("Nu ai acces la cursul EUR.", "FORBIDDEN", 403);
    const ref = db.doc(`users/${ident(actor.uid)}`),
      u = (tx ? await tx.get(ref) : await ref.get()).data();
    if (!u || u.disabled || u.role !== actor.role)
      throw eurError("Nu ai acces la cursul EUR.", "FORBIDDEN", 403);
  }
  async function readSource(url: string): Promise<Cache> {
    if (!isBnrUrl(url)) throw eurError("Sursă BNR nepermisă.");
    const ref = db.collection("invoiceExchangeRateCache").doc(hash(url)),
      cached = (await ref.get()).data() as Cache | undefined,
      currentYear = Number(bucharestDate(now()).slice(0, 4)),
      year = Number(url.match(/nbrfxrates(\d{4})\.xml$/)?.[1] || currentYear),
      ttl = year < currentYear ? 86400000 : 900000,
      age = cached ? now().getTime() - Date.parse(cached.checkedAt) : NaN;
    if (
      cached &&
      cached.sourceUrl === url &&
      Number.isFinite(age) &&
      age >= 0 &&
      age < ttl
    )
      return cached;
    const existing = inFlight.get(url);
    if (existing) return existing;
    const request = (async () => {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await transport(url, {
          headers: { Accept: "application/xml,text/xml" },
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw eurError(
            `Preluarea BNR a eșuat (HTTP ${response.status}).`,
            "EUR_BNR_HTTP",
            response.status === 404 ? 404 : 502,
          );
        }
        const reader = response.body?.getReader();
        if (!reader) throw eurError("Răspuns BNR gol.");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const item = await reader.read();
            if (item.done) break;
            size += item.value.byteLength;
            if (size > 2 * 1024 * 1024)
              throw eurError("Răspunsul BNR depășește limita acceptată.");
            chunks.push(item.value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        const text = Buffer.concat(chunks).toString("utf8"),
          rates = parseBnrXml(text),
          saved = { sourceUrl: url, checkedAt: now().toISOString(), rates };
        if (rates.some((r) => r.date > bucharestDate(now())))
          throw eurError("BNR a returnat un curs cu dată viitoare.");
        await ref.set(saved);
        return saved;
      } catch (e) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          String((e as any).code).startsWith("EUR_")
        )
          throw e;
        throw eurError(
          controller.signal.aborted
            ? "Preluarea cursului BNR a expirat."
            : "Cursul BNR nu poate fi preluat momentan.",
          "EUR_BNR_UNAVAILABLE",
          503,
        );
      } finally {
        clearTimeout(timer);
      }
    })();
    inFlight.set(url, request);
    try {
      return await request;
    } finally {
      inFlight.delete(url);
    }
  }
  async function quote(date: string): Promise<EurQuote> {
    eurCalendarDate(date);
    const today = bucharestDate(now());
    if (date > today)
      throw eurError(
        "Cursul pentru o dată viitoare nu este disponibil.",
        "EUR_FUTURE_DATE",
        409,
      );
    const year = Number(date.slice(0, 4));
    if (year < 2005)
      throw eurError(
        "Arhiva BNR pentru această dată nu este disponibilă.",
        "EUR_NO_HISTORY",
        404,
      );
    const recent = Date.parse(today) - Date.parse(date) < 14 * 86400000;
    let selected: BnrRate | null = null,
      source: Cache | undefined;
    if (recent) {
      source = await readSource(`${BNR_BASE}/nbrfxrates10days.xml`);
      selected = selectBnrRate(source.rates, date);
    }
    if (!selected) {
      try {
        source = await readSource(
          `${BNR_BASE}/files/xml/years/nbrfxrates${year}.xml`,
        );
        selected = selectBnrRate(source.rates, date);
      } catch (e) {
        if (
          !(
            (e as any).code === "EUR_BNR_HTTP" &&
            (e as any).status === 404 &&
            date.slice(5) <= "01-07"
          )
        )
          throw e;
      }
    }
    if (!selected) {
      source = await readSource(
        `${BNR_BASE}/files/xml/years/nbrfxrates${year - 1}.xml`,
      );
      selected = selectBnrRate(source.rates, date);
    }
    if (!selected || !source)
      throw eurError(
        "Nu există un curs EUR verificabil pentru data facturii.",
        "EUR_NO_RATE",
        404,
      );
    const quoteId = hash({
        date,
        rateDate: selected.date,
        value: selected.value,
        sourceUrl: source.sourceUrl,
      }),
      ref = db.collection("invoiceExchangeRateQuotes").doc(quoteId),
      candidate: EurQuote = {
        status: "available",
        quoteId,
        requestedDate: date,
        value: selected.value,
        rateDate: selected.date,
        source: "BNR",
        sourceUrl: source.sourceUrl,
        fetchedAt: source.checkedAt,
      };
    return db.runTransaction(async (tx) => {
      const prior = (await tx.get(ref)).data() as EurQuote | undefined;
      if (prior) return prior;
      tx.create(ref, candidate);
      return candidate;
    });
  }
  async function resolveIn(
    tx: Transaction,
    input: EurReference | undefined,
    date: string,
    actor: Actor,
    previous?: EurReference,
    required = false,
  ): Promise<EurReference | undefined> {
    const value = parseEurReference(input);
    if (!value) {
      if (required)
        throw eurError(
          "Salvează cursul EUR propus sau confirmă explicit continuarea fără curs.",
          "EUR_REFERENCE_REQUIRED",
          409,
        );
      return;
    }
    if (value.requestedDate !== date)
      throw eurError(
        "Data facturii s-a schimbat. Actualizează cursul EUR sau confirmarea omiterii.",
        "EUR_DATE_CONFLICT",
        409,
      );
    if (value.status === "omitted") {
      if (
        previous?.status === "omitted" &&
        previous.requestedDate === date &&
        previous.confirmedBy &&
        previous.confirmedAt
      )
        return previous;
      return {
        status: "omitted",
        requestedDate: date,
        confirmedBy: actor.uid,
        confirmedAt: now().toISOString(),
      };
    }
    const saved = (
      await tx.get(
        db.collection("invoiceExchangeRateQuotes").doc(value.quoteId),
      )
    ).data() as EurQuote | undefined;
    if (
      !saved ||
      saved.status !== "available" ||
      saved.quoteId !== value.quoteId ||
      saved.requestedDate !== date ||
      !validEurValue(saved.value) ||
      !saved.rateDate ||
      saved.rateDate > date ||
      !isBnrUrl(saved.sourceUrl) ||
      saved.source !== "BNR"
    )
      throw eurError(
        "Referința cursului EUR nu poate fi verificată.",
        "EUR_REFERENCE_CONFLICT",
        409,
      );
    for (const k of [
      "value",
      "rateDate",
      "source",
      "sourceUrl",
      "fetchedAt",
    ] as const)
      if (value[k] !== undefined && value[k] !== saved[k])
        throw eurError(
          "Datele cursului EUR nu pot fi modificate manual.",
          "EUR_REFERENCE_TAMPERED",
          403,
        );
    return saved;
  }
  async function get(actor: Actor, workId: string, date: string) {
    await authorize(actor);
    ident(workId);
    eurCalendarDate(date);
    const [w, d, f] = await Promise.all([
      db.doc(`lucrari/${workId}`).get(),
      db.doc(`invoiceDrafts/${workId}`).get(),
      db.doc(`invoices/${workId}`).get(),
    ]);
    if (!w.exists) throw eurError("Tichetul nu există.", "NOT_FOUND", 404);
    const reason = invoiceEditReason(w.data()!);
    if (f.exists || reason)
      return {
        reference: f.exists
          ? f.data()?.snapshot?.eurReference || null
          : d.data()?.eurReference || null,
        readOnly: true,
        reason: reason || "Document înghețat.",
      };
    return { reference: await quote(date), readOnly: false };
  }
  return { get, quote, readSource, resolveIn };
}
