import { useMemo } from 'react'
import { Trophy, Dumbbell } from 'lucide-react'
import { motion } from 'framer-motion'

const MUSCLE_COLORS = {
    'Pecho': '#06b6d4', 'Espalda': '#8b5cf6', 'Hombros': '#f59e0b', 'Hombro': '#f59e0b',
    'Bíceps': '#ec4899', 'Tríceps': '#10b981', 'Triceps': '#10b981',
    'Piernas': '#ef4444', 'Pierna': '#ef4444',
    'Abdomen': '#a3e635', 'Abdominales': '#a3e635',
    'Full Body': '#60a5fa', 'Circuito': '#60a5fa', 'Extra': '#64748b', 'Otros': '#64748b'
}

function getColor(muscle) {
    return MUSCLE_COLORS[muscle] || '#64748b'
}

function getMaxWeight(set) {
    const vals = [set.value1, set.value2, set.value3, set.value4].filter(v => v != null)
    return vals.length ? Math.max(...vals) : null
}

// Get muscle for a set: prefer explicit muscle_group on the set, else fall back to workout's muscle_groups
function getSetMuscle(set, workout) {
    if (set.muscle_group) return set.muscle_group
    if (workout.muscle_groups) return workout.muscle_groups.split(',')[0].trim()
    return 'Otros'
}

export default function MaxLifts({ workouts }) {
    const maxByExercise = useMemo(() => {
        const map = {}
        for (const workout of workouts) {
            for (const s of workout.exercise_sets) {
                const name = s.exercise_name?.trim()
                if (!name) continue
                const max = getMaxWeight(s)
                if (max == null) continue
                if (!map[name] || max > map[name].max) {
                    map[name] = {
                        name,
                        max,
                        unit: s.unit || 'kg',
                        muscle: getSetMuscle(s, workout),
                        date: new Date(workout.date)
                    }
                }
            }
        }
        return Object.values(map).sort((a, b) => b.max - a.max)
    }, [workouts])

    // Group by muscle
    const byMuscle = useMemo(() => {
        const groups = {}
        for (const ex of maxByExercise) {
            if (!groups[ex.muscle]) groups[ex.muscle] = []
            groups[ex.muscle].push(ex)
        }
        return groups
    }, [maxByExercise])

    if (maxByExercise.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center">
                <Dumbbell className="w-16 h-16 text-gray-700 mb-4" />
                <p className="text-gray-500">Sincroniza tus entrenamientos para ver tus máximos.</p>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-3 mb-2">
                <Trophy className="text-yellow-400 w-6 h-6" />
                <h2 className="text-2xl font-black">Máximos por Ejercicio</h2>
            </div>

            {Object.entries(byMuscle).map(([muscle, exercises]) => (
                <motion.div
                    key={muscle}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-[#1e293b]/30 border border-white/5 backdrop-blur-md rounded-3xl p-6"
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MUSCLE_COLORS[muscle] || '#64748b' }} />
                        <h3 className="font-black text-lg">{muscle}</h3>
                        <span className="text-xs text-gray-500 font-medium">{exercises.length} ejercicio(s)</span>
                    </div>

                    <div className="space-y-2">
                        {exercises.map((ex, i) => (
                            <div key={i} className="flex items-center justify-between py-2.5 px-4 bg-white/[0.03] rounded-2xl border border-white/[0.04]">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-600 font-black w-5 text-right">{i + 1}</span>
                                    <span className="text-gray-200 font-medium text-sm">{ex.name}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-gray-600">
                                        {ex.date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                                    </span>
                                    <span
                                        className="font-black text-base min-w-[64px] text-right"
                                        style={{ color: MUSCLE_COLORS[ex.muscle] || '#fff' }}
                                    >
                                        {ex.max}{ex.unit}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            ))}
        </div>
    )
}
