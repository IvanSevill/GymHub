import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { workoutService } from "../../services/workout";

interface RoutePoint {
  lat: number;
  lon: number;
  ele: number | null;
}

interface Props {
  workoutId: string;
}

const RouteMap: React.FC<Props> = ({ workoutId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      let points: RoutePoint[] = [];
      try {
        points = await workoutService.getRoute(workoutId);
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }

      if (cancelled || points.length < 2) {
        if (!cancelled) setStatus("error");
        return;
      }

      if (!containerRef.current) return;

      // Destroy any previous map instance on the same container
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const latlngs: L.LatLngTuple[] = points.map((p) => [p.lat, p.lon]);

      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
      }).addTo(map);

      const polyline = L.polyline(latlngs, {
        color: "#22d3ee",
        weight: 3,
        opacity: 0.9,
      }).addTo(map);
      map.fitBounds(polyline.getBounds(), { padding: [16, 16] });

      const circleOpts = {
        radius: 6,
        fillOpacity: 1,
        weight: 2,
        color: "#0f172a",
      };
      L.circleMarker(latlngs[0], { ...circleOpts, fillColor: "#4ade80" }).addTo(
        map,
      );
      L.circleMarker(latlngs[latlngs.length - 1], {
        ...circleOpts,
        fillColor: "#f87171",
      }).addTo(map);

      if (!cancelled) setStatus("ok");
    };

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [workoutId]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/5 z-10">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">
            Cargando ruta…
          </p>
        </div>
      )}
      {status === "error" && (
        <div className="h-32 flex items-center justify-center bg-white/5">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">
            Ruta no disponible
          </p>
        </div>
      )}
      <div
        ref={containerRef}
        style={{ height: 220, display: status === "error" ? "none" : "block" }}
      />
    </div>
  );
};

export default RouteMap;
