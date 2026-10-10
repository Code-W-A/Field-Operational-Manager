const parts = (value: string | number | Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Bucharest",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((p) => [p.type, p.value]),
  );
export function crmDay(value: any) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "";
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
}
export function crmLocalTime(value: any) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "";
  const p = parts(value);
  return `${p.hour}:${p.minute}`;
}
export function crmInstant(day: string, time: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("Selectează o dată și o oră validă (HH:mm).");
  const wall = Date.parse(`${day}T${time}:00Z`);
  let value = wall;
  for (let i = 0; i < 3; i++) {
    const p = parts(value),
      local = Date.parse(
        `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
      );
    value += wall - local;
  }
  if (crmDay(value) !== day || crmLocalTime(value) !== time)
    throw new Error("Ora selectată nu există în această zi în București.");
  return new Date(value).toISOString();
}
export function crmFormat(value: any) {
  const d = new Date(value);
  return value && Number.isFinite(d.getTime())
    ? d.toLocaleString("ro-RO", {
        timeZone: "Europe/Bucharest",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}
export function postponedDue(value: string, offset: number, now = new Date()) {
  const day = [crmDay(value), crmDay(now)].sort().at(-1)!;
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + offset);
  return new Date(
    Date.parse(
      crmInstant(next.toISOString().slice(0, 10), crmLocalTime(value)),
    ) +
      new Date(value).getUTCSeconds() * 1000 +
      new Date(value).getUTCMilliseconds(),
  ).toISOString();
}
