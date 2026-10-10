"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import type {
  TrackingPoint,
  TrackingStop,
} from "@/packages/fom-domain/tracking";
export type MapMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stale?: boolean;
};
export default function TrackingMap({
  markers,
  segments,
  stops,
}: {
  markers: MapMarker[];
  segments: TrackingPoint[][];
  stops: TrackingStop[];
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    layers = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void import("leaflet")
      .then((L) => {
        if (cancelled || !container.current) return;
        const instance = L.map(container.current).setView(
          [44.4268, 26.1025],
          11,
        );
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
        setReady(true);
      })
      .catch(() =>
        setError("Harta nu s-a putut încărca. Consultă lista tehnicienilor."),
      );
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layers.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !map.current || !layers.current) return;
      layers.current.clearLayers();
      const bounds = L.latLngBounds([]);
      markers.forEach((marker) => {
        const tooltip = document.createElement("span");
        tooltip.textContent =
          marker.name + (marker.stale ? " — poziție neactualizată" : "");
        L.circleMarker([marker.lat, marker.lng], {
          radius: 9,
          color: marker.stale ? "#64748b" : "#059669",
          fillOpacity: 0.8,
        })
          .bindTooltip(tooltip)
          .addTo(layers.current!);
        bounds.extend([marker.lat, marker.lng]);
      });
      segments.forEach((segment) => {
        const coords = segment.map((p) => [p.lat, p.lng] as [number, number]);
        if (coords.length === 1)
          L.circleMarker(coords[0], { radius: 5, color: "#2563eb" }).addTo(
            layers.current!,
          );
        if (coords.length > 1)
          L.polyline(coords, { color: "#2563eb", weight: 4 }).addTo(
            layers.current!,
          );
        coords.forEach((p) => bounds.extend(p));
      });
      stops.forEach((stop) => {
        const text = document.createElement("span");
        text.textContent = `Oprire: ${stop.minutes} minute`;
        L.circleMarker([stop.lat, stop.lng], { radius: 7, color: "#ea580c" })
          .bindTooltip(text)
          .addTo(layers.current!);
        bounds.extend([stop.lat, stop.lng]);
      });
      if (bounds.isValid())
        map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    });
    return () => {
      cancelled = true;
    };
  }, [ready, markers, segments, stops]);
  return (
    <div className="space-y-2">
      <div
        ref={container}
        aria-label="Harta tehnicienilor"
        className="h-[420px] w-full rounded-xl border"
        style={{ zIndex: 0 }}
      />
      {error && (
        <p role="status" className="text-sm text-amber-700">
          {error}
        </p>
      )}
    </div>
  );
}
