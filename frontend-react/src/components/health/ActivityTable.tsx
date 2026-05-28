import React from "react";
import type { DailyHealth } from "../../services/fitbit";

interface Props {
  data: DailyHealth[];
}

const ActivityTable: React.FC<Props> = ({ data }) => (
  <section>
    <h3 className="text-white font-black text-sm mb-3">Actividad diaria</h3>
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm text-white">
        <thead>
          <tr className="border-b border-white/10 text-left text-slate-500 text-[10px] uppercase tracking-widest">
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Pasos</th>
            <th className="px-4 py-3">Pisos</th>
            <th className="px-4 py-3">FC reposo</th>
            <th className="px-4 py-3">Calorías</th>
            <th className="px-4 py-3">Distancia</th>
            <th className="px-4 py-3">Sedentario</th>
            <th className="px-4 py-3">Ligero</th>
            <th className="px-4 py-3">Moderado</th>
            <th className="px-4 py-3">Intenso</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr
              key={d.id}
              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-4 py-3 font-bold">{d.date}</td>
              <td className="px-4 py-3 font-black">
                {d.steps.toLocaleString()}
              </td>
              <td className="px-4 py-3 text-slate-400">{d.floors}</td>
              <td className="px-4 py-3">
                {d.resting_heart_rate > 0 ? (
                  <span className="text-red-400 font-bold">
                    {d.resting_heart_rate} bpm
                  </span>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-orange-400">
                {d.calories_out > 0
                  ? `${d.calories_out.toLocaleString()} kcal`
                  : "—"}
              </td>
              <td className="px-4 py-3 text-slate-400">
                {d.distance_km > 0 ? `${d.distance_km.toFixed(2)} km` : "—"}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {d.minutes_sedentary}m
              </td>
              <td className="px-4 py-3 text-slate-400">
                {d.minutes_lightly_active}m
              </td>
              <td className="px-4 py-3 text-yellow-400">
                {d.minutes_fairly_active}m
              </td>
              <td className="px-4 py-3 text-green-400 font-bold">
                {d.minutes_very_active}m
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

export default ActivityTable;
