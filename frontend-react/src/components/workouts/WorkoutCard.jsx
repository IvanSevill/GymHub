import { motion } from 'framer-motion'
import { Zap, CheckCircle2, Trophy } from 'lucide-react'

export default function WorkoutCard({ workout, idx }) {
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
