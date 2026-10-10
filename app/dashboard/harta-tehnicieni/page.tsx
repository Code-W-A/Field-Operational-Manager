"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Users,
  CircleCheck,
  MapPin,
  MapPinOff,
  Map as MapIcon,
  Search,
  ChevronRight,
  Clock,
  RefreshCw,
  Navigation,
  CalendarDays,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { useAuth } from "@/contexts/AuthContext";
import { auth } from "@/lib/firebase/config";
import { attendanceDay } from "@/packages/fom-domain/attendance-policy";
import type {
  TrackingPoint,
  TrackingStop,
} from "@/packages/fom-domain/tracking";
import {
  gpsDisplay,
  initials,
  trackingTime,
  type Technician,
} from "@/components/tracking/presentation";
import styles from "@/components/tracking/tracking.module.css";

const Map = dynamic(() => import("@/components/tracking/map"), {
  ssr: false,
  loading: () => (
    <div
      className={`${styles.skeleton} ${styles.mapSkeleton}`}
      aria-label="Se încarcă harta"
    />
  ),
});
type History = {
  points: TrackingPoint[];
  segments: TrackingPoint[][];
  stops: TrackingStop[];
  truncated: boolean;
};
const emptyHistory: History = {
  points: [],
  segments: [],
  stops: [],
  truncated: false,
};
type Filter = "all" | "active" | "unavailable";
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
function Statistic({
  label,
  value,
  note,
  icon: Icon,
  tone,
  loading,
  unavailable,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof Users;
  tone: string;
  loading: boolean;
  unavailable: boolean;
}) {
  return (
    <div className={styles.stat} aria-label={label}>
      <div className={`${styles.statIcon} ${tone}`}>
        <Icon size={25} aria-hidden="true" />
      </div>
      <div>
        <div className={styles.statLabel}>{label}</div>
        {loading ? (
          <div
            className={`${styles.skeleton} ${styles.statSkeleton}`}
            aria-label="Se încarcă statistica"
          />
        ) : (
          <strong className={styles.statValue}>
            {unavailable ? "—" : value}
          </strong>
        )}
        <div className={styles.statNote}>
          {loading ? "Se încarcă…" : unavailable ? "Date indisponibile" : note}
        </div>
      </div>
    </div>
  );
}
export default function TrackingPage() {
  const { userData, loading: authLoading } = useAuth();
  const allowed = userData?.role === "admin" || userData?.role === "dispecer";
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [mode, setMode] = useState<"live" | "history">("live");
  const [day, setDay] = useState(() => attendanceDay(Date.now()));
  const [history, setHistory] = useState<History>(emptyHistory);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [isVisible, setIsVisible] = useState(true);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const historyUid = mode === "history" ? selected : "";
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    let running = false;
    const refresh = async () => {
      if (running || document.hidden || controller.signal.aborted) return;
      running = true;
      setLoading(true);
      setNow(Date.now());
      try {
        // These reads are independent. Retain the live list even if the history read fails.
        const results = await Promise.allSettled([
          get("/api/tracking/live", controller.signal),
          historyUid
            ? get(
                `/api/tracking/history?uid=${encodeURIComponent(historyUid)}&day=${day}`,
                controller.signal,
              )
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        const [live, daily] = results;
        const failures: string[] = [];
        if (live.status === "fulfilled") {
          setTechnicians(live.value.technicians);
          setLastSync(Date.now());
        } else
          failures.push(
            live.reason instanceof Error
              ? live.reason.message
              : "Lista tehnicienilor nu este disponibilă.",
          );
        if (daily.status === "fulfilled" && daily.value)
          setHistory(daily.value);
        else if (daily.status === "rejected")
          failures.push(
            daily.reason instanceof Error
              ? daily.reason.message
              : "Istoricul nu este disponibil.",
          );
        setError(failures.join(" "));
      } finally {
        running = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          setHistoryLoading(false);
        }
      }
    };
    refreshRef.current = refresh;
    setHistory(emptyHistory);
    setHistoryLoading(!!historyUid);
    void refresh();
    const visibility = () => {
      setIsVisible(!document.hidden);
      if (!document.hidden) void refresh();
    };
    visibility();
    const timer = setInterval(() => {
      if (!document.hidden) {
        setNow(Date.now());
        void refresh();
      }
    }, 30000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [allowed, historyUid, day]);

  const displayed = useMemo(
    () =>
      technicians.map((technician) => ({
        technician,
        gps: gpsDisplay(technician, now),
      })),
    [technicians, now],
  );
  const total = technicians.length;
  const clockedIn = technicians.filter(
    (technician) => technician.sessionId,
  ).length;
  const gpsActive = displayed.filter((entry) => entry.gps.active).length;
  const percent = (count: number) =>
    `${total ? Math.round((count / total) * 100) : 0}% din total`;
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("ro-RO");
    return displayed.filter(
      ({ technician, gps }) =>
        technician.name.toLocaleLowerCase("ro-RO").includes(term) &&
        (filter === "all" || (filter === "active" ? gps.active : !gps.active)),
    );
  }, [displayed, query, filter]);
  const markers = useMemo(
    () =>
      mode === "live"
        ? visible
            .filter(
              ({ technician }) => technician.point && technician.sessionId,
            )
            .map(({ technician, gps }) => ({
              ...technician,
              point: technician.point!,
              gps,
            }))
        : [],
    [mode, visible],
  );
  const selectedTechnician = technicians.find(
    (technician) => technician.uid === selected,
  );
  const initialLoading = lastSync === null && loading;
  const filters: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "Toți", count: total },
    { value: "active", label: "GPS activ", count: gpsActive },
    {
      value: "unavailable",
      label: "Fără poziție actualizată",
      count: total - gpsActive,
    },
  ];
  const selectTechnician = (uid: string) => setSelected(uid);
  const viewHistory = (uid: string) => {
    setSelected(uid);
    setMode("history");
  };
  const changeFilter = (value: Filter) => {
    setFilter(value);
    if (mode === "live") setSelected("");
  };
  const syncAge =
    lastSync === null
      ? "Încă nesincronizat"
      : now - lastSync < 60000
        ? "Ultima sincronizare: acum"
        : `Ultima sincronizare: acum ${Math.floor((now - lastSync) / 60000)} min`;

  return (
    <DashboardShell>
      <div className={styles.page}>
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <Link href="/dashboard/resurse-umane/salariati">Resurse umane</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span aria-current="page">Hartă tehnicieni</span>
        </nav>
        {!allowed ? (
          <>
            <h1 className={styles.title}>Hartă tehnicieni</h1>
            <p role="status">
              {authLoading
                ? "Se verifică accesul…"
                : "Acces disponibil administratorului și dispecerului."}
            </p>
          </>
        ) : (
          <>
            <header className={styles.overview}>
              <div>
                <h1 className={styles.title}>Hartă tehnicieni</h1>
                <p className={styles.subtitle}>
                  Monitorizarea tehnicienilor din teren
                </p>
              </div>
              <div className={styles.statistics} aria-busy={initialLoading}>
                <Statistic
                  label="Total tehnicieni"
                  value={total}
                  note="în echipă"
                  icon={Users}
                  tone={styles.violet}
                  loading={initialLoading}
                  unavailable={lastSync === null && !loading}
                />
                <Statistic
                  label="Pontați"
                  value={clockedIn}
                  note={percent(clockedIn)}
                  icon={CircleCheck}
                  tone={styles.greenIcon}
                  loading={initialLoading}
                  unavailable={lastSync === null && !loading}
                />
                <Statistic
                  label="GPS activ"
                  value={gpsActive}
                  note={percent(gpsActive)}
                  icon={MapPin}
                  tone={styles.blueIcon}
                  loading={initialLoading}
                  unavailable={lastSync === null && !loading}
                />
                <Statistic
                  label="Fără poziție actualizată"
                  value={total - gpsActive}
                  note={percent(total - gpsActive)}
                  icon={MapPinOff}
                  tone={styles.redIcon}
                  loading={initialLoading}
                  unavailable={lastSync === null && !loading}
                />
              </div>
            </header>
            {error && (
              <div className={styles.error} role="alert">
                {error}{" "}
                <button
                  className={styles.textButton}
                  onClick={() => void refreshRef.current()}
                  disabled={loading}
                >
                  Reîncearcă
                </button>
              </div>
            )}
            <div className={styles.layout}>
              <aside
                className={`${styles.panel} ${styles.sidebar}`}
                aria-label="Lista tehnicienilor"
              >
                <h2 className={styles.sectionHeading}>
                  Tehnicieni{" "}
                  <span className={styles.count}>
                    {lastSync === null ? "—" : total}
                  </span>
                </h2>
                <label className={styles.search}>
                  <Search size={18} aria-hidden="true" />
                  <input
                    type="search"
                    aria-label="Caută tehnician"
                    placeholder="Caută tehnician…"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      if (mode === "live") setSelected("");
                    }}
                  />
                </label>
                <div className={styles.filters} aria-label="Filtre tehnicieni">
                  {filters.map((item) => (
                    <button
                      key={item.value}
                      className={styles.filter}
                      aria-pressed={filter === item.value}
                      onClick={() => changeFilter(item.value)}
                    >
                      {item.label}
                      <span>{lastSync === null ? "—" : item.count}</span>
                    </button>
                  ))}
                </div>
                {initialLoading ? (
                  <div
                    role="status"
                    aria-label="Se încarcă tehnicienii"
                    className={styles.technicians}
                  >
                    {Array.from({ length: 5 }, (_, index) => (
                      <div
                        key={index}
                        aria-hidden="true"
                        className={`${styles.skeleton} ${styles.rowSkeleton}`}
                      />
                    ))}
                  </div>
                ) : (
                  <ul className={styles.technicians}>
                    {visible.map(({ technician, gps }) => (
                      <li key={technician.uid}>
                        <button
                          className={styles.technician}
                          aria-pressed={selected === technician.uid}
                          aria-label={`Selectează ${technician.name}`}
                          onClick={() => selectTechnician(technician.uid)}
                        >
                          <span className={styles.avatar} aria-hidden="true">
                            {initials(technician.name)}
                          </span>
                          <span className={styles.person}>
                            <span className={styles.personName}>
                              {technician.name}
                            </span>
                            <span className={styles.personStatus}>
                              <span className={styles.attendance}>
                                <span
                                  className={`${styles.dot} ${technician.sessionId ? styles.dotGreen : styles.dotRed}`}
                                />
                                {technician.sessionId ? "Pontat" : "Nepontat"}
                              </span>
                              <span
                                className={`${styles.badge} ${styles[gps.tone]}`}
                              >
                                <MapPin size={11} aria-hidden="true" />
                                {gps.label}
                              </span>
                            </span>
                            <span className={styles.updated}>
                              <Clock size={12} aria-hidden="true" />
                              {technician.point
                                ? `Ultima poziție: ${trackingTime(technician.point.capturedAt)}`
                                : "Nicio poziție GPS disponibilă"}
                            </span>
                          </span>
                          <ChevronRight
                            size={17}
                            className={styles.chevron}
                            aria-hidden="true"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!initialLoading && !visible.length && (
                  <p className={styles.notice}>
                    {error && !lastSync
                      ? "Lista tehnicienilor nu a putut fi încărcată."
                      : total
                        ? "Niciun tehnician nu corespunde filtrelor."
                        : "Nu există tehnicieni în echipă."}
                  </p>
                )}
              </aside>
              <section
                className={`${styles.panel} ${styles.mapPanel}`}
                aria-label="Poziția tehnicienilor"
              >
                <div className={styles.mapHeader}>
                  <h2 className={styles.sectionHeading}>
                    <span className={styles.mapTitleIcon}>
                      <MapIcon size={20} aria-hidden="true" />
                    </span>
                    {mode === "live"
                      ? "Poziția tehnicienilor"
                      : "Istoricul traseului"}
                  </h2>
                  <div className={styles.sync}>
                    <span className={styles.live}>
                      <span
                        className={`${styles.dot} ${!error && isVisible ? styles.dotGreen : ""}`}
                      />
                      {error
                        ? "Actualizare indisponibilă"
                        : !isVisible
                          ? "Actualizare în pauză"
                          : loading
                            ? "Se actualizează…"
                            : "Actualizare live"}
                    </span>
                    <span>{syncAge}</span>
                    <button
                      className={styles.iconButton}
                      aria-label="Reîmprospătează pozițiile"
                      title="Reîmprospătează pozițiile"
                      onClick={() => void refreshRef.current()}
                      disabled={loading}
                    >
                      <RefreshCw size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className={styles.toolbar}>
                  <div className={styles.tabs} aria-label="Vizualizare">
                    <button
                      className={styles.tab}
                      aria-pressed={mode === "live"}
                      onClick={() => setMode("live")}
                    >
                      Live
                    </button>
                    <button
                      className={styles.tab}
                      aria-pressed={mode === "history"}
                      onClick={() => setMode("history")}
                    >
                      Istoric
                    </button>
                  </div>
                  {mode === "history" && (
                    <label className={styles.day}>
                      <CalendarDays size={16} aria-hidden="true" />
                      Ziua
                      <input
                        aria-label="Ziua traseului"
                        type="date"
                        value={day}
                        onChange={(event) => setDay(event.target.value)}
                        max={attendanceDay(Date.now())}
                        min={attendanceDay(Date.now() - 89 * 86400000)}
                      />
                    </label>
                  )}
                  {selectedTechnician && (
                    <span className={styles.selection}>
                      {selectedTechnician.name}{" "}
                      {mode === "live" && (
                        <button
                          className={styles.textButton}
                          onClick={() => setSelected("")}
                        >
                          · Deselectează
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {mode === "history" && !selected ? (
                  <p className={styles.notice}>
                    Selectează un tehnician din listă pentru traseul zilei.
                  </p>
                ) : initialLoading ? (
                  <div
                    className={`${styles.skeleton} ${styles.mapSkeleton}`}
                    role="status"
                    aria-label="Se încarcă pozițiile GPS"
                  />
                ) : (
                  <Map
                    markers={markers}
                    selectedUid={mode === "live" ? selected : ""}
                    onSelect={selectTechnician}
                    onHistory={viewHistory}
                    segments={mode === "history" ? history.segments : []}
                    stops={mode === "history" ? history.stops : []}
                    contextKey={
                      mode === "history" ? `${selected}-${day}` : "live"
                    }
                  />
                )}
                {mode === "live" &&
                  selectedTechnician &&
                  !selectedTechnician.point && (
                    <div className={styles.notice}>
                      Nu există o poziție disponibilă pentru{" "}
                      {selectedTechnician.name}.{" "}
                      <button
                        className={styles.textButton}
                        onClick={() => viewHistory(selectedTechnician.uid)}
                      >
                        Vezi istoricul →
                      </button>
                    </div>
                  )}
                {mode === "history" && selected && (
                  <div className={styles.history} aria-busy={historyLoading}>
                    {historyLoading ? (
                      <p role="status" className={styles.notice}>
                        Se încarcă traseul…
                      </p>
                    ) : (
                      <>
                        {!history.points.length && (
                          <p className={styles.notice}>
                            {error
                              ? "Istoricul nu a putut fi încărcat. Reîncearcă actualizarea."
                              : "Nu există puncte GPS pentru ziua selectată."}
                          </p>
                        )}
                        {history.truncated && (
                          <p className={styles.notice}>
                            Volumul zilei depășește limita de afișare; sunt
                            prezentate primele 10.000 de puncte.
                          </p>
                        )}
                        {history.segments.length > 1 && (
                          <p className={styles.notice}>
                            {history.segments.length} segmente separate.
                            Intervalele fără date nu sunt unite și nu sunt
                            considerate opriri.
                          </p>
                        )}
                        <h3>Opriri</h3>
                        {history.stops.length ? (
                          history.stops.map((stop, index) => (
                            <div
                              key={`${stop.sessionId}-${stop.startedAt}-${index}`}
                              className={styles.stop}
                            >
                              <span>
                                <Clock size={13} aria-hidden="true" />{" "}
                                {trackingTime(stop.startedAt)} –{" "}
                                {trackingTime(stop.endedAt)} ·{" "}
                                <strong>{stop.minutes} minute</strong>
                              </span>
                              <span>
                                {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className={styles.notice}>
                            Nicio oprire de minimum 3 minute identificată.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </section>
            </div>
            <p className={styles.footnote}>
              <Navigation size={12} aria-hidden="true" /> Orele sunt afișate
              pentru București. Istoricul GPS este disponibil 90 de zile.
              Pozițiile mai vechi de două minute sunt neactualizate și nu
              confirmă locația curentă. Trackingul funcționează numai în timpul
              pontajului.
            </p>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
