import { mergeIntervention, sameInterventionContext } from "./intervention-merge";

type Work = Record<string, any>;
export class InterventionConflict extends Error {
  constructor(public latest: Work, public comparison: ReturnType<typeof mergeIntervention>) {
    super("Unele câmpuri au fost modificate și în altă parte. Alege varianta de păstrat mai jos; ciorna rămâne disponibilă.");
  }
}

/** At most one recovery. The retry still uses the server's transactional version check. */
export async function saveInterventionWithRecovery(
  base: Work, payload: Work,
  send: (payload: Work, work: Work) => Promise<any>,
  readLatest: () => Promise<Work | null>,
) {
  try { return await send(payload, base); }
  catch (error) {
    if ((error as any)?.kind !== "conflict" ||
      (error as Error).message !== "Tichetul a fost modificat. Ciorna este păstrată.") throw error;
    const latest = await readLatest();
    if (!latest || !sameInterventionContext(base, latest))
      throw new Error("Datele de identificare ale tichetului s-au schimbat. Ciorna este păstrată; verifică tichetul înainte de a continua.");
    const comparison = mergeIntervention(base, payload, latest);
    if (comparison.conflicts.length) throw new InterventionConflict(latest, comparison);
    return send(comparison.merged, latest);
  }
}
