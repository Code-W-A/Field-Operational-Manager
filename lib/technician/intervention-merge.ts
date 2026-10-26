type Work = Record<string, any>;

export const interventionGroups = {
  constatareLaLocatie: ["constatareLaLocatie"],
  descriereInterventie: ["descriereInterventie"],
  statusEchipament: ["statusEchipament"],
  cauzaPrincipalaDefect: ["cauzaPrincipalaDefectId", "cauzaPrincipalaDefect"],
  necesitaOferta: ["necesitaOferta", "comentariiOferta"],
  notaInternaTehnician: ["notaInternaTehnician"],
  garantie: ["tehnicianGarantieDecizie", "tehnicianGarantieNuIntraMotiv", "tehnicianConfirmaGarantie"],
  imaginiDefecte: ["imaginiDefecte"],
} satisfies Record<string, string[]>;

export const interventionLabels: Record<string, string> = {
  constatareLaLocatie: "Constatare la locație", descriereInterventie: "Descriere intervenție",
  statusEchipament: "Status echipament", cauzaPrincipalaDefect: "Cauza defectului",
  necesitaOferta: "Ofertă și comentarii", notaInternaTehnician: "Notă internă",
  garantie: "Decizie de garanție", imaginiDefecte: "Fotografii",
};

// Defaults match the form, so untouched empty fields are not mistaken for edits.
export function interventionValues(work: Work): Work {
  const result: Work = {};
  for (const key of Object.values(interventionGroups).flat()) {
    result[key] = work[key] ?? (key === "imaginiDefecte" ? [] :
      ["necesitaOferta", "tehnicianConfirmaGarantie"].includes(key) ? false :
      key === "statusEchipament" ? "Funcțional" : "");
  }
  if (!result.tehnicianGarantieDecizie && work.tehnicianConfirmaGarantie === true)
    result.tehnicianGarantieDecizie = "confirma";
  return result;
}
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) :
  value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const equal = (a: any, b: any) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const photoKey = (p: Work) => p.id || p.path || p.url;

function mergePhotos(base: Work[], local: Work[], remote: Work[]): Work[] | null {
  if ([...base, ...local, ...remote].some(p => !photoKey(p))) return null;
  const map = (photos: Work[]) => new Map(photos.map(p => [photoKey(p), p]));
  const b = map(base), l = map(local), r = map(remote), result: Work[] = [];
  for (const key of new Set([...r.keys(), ...l.keys(), ...b.keys()])) {
    const before = b.get(key), mine = l.get(key), theirs = r.get(key);
    // Deletion wins over an untouched copy, but never over an edited copy.
    if (!equal(mine, before) && !equal(theirs, before) && !equal(mine, theirs)) return null;
    const chosen = equal(mine, before) ? theirs : mine;
    if (chosen) result.push(chosen);
  }
  return result.length <= 4 ? result : null;
}

export function mergeIntervention(base: Work, local: Work, latest: Work) {
  const b = interventionValues(base), l = interventionValues({ ...base, ...local }), r = interventionValues(latest);
  const merged = { ...r }, conflicts: string[] = [];
  for (const [group, keys] of Object.entries(interventionGroups)) {
    const changed = (x: Work, y: Work) => keys.some(k => !equal(x[k], y[k]));
    if (!changed(l, b)) continue;
    if (!changed(r, b) || !changed(l, r)) {
      for (const k of keys) merged[k] = l[k];
    } else if (group === "imaginiDefecte") {
      const photos = mergePhotos(b.imaginiDefecte, l.imaginiDefecte, r.imaginiDefecte);
      if (photos) merged.imaginiDefecte = photos;
      else conflicts.push(group);
    } else conflicts.push(group);
  }
  return { merged, conflicts, local: l, remote: r };
}

// Reassignment, a different equipment/client or a changed workflow needs a new review.
export function sameInterventionContext(base: Work, latest: Work) {
  return ["tipLucrare", "echipamentCod", "clientId", "locationId", "equipmentId"]
    .every(key => base[key] === undefined || equal(base[key], latest[key]));
}
