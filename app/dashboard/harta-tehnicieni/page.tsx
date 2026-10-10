"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase/config";
import { attendanceDay } from "@/packages/fom-domain/attendance-policy";
import {
  TRACKING_STALE_MS,
  type TrackingPoint,
  type TrackingStop,
} from "@/packages/fom-domain/tracking";
const Map = dynamic(() => import("@/components/tracking/map"), {
  ssr: false,
  loading: () => (
    <div
      className="h-[420px] animate-pulse rounded-xl bg-slate-100"
      aria-label="Se încarcă harta"
    />
  ),
});
type Technician = {
  uid: string;
  name: string;
  sessionId: string | null;
  point: TrackingPoint | null;
  stale: boolean;
  state: string;
};
type History = {
  points: TrackingPoint[];
  segments: TrackingPoint[][];
  stops: TrackingStop[];
  truncated: boolean;
};
const empty: History = {
  points: [],
  segments: [],
  stops: [],
  truncated: false,
};
const time = (value: number) =>
  new Date(value).toLocaleTimeString("ro-RO", {
    timeZone: "Europe/Bucharest",
    hour: "2-digit",
    minute: "2-digit",
  });
async function get(path: string, signal: AbortSignal) {
  const user = auth.currentUser;
  if (!user) throw Error("Autentificare necesară.");
  const response = await fetch(path, {
    signal,
    cache: "no-store",
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  const data = await response.json();
  if (!response.ok)
    throw Error(data.error || "Datele GPS nu sunt disponibile.");
  return data;
}
export default function TrackingPage() {
  const { userData } = useAuth();
  const allowed = userData?.role === "admin" || userData?.role === "dispecer";
  const [technicians, setTechnicians] = useState<Technician[]>([]),
    [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"live" | "history">("live"),
    [day, setDay] = useState(() => attendanceDay(Date.now()));
  const [history, setHistory] = useState<History>(empty),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const live = await get("/api/tracking/live", controller.signal);
        if (controller.signal.aborted) return;
        setTechnicians(live.technicians);
        setNow(Date.now());
        if (mode === "history" && selected) {
          const data = await get(
            `/api/tracking/history?uid=${encodeURIComponent(selected)}&day=${day}`,
            controller.signal,
          );
          if (!controller.signal.aborted) setHistory(data);
        }
        if (!controller.signal.aborted) setError("");
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        running = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    setLoading(true);
    setHistory(empty);
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) {
        setNow(Date.now());
        void refresh();
      }
    }, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [allowed, mode, selected, day]);
  const visible = technicians.filter((t) => !selected || t.uid === selected);
  const markers =
    mode === "live"
      ? visible
          .filter((t) => t.point && t.sessionId)
          .map((t) => ({
            id: t.uid,
            name: t.name,
            lat: t.point!.lat,
            lng: t.point!.lng,
            stale: now - t.point!.capturedAt > TRACKING_STALE_MS,
          }))
      : [];
  return (
    <DashboardShell>
      <h1 className="text-2xl font-semibold">Hartă tehnicieni</h1>
      {!allowed ? (
        <p>Acces disponibil administratorului și dispecerului.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm">
              Vizualizare
              <select
                aria-label="Vizualizare"
                className="rounded border p-2"
                value={mode}
                onChange={(e) => setMode(e.target.value as "live" | "history")}
              >
                <option value="live">Live</option>
                <option value="history">Istoric pe zi</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Tehnician
              <select
                aria-label="Tehnician"
                className="rounded border p-2"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Toți tehnicienii</option>
                {technicians.map((t) => (
                  <option key={t.uid} value={t.uid}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {mode === "history" && (
              <label className="grid gap-1 text-sm">
                Ziua
                <input
                  className="rounded border p-2"
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  max={attendanceDay(Date.now())}
                  min={attendanceDay(Date.now() - 89 * 86400000)}
                />
              </label>
            )}
          </div>
          {loading && <p role="status">Se încarcă datele GPS…</p>}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          {mode === "history" && !selected ? (
            <p>Selectează un tehnician pentru traseul zilei.</p>
          ) : (
            <Map
              markers={markers}
              segments={mode === "history" ? history.segments : []}
              stops={mode === "history" ? history.stops : []}
            />
          )}
          {mode === "live" ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {visible.map((t) => (
                <li key={t.uid} className="rounded-xl border p-4">
                  <strong>{t.name}</strong>
                  <p>{t.sessionId ? "Pontaj activ" : "Nepontat"}</p>
                  <p>
                    {t.point
                      ? `Ultima poziție: ${time(t.point.capturedAt)}${now - t.point.capturedAt > TRACKING_STALE_MS ? " — neactualizată" : ""}`
                      : "Fără poziție GPS disponibilă"}
                  </p>
                  {t.sessionId && t.state !== "active" && (
                    <p className="text-amber-700">
                      {t.state === "permission_denied"
                        ? "Permisiune GPS lipsă"
                        : t.state === "gps_unavailable"
                          ? "GPS indisponibil"
                          : "Tracking indisponibil"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : selected && !loading ? (
            <div className="space-y-3">
              {!history.points.length && (
                <p>Nu există puncte GPS pentru ziua selectată.</p>
              )}
              {history.truncated && (
                <p>
                  Volumul zilei depășește limita de afișare; sunt prezentate
                  primele 10.000 de puncte.
                </p>
              )}
              {history.segments.length > 1 && (
                <p>
                  {history.segments.length} segmente separate. Intervalele fără
                  date nu sunt unite și nu sunt considerate opriri.
                </p>
              )}
              <h2 className="text-lg font-semibold">Opriri</h2>
              {history.stops.length ? (
                history.stops.map((s, i) => (
                  <div
                    key={`${s.sessionId}-${s.startedAt}-${i}`}
                    className="rounded border p-3"
                  >
                    {time(s.startedAt)} – {time(s.endedAt)} · {s.minutes} minute
                    · {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                  </div>
                ))
              ) : (
                <p>Nicio oprire de minimum 3 minute identificată.</p>
              )}
            </div>
          ) : null}
          <p className="text-xs text-slate-500">
            Orele sunt afișate pentru București. Istoricul GPS este disponibil
            90 de zile. Pozițiile neactualizate nu reprezintă locația curentă
            confirmată.
          </p>
        </div>
      )}
    </DashboardShell>
  );
}
