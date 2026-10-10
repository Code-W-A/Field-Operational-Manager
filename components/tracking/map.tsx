"use client";

import { useEffect, useRef, useState } from "react";
import { Expand, LocateFixed, Minimize } from "lucide-react";
import type {
  Map as LeafletMap,
  LayerGroup,
  LatLngBounds,
  Marker,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  TrackingPoint,
  TrackingStop,
} from "@/packages/fom-domain/tracking";
import {
  initials,
  trackingTime,
  type Technician,
  type GpsDisplay,
} from "./presentation";
import styles from "./tracking.module.css";

export type MapMarker = Technician & { point: TrackingPoint; gps: GpsDisplay };
type Props = {
  markers: MapMarker[];
  segments: TrackingPoint[][];
  stops: TrackingStop[];
  selectedUid: string;
  onSelect: (uid: string) => void;
  onHistory: (uid: string) => void;
  contextKey: string;
};
function node(tag: string, className: string, text?: string) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function popup(marker: MapMarker, onHistory: () => void) {
  const card = node("div", styles.popup);
  const heading = node("div", styles.popupHead);
  heading.append(node("span", styles.avatar, initials(marker.name)));
  const person = node("div", styles.person);
  person.append(node("strong", styles.personName, marker.name));
  const status = node("div", styles.personStatus);
  status.append(
    node("span", styles.attendance, marker.sessionId ? "Pontat" : "Nepontat"),
    node(
      "span",
      `${styles.badge} ${styles[marker.gps.tone]}`,
      marker.gps.label,
    ),
  );
  person.append(status);
  heading.append(person);
  card.append(heading);
  card.append(
    node(
      "div",
      styles.popupRow,
      `Ultima poziție: ${trackingTime(marker.point.capturedAt)}`,
    ),
  );
  card.append(
    node(
      "div",
      styles.popupRow,
      `Precizie: ±${Math.round(marker.point.accuracy)} m`,
    ),
  );
  card.append(
    node(
      "div",
      styles.popupRow,
      `${marker.point.lat.toFixed(5)}, ${marker.point.lng.toFixed(5)}`,
    ),
  );
  const button = node(
    "button",
    styles.popupButton,
    "Vezi istoricul →",
  ) as HTMLButtonElement;
  button.type = "button";
  button.addEventListener("click", onHistory);
  card.append(button);
  return card;
}
export default function TrackingMap({
  markers,
  segments,
  stops,
  selectedUid,
  onSelect,
  onHistory,
  contextKey,
}: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layers = useRef<LayerGroup | null>(null);
  const markerLayers = useRef(new Map<string, Marker>());
  const bounds = useRef<LatLngBounds | null>(null);
  const fittedContext = useRef<string | null>(null);
  const focused = useRef<string | null>(null);
  const callbacks = useRef({ onSelect, onHistory });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  useEffect(() => {
    callbacks.current = { onSelect, onHistory };
  }, [onSelect, onHistory]);
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    setFullscreenAvailable(document.fullscreenEnabled);
    const fullscreenChange = () => {
      setFullscreen(document.fullscreenElement === frame.current);
      map.current?.invalidateSize();
    };
    document.addEventListener("fullscreenchange", fullscreenChange);
    void import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        const instance = L.map(container.current, {
          fadeAnimation: false,
          zoomAnimation: false,
          markerZoomAnimation: false,
        }).setView([44.4268, 26.1025], 11);
        map.current = instance;
        layers.current = L.layerGroup().addTo(instance);
        L.tileLayer(
          process.env.NEXT_PUBLIC_TRACKING_TILE_URL ||
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          },
        )
          .on("tileerror", () =>
            setError(
              "Fundalul hărții nu s-a încărcat. Lista și punctele GPS rămân disponibile.",
            ),
          )
          .addTo(instance);
        resize = new ResizeObserver(() => instance.invalidateSize());
        resize.observe(container.current);
        setReady(true);
      })
      .catch(() =>
        setError("Harta nu s-a putut încărca. Consultă lista tehnicienilor."),
      );
    return () => {
      cancelled = true;
      resize?.disconnect();
      document.removeEventListener("fullscreenchange", fullscreenChange);
      map.current?.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void import("leaflet")
      .then((L) => {
        if (cancelled || !map.current || !layers.current) return;
        const reopenPopup =
          markerLayers.current.get(selectedUid)?.isPopupOpen() ||
          focused.current !== selectedUid;
        layers.current.clearLayers();
        markerLayers.current.clear();
        const visibleBounds = L.latLngBounds([]);
        markers.forEach((marker) => {
          const icon = node(
            "div",
            `${styles.marker} ${!marker.gps.active ? styles.markerInactive : ""} ${selectedUid === marker.uid ? styles.markerSelected : ""}`,
            initials(marker.name),
          );
          icon.append(
            node(
              "span",
              `${styles.markerDot} ${marker.gps.tone === "green" ? styles.dotGreen : marker.gps.tone === "red" ? styles.dotRed : ""}`,
            ),
          );
          const layer = L.marker([marker.point.lat, marker.point.lng], {
            icon: L.divIcon({
              html: icon,
              className: "",
              iconSize: [42, 42],
              iconAnchor: [21, 21],
              popupAnchor: [0, -25],
            }),
            title: `${marker.name} — ${marker.gps.label}`,
            alt: `${marker.name} — ${marker.gps.label}`,
            keyboard: true,
          }).bindPopup(
            popup(marker, () => callbacks.current.onHistory(marker.uid)),
            { autoPan: false, maxWidth: 290 },
          );
          layer.on("click", () => callbacks.current.onSelect(marker.uid));
          layer.addTo(layers.current!);
          layer.getElement()?.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            callbacks.current.onSelect(marker.uid);
            layer.openPopup();
          });
          markerLayers.current.set(marker.uid, layer);
          if (selectedUid === marker.uid && reopenPopup) layer.openPopup();
          visibleBounds.extend([marker.point.lat, marker.point.lng]);
        });
        segments.forEach((segment) => {
          const coordinates = segment.map(
            (point) => [point.lat, point.lng] as [number, number],
          );
          if (coordinates.length === 1)
            L.circleMarker(coordinates[0], {
              radius: 5,
              color: "#2563eb",
            }).addTo(layers.current!);
          if (coordinates.length > 1)
            L.polyline(coordinates, { color: "#2563eb", weight: 4 }).addTo(
              layers.current!,
            );
          coordinates.forEach((coordinate) => visibleBounds.extend(coordinate));
        });
        stops.forEach((stop) => {
          const text = node(
            "span",
            "",
            `${trackingTime(stop.startedAt)} – ${trackingTime(stop.endedAt)} · ${stop.minutes} minute`,
          );
          L.circleMarker([stop.lat, stop.lng], {
            radius: 7,
            color: "#ea580c",
            fillOpacity: 0.8,
          })
            .bindTooltip(text)
            .addTo(layers.current!);
          visibleBounds.extend([stop.lat, stop.lng]);
        });
        bounds.current = visibleBounds;
        // Fit once per live view/day. Polling must preserve the operator's map position.
        if (visibleBounds.isValid() && fittedContext.current !== contextKey) {
          map.current.fitBounds(visibleBounds, {
            padding: [50, 50],
            maxZoom: 15,
            animate: false,
          });
          fittedContext.current = contextKey;
        }
        const chosen = markerLayers.current.get(selectedUid);
        if (chosen && focused.current !== selectedUid) {
          map.current.setView(
            chosen.getLatLng(),
            Math.max(map.current.getZoom(), 14),
            { animate: false },
          );
          // Leave room above the marker for its card, including narrow screens.
          map.current.panBy([0, -90], { animate: false });
          focused.current = selectedUid;
        }
        if (!selectedUid) focused.current = null;
      })
      .catch(() =>
        setError(
          "Punctele hărții nu s-au putut afișa. Consultă lista tehnicienilor.",
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [ready, markers, segments, stops, selectedUid, contextKey]);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === frame.current)
        await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch {
      setError("Ecranul complet nu este disponibil în acest browser.");
    }
  }
  return (
    <div>
      <div ref={frame} className={styles.mapFrame}>
        <div
          ref={container}
          className={styles.mapCanvas}
          aria-label="Harta tehnicienilor"
        />
        <div className={styles.mapControls}>
          <button
            className={styles.iconButton}
            aria-label="Încadrează toate pozițiile"
            title="Încadrează toate pozițiile"
            disabled={!ready}
            onClick={() => {
              if (bounds.current?.isValid())
                map.current?.fitBounds(bounds.current, {
                  padding: [50, 50],
                  maxZoom: 15,
                  animate: false,
                });
            }}
          >
            <LocateFixed size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.legend}>
          <strong>Legendă status</strong>
          <div className={styles.legendItems}>
            <span>
              <i className={`${styles.dot} ${styles.dotGreen}`} />
              GPS activ
            </span>
            <span>
              <i className={styles.dot} />
              Neactualizată / fără date
            </span>
            <span>
              <i className={`${styles.dot} ${styles.dotRed}`} />
              GPS indisponibil / refuzat
            </span>
          </div>
        </div>
        {fullscreenAvailable && (
          <button
            className={`${styles.iconButton} ${styles.fullscreen}`}
            aria-label={
              fullscreen ? "Ieși din ecran complet" : "Hartă pe ecran complet"
            }
            title={
              fullscreen ? "Ieși din ecran complet" : "Hartă pe ecran complet"
            }
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? (
              <Minimize size={18} aria-hidden="true" />
            ) : (
              <Expand size={18} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      {error && (
        <p role="status" className={styles.tileError}>
          {error}
        </p>
      )}
    </div>
  );
}
