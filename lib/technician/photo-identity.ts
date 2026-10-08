/** Compare immutable metadata across Firestore SDKs and JSON transport. */
export function photoIdentity(value: unknown): string {
  const normalize = (input: any): any => {
    if (input?.toDate) return input.toDate().toISOString();
    if (input instanceof Date) return input.toISOString();
    if (input && typeof input === "object" && typeof input.seconds === "number" &&
        (input.type === undefined || input.type === "firestore/timestamp/1.0") &&
        Object.keys(input).every(key => ["seconds", "nanoseconds", "type"].includes(key))) {
      return new Date(input.seconds * 1000 + Math.floor((input.nanoseconds || 0) / 1e6)).toISOString();
    }
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") return Object.fromEntries(
      Object.keys(input).sort().filter(key => input[key] !== undefined).map(key => [key, normalize(input[key])]),
    );
    return input;
  };
  return JSON.stringify(normalize(value));
}
