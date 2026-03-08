import { motion } from 'framer-motion'
import { Zap, CheckCircle2, Trophy, Heart, Flame, Clock, MapPin, Mountain, Watch } from 'lucide-react'

export default function WorkoutCard({ workout, idx, isSmall = false }) {
    if (isSmall) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-[#1e293b]/40 border border-white/10 backdrop-blur-md rounded-2xl p-5 hover:bg-[#1e293b]/60 transition-all border-l-4 border-l-cyan-500/50"
            >
                <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-500/20 rounded-xl">
                            <Clock className="text-cyan-400 w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm leading-tight">{workout.title}</h3>
                            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider mt-0.5">
                                {new Date(workout.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}
                            </p>
                        </div>
                    </div>
                </div>

                {workout.muscle_groups && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {workout.muscle_groups.split(',').map(m => (
                            <span key={m} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[9px] font-black uppercase rounded-md border border-purple-500/10">
                                {m.trim()}
                            </span>
                        ))}
                    </div>
                )}
            </motion.div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-3xl p-8 hover:bg-[#1e293b]/50 transition-colors"
        >
            <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-2xl">
                        <Zap className="text-purple-400 w-6 h-6" />
                    </div>

                    <div>
                        <h3 className="text-xl font-bold">{workout.title}</h3>
                        <p className="text-gray-500 text-sm font-medium">
                            {new Date(workout.date).toLocaleDateString('es-ES', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long'
                            })}
                        </p>
                    </div>
                </div>
                <div className="px-4 py-1.5 bg-cyan-500/10 rounded-full border border-cyan-500/20">
                    <span className="text-cyan-400 text-xs font-black uppercase tracking-widest">{workout.source}</span>
                </div>
            </div>

            {workout.muscle_groups && (
                <div className="flex flex-wrap gap-2 mb-6">
                    {workout.muscle_groups.split(',').map(m => (
                        <span key={m} className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-black uppercase rounded-md border border-purple-500/20">
                            {m.trim()}
                        </span>
                    ))}
                </div>
            )}

            {workout.fitbit_data && (() => {
                const fd = workout.fitbit_data;
                const azmTotal = (fd.azm_fat_burn || 0) + (fd.azm_cardio || 0) + (fd.azm_peak || 0);
                return (
                    <div className="mb-6 p-4 bg-cyan-500/5 rounded-2xl border border-cyan-500/10 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Watch className="text-cyan-400 w-3.5 h-3.5" />
                                <span className="text-xs font-black text-cyan-400 uppercase tracking-widest">Fitbit</span>
                                {fd.activity_name && (
                                    <span className="text-[10px] px-2 py-0.5 bg-white/5 rounded-full text-gray-400">{fd.activity_name}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {fd.heart_rate_avg && (
                                <div className="flex items-center gap-1.5">
                                    <Heart className="text-rose-400 w-3.5 h-3.5" />
                                    <span className="text-sm font-bold text-gray-300">{fd.heart_rate_avg} bpm</span>
                                </div>
                            )}
                            {fd.calories && (
                                <div className="flex items-center gap-1.5">
                                    <Flame className="text-orange-400 w-3.5 h-3.5" />
                                    <span className="text-sm font-bold text-gray-300">{fd.calories} kcal</span>
                                </div>
                            )}
                            {fd.duration_ms && (
                                <div className="flex items-center gap-1.5">
                                    <Clock className="text-blue-400 w-3.5 h-3.5" />
                                    <span className="text-sm font-bold text-gray-300">{Math.round(fd.duration_ms / 60000)} min</span>
                                </div>
                            )}
                            {fd.distance_km && (
                                <div className="flex items-center gap-1.5">
                                    <MapPin className="text-cyan-400 w-3.5 h-3.5" />
                                    <span className="text-sm font-bold text-gray-300">{fd.distance_km.toFixed(2)} km</span>
                                </div>
                            )}
                            {fd.elevation_gain_m > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <Mountain className="text-purple-400 w-3.5 h-3.5" />
                                    <span className="text-sm font-bold text-gray-300">{Math.round(fd.elevation_gain_m)} m</span>
                                </div>
                            )}
                        </div>
                        {azmTotal > 0 && (
                            <div className="flex items-center gap-2 pt-1">
                                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-wider w-16">AZM</span>
                                <div className="flex gap-1 flex-1">
                                    {fd.azm_fat_burn > 0 && <div title={`Fat Burn: ${fd.azm_fat_burn}min`} className="h-2 bg-yellow-400 rounded-full" style={{ width: `${fd.azm_fat_burn * 4}px`, maxWidth: '60%' }} />}
                                    {fd.azm_cardio > 0 && <div title={`Cardio: ${fd.azm_cardio}min`} className="h-2 bg-orange-500 rounded-full" style={{ width: `${fd.azm_cardio * 4}px`, maxWidth: '60%' }} />}
                                    {fd.azm_peak > 0 && <div title={`Peak: ${fd.azm_peak}min`} className="h-2 bg-rose-500 rounded-full" style={{ width: `${fd.azm_peak * 4}px`, maxWidth: '60%' }} />}
                                </div>
                                <span className="text-[10px] text-gray-500">{azmTotal} min</span>
                            </div>
                        )}
                    </div>
                );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {workout.exercise_sets.map((set, i) => {
                    const values = [set.value1, set.value2, set.value3, set.value4].filter(v => v !== null && v !== undefined);
                    const valStr = values.join('-');
                    const unitStr = set.unit || '';

                    return (
                        <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="text-cyan-400 w-4 h-4" />
                                <span className="font-medium">{set.exercise_name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-black text-purple-400">
                                    {valStr}{unitStr} {set.reps > 0 && `x ${set.reps}`}
                                </span>
                                {set.is_pr === 1 && (
                                    <Trophy className="text-yellow-400 w-4 h-4" />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.div>
    )
}
