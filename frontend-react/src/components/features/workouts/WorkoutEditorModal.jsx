import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Loader2, CheckCircle2, Trash2, Dumbbell, Save } from 'lucide-react'
import { updateWorkout } from '../../../api/gymhubApi'

export default function WorkoutEditorModal({ workout, onClose, onUpdated }) {
    const [title, setTitle] = useState(workout.title)
    const [sets, setSets] = useState([])
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (workout.exercise_sets) {
            setSets(workout.exercise_sets.map(s => ({
                id: s.id,
                exercise_name: s.exercise_name,
                muscle_group: s.muscle_group,
                reps: s.reps || 0,
                values: [s.value1, s.value2, s.value3, s.value4].filter(v => v != null),
                unit: s.unit || 'kg'
            })))
        }
    }, [workout])

    const handleAddSet = (exerciseName, muscle) => {
        setSets([...sets, {
            exercise_name: exerciseName,
            muscle_group: muscle,
            reps: 10,
            values: [0],
            unit: 'kg',
            isNew: true
        }])
    }

    const updateSet = (idx, field, value) => {
        const newSets = [...sets]
        newSets[idx][field] = value
        setSets(newSets)
    }

    const updateValue = (setIdx, valIdx, value) => {
        const newSets = [...sets]
        newSets[setIdx].values[valIdx] = parseFloat(value) || 0
        setSets(newSets)
    }

    const addValueToSet = (setIdx) => {
        const newSets = [...sets]
        if (newSets[setIdx].values.length < 4) {
            newSets[setIdx].values.push(newSets[setIdx].values[newSets[setIdx].values.length - 1] || 0)
            setSets(newSets)
        }
    }

    const removeSet = (idx) => {
        setSets(sets.filter((_, i) => i !== idx))
    }

    const getFormattedDescription = () => {
        return sets.map(s => {
            const vals = s.values.join('-')
            const musclePrefix = s.muscle_group ? `${s.muscle_group} - ` : ''
            return `✅ ${musclePrefix}${s.exercise_name} (${vals}${s.unit}) ${s.reps}x`
        }).join('\n')
    }

    const handleSubmit = async () => {
        setSubmitting(true)
        setError(null)
        try {
            const description = getFormattedDescription()
            await updateWorkout(workout.id, {
                title,
                description,
                user_email: workout.user_email
            })
            onUpdated()
            onClose()
        } catch (e) {
            setError('Error al guardar los cambios.')
            setSubmitting(false)
        }
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
                        <div>
                            <h3 className="text-xl font-black">Actualizar Entrenamiento</h3>
                            <p className="text-gray-500 text-xs mt-0.5">{workout.title}</p>
                        </div>
                        <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Nombre de la Sesión</label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                            />
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Ejercicios & Series</label>
                            </div>

                            {sets.length === 0 ? (
                                <p className="text-gray-600 italic text-center py-8">No hay ejercicios en esta sesión.</p>
                            ) : (
                                <div className="space-y-4">
                                    {sets.map((s, idx) => (
                                        <div key={idx} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Dumbbell className="w-4 h-4 text-cyan-400" />
                                                    <span className="font-bold text-sm">{s.exercise_name}</span>
                                                    <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full text-gray-500 uppercase font-black">{s.muscle_group}</span>
                                                </div>
                                                <button onClick={() => removeSet(idx)} className="text-gray-600 hover:text-red-400 p-1">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {s.values.map((v, vi) => (
                                                        <input
                                                            key={vi}
                                                            type="number"
                                                            step="0.5"
                                                            value={v}
                                                            onChange={e => updateValue(idx, vi, e.target.value)}
                                                            className="w-16 bg-black/20 border border-white/10 rounded-lg py-1.5 text-center text-sm focus:border-cyan-500"
                                                        />
                                                    ))}
                                                    <button onClick={() => addValueToSet(idx)} className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg text-gray-400">+</button>
                                                    <span className="text-xs text-gray-500 font-bold ml-1">{s.unit}</span>
                                                </div>
                                                <div className="flex items-center justify-end gap-3">
                                                    <span className="text-xs text-gray-500 font-bold uppercase tracking-widest">Reps</span>
                                                    <input
                                                        type="number"
                                                        value={s.reps}
                                                        onChange={e => updateSet(idx, 'reps', parseInt(e.target.value) || 0)}
                                                        className="w-16 bg-black/20 border border-white/10 rounded-lg py-1.5 text-center text-sm focus:border-cyan-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/[0.06] flex gap-3 bg-black/20">
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex-1 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl font-black text-white flex items-center justify-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all shadow-lg shadow-cyan-500/20"
                        >
                            {submitting ? <Loader2 className="animate-spin w-5 h-5" /> : <Save className="w-5 h-5" />}
                            {submitting ? 'Guardando...' : 'Guardar Entrenamiento'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
