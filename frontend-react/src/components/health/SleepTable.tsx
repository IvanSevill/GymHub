import React from "react";
import type { SleepLog } from "../../services/fitbit";
import { fmtMin, fmtTime } from "./chartUtils";

interface Props {
  data: SleepLog[];
}

const SleepTable: React.FC<Props> = ({ data }) => (
  <section>
    <h3 className="text-white font-black text-sm mb-3">Sueño</h3>
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full text-sm text-white">
        <thead>
          <tr className="border-b border-white/10 text-left text-slate-500 text-[10px] uppercase tracking-widest">
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Inicio</th>
            <th className="px-4 py-3">Fin</th>
            <th className="px-4 py-3">Duración</th>
            <th className="px-4 py-3">En cama</th>
            <th className="px-4 py-3">Eficiencia</th>
            <th className="px-4 py-3">Profundo</th>
            <th className="px-4 py-3">Ligero</th>
            <th className="px-4 py-3">REM</th>
            <th className="px-4 py-3">Despierto</th>
          </tr>
        </thead>
        <tbody>
          {data.map((s) => (
            <tr
              key={s.id}
              className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-4 py-3 font-bold">{s.date}</td>
              <td className="px-4 py-3 text-slate-400">
                {fmtTime(s.start_time)}
              </td>
              <td className="px-4 py-3 text-slate-400">
                {fmtTime(s.end_time)}
              </td>
              <td className="px-4 py-3 font-bold">{fmtMin(s.duration_ms)}</td>
              <td className="px-4 py-3 text-slate-400">{s.time_in_bed}m</td>
              <td className="px-4 py-3">
                <span
                  className={`font-black ${
                    s.efficiency >= 85
                      ? "text-green-400"
                      : s.efficiency >= 70
                        ? "text-yellow-400"
                        : "text-red-400"
                  }`}
                >
                  {s.efficiency}%
                </span>
              </td>
              <td className="px-4 py-3 text-blue-400 font-bold">
                {s.minutes_deep}m
              </td>
              <td className="px-4 py-3 text-slate-400">{s.minutes_light}m</td>
              <td className="px-4 py-3 text-purple-400 font-bold">
                {s.minutes_rem}m
              </td>
              <td className="px-4 py-3 text-slate-500">{s.minutes_wake}m</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

export default SleepTable;
