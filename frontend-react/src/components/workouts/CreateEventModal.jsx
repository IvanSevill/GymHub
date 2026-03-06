import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Loader2, CheckCircle2, Dumbbell, Clock } from 'lucide-react'
import { fetchExercisesByMuscle, createEventTemplate } from '../../api/gymhubApi'

const BASE_MUSCLES = ['Pecho', 'Espalda', 'Hombro', 'Biceps', 'Triceps', 'Piernas', 'Abdominales', 'Otros']
const MUSCLE_COLORS = {
    'Pecho': '#06b6d4', 'Espalda': '#8b5cf6', 'Hombro': '#f59e0b', 'Hombros': '#f59e0b',
    'Biceps': '#ec4899', 'Bíceps': '#ec4899', 'Triceps': '#10b981', 'Tríceps': '#10b981',
    'Piernas': '#ef4444', 'Pierna': '#ef4444',
    'Abdominales': '#a3e635', 'Abdomen': '#a3e635', 'Otros': '#64748b',
    // Sub-muscles
    'Glúteo': '#fb7185', 'Gluteo': '#fb7185',
    'Cuádriceps': '#fca5a5', 'Cuadriceps': '#fca5a5',
    'Femoral': '#bef264', 'Isquios': '#bef264',
    'Aductores': '#fde047', 'Gemelo': '#86efac',
    'Pierna': '#ef4444'
}
const LEG_MUSCLES = ["pierna", "piernas", "glúteo", "gluteo", "cuádriceps", "cuadriceps", "femoral", "aductores", "gemelo", "gemelos", "isquios"]


export default function CreateEventModal({ onClose, onCreated }) {
    const [step, setStep] = useState(1) // 1=muscles, 2=time, 3=preview
    const [selectedMuscles, setSelectedMuscles] = useState([])
    const [exercisesByMuscle, setExercisesByMuscle] = useState({})
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState(null)

    // Date/time state
    const today = new Date().toISOString().split('T')[0]
    const [date, setDate] = useState(today)
    const [startHour, setStartHour] = useState(9)
    const [startMin, setStartMin] = useState(0)
    const [endHour, setEndHour] = useState(10)
    const [endMin, setEndMin] = useState(30)

    useEffect(() => {
        fetchExercisesByMuscle()
            .then(data => setExercisesByMuscle(data))
            .catch(() => setError('No se pudieron cargar los ejercicios.'))
            .finally(() => setLoading(false))
    }, [])

    const toggleMuscle = (m) => {
        setSelectedMuscles(prev =>
            prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
        )
    }

    const previewExercises = selectedMuscles.flatMap(m => {
        if (m.toLowerCase() === 'piernas' || m.toLowerCase() === 'pierna') {
            const legKeys = Object.keys(exercisesByMuscle).filter(k => LEG_MUSCLES.includes(k.toLowerCase()))
            return legKeys.flatMap(k => (exercisesByMuscle[k] || []).map(ex => ({ ...ex, muscle: k })))
        }
        return (exercisesByMuscle[m] || []).map(ex => ({ ...ex, muscle: m }))
    })

    const dynamicMuscles = Array.from(new Set([...BASE_MUSCLES, ...Object.keys(exercisesByMuscle)]))
        .filter(m => m !== 'Otros')
        .concat('Otros')

    const title = selectedMuscles.join(' - ') || 'Entrenamiento'
    const fmt = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    const startTotal = startHour * 60 + startMin
    const endTotal = endHour * 60 + endMin
    const isTimeValid = endTotal > startTotal

    const handleStartHourChange = (v) => {
        setStartHour(+v)
        // Auto-push end if it would become before start
        if (+v * 60 + startMin >= endTotal) {
            setEndHour(+v + 1 <= 23 ? +v + 1 : 23)
        }
    }

    const handleSubmit = async () => {
        setSubmitting(true)
        try {
            await createEventTemplate({
                title,
                muscles: selectedMuscles,
                date,
                start_hour: startHour,
                start_minute: startMin,
                end_hour: endHour,
                end_minute: endMin,
            })
            onCreated()
            onClose()
        } catch (e) {
            setError(e?.response?.data?.detail || 'Error al crear el evento.')
            setSubmitting(false)
        }
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/[0.06]">
                        <div>
                            <h3 className="text-xl font-black">Planificar Entrenamiento</h3>
                            <p className="text-gray-500 text-xs mt-0.5">
                                {step === 1 ? 'Paso 1: Selecciona los músculos' : step === 2 ? 'Paso 2: Elige el horario' : 'Paso 3: Confirmar'}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    <div className="p-6 max-h-[60vh] overflow-y-auto">
                        {loading ? (
                            <div className="flex justify-center py-12">
                                <Loader2 className="animate-spin w-8 h-8 text-cyan-400" />
                            </div>
                        ) : error ? (
                            <p className="text-red-400 text-sm text-center py-8">{error}</p>
                        ) : step === 1 ? (
                            <div className="space-y-3">
                                {(() => {
                                    // Separar las piernas del resto
                                    const legSubMuscles = dynamicMuscles.filter(m => LEG_MUSCLES.includes(m.toLowerCase()) && m.toLowerCase() !== 'piernas' && m.toLowerCase() !== 'pierna')
                                    const otherMuscles = dynamicMuscles.filter(m => !LEG_MUSCLES.includes(m.toLowerCase()))

                                    const renderButton = (m, isSub = false) => {
                                        let exercises = []
                                        if (m.toLowerCase() === 'piernas' || m.toLowerCase() === 'pierna') {
                                            const legKeys = Object.keys(exercisesByMuscle).filter(k => LEG_MUSCLES.includes(k.toLowerCase()) && k.toLowerCase() !== 'piernas')
                                            exercises = legKeys.flatMap(k => exercisesByMuscle[k] || [])
                                        } else {
                                            exercises = exercisesByMuscle[m] || []
                                        }

                                        const selected = selectedMuscles.includes(m)
                                        const color = MUSCLE_COLORS[m] || '#64748b'

                                        return (
                                            <button
                                                key={m}
                                                onClick={() => toggleMuscle(m)}
                                                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${selected
                                                    ? 'border-transparent text-white'
                                                    : 'bg-white/[0.03] border-white/[0.06] text-gray-400 hover:bg-white/[0.06]'
                                                    } ${isSub ? 'ml-6 w-[calc(100%-1.5rem)] py-3' : ''}`}
                                                style={selected ? { backgroundColor: color + '25', borderColor: color } : {}}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                                                    <div className="text-left">
                                                        <p className="font-bold">{m}</p>
                                                        <p className="text-xs opacity-60">{exercises.length} ejercicios en historial</p>
                                                    </div>
                                                </div>
                                                {selected && <CheckCircle2 className="w-5 h-5" style={{ color: MUSCLE_COLORS[m] }} />}
                                            </button>
                                        )
                                    }

                                    return (
                                        <>
                                            {otherMuscles.map(m => renderButton(m))}

                                            {/* Render Piernas and its sub-sections */}
                                            <div className="pt-2 pb-1 border-t border-white/[0.06] mt-4 mb-2">
                                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-2 mb-3">Tren Inferior (Pierna)</p>
                                                <div className="space-y-3">
                                                    {renderButton('Piernas')} {/* El botón maestro de todo */}
                                                    {legSubMuscles.length > 0 && (
                                                        <div className="space-y-2 border-l-2 border-white/[0.05] ml-4">
                                                            {legSubMuscles.map(m => renderButton(m, true))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )
                                })()}
                            </div>
                        ) : step === 2 ? (
                            <div className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Fecha</label>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> Inicio
                                        </label>
                                        <div className="flex gap-2">
                                            <input type="number" min="0" max="23" value={startHour} onChange={e => handleStartHourChange(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-white text-center focus:outline-none focus:border-cyan-500 transition-colors" />
                                            <span className="flex items-center text-gray-500 font-bold">:</span>
                                            <input type="number" min="0" max="59" step="5" value={startMin} onChange={e => setStartMin(+e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-white text-center focus:outline-none focus:border-cyan-500 transition-colors" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> Fin
                                        </label>
                                        <div className="flex gap-2">
                                            <input type="number" min="0" max="23" value={endHour} onChange={e => setEndHour(+e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-white text-center focus:outline-none focus:border-cyan-500 transition-colors" />
                                            <span className="flex items-center text-gray-500 font-bold">:</span>
                                            <input type="number" min="0" max="59" step="5" value={endMin} onChange={e => setEndMin(+e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-white text-center focus:outline-none focus:border-cyan-500 transition-colors" />
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06]">
                                    <p className="text-xs text-gray-500 mb-1">Resumen</p>
                                    <p className="font-black">{title}</p>
                                    <p className="text-sm text-gray-400">{date} · {fmt(startHour, startMin)} – {fmt(endHour, endMin)}</p>
                                </div>
                                {!isTimeValid && (
                                    <p className="text-red-400 text-xs font-bold">⚠️ La hora de fin debe ser posterior a la de inicio.</p>
                                )}
                            </div>
                        ) : (
                            // Step 3: preview
                            <div className="space-y-4">
                                <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.06] mb-4">
                                    <p className="font-black text-lg">{title}</p>
                                    <p className="text-sm text-gray-400">{date} · {fmt(startHour, startMin)} – {fmt(endHour, endMin)}</p>
                                </div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Ejercicios que se añadirán (sin ✅)</p>
                                {previewExercises.length === 0 ? (
                                    <p className="text-red-400 text-sm">No hay ejercicios en historial para los músculos seleccionados.</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {previewExercises.map((ex, i) => (
                                            <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.04] last:border-0">
                                                <span className="text-sm text-gray-300">
                                                    <span style={{ color: MUSCLE_COLORS[ex.muscle], fontWeight: 700 }}>{ex.muscle}</span>
                                                    {' - '}{ex.name}
                                                </span>
                                                <span className="text-xs text-gray-500 font-mono ml-3 shrink-0">{ex.last_weight || '—'}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/[0.06] flex justify-between gap-3">
                        {step > 1 && (
                            <button onClick={() => setStep(s => s - 1)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-2xl font-bold transition-colors">
                                Atrás
                            </button>
                        )}
                        {step < 3 ? (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                disabled={(step === 1 && selectedMuscles.length === 0) || (step === 2 && !isTimeValid)}
                                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl font-bold disabled:opacity-40 hover:opacity-90 transition-opacity"
                            >
                                Siguiente
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || previewExercises.length === 0}
                                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {submitting ? <Loader2 className="animate-spin w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                {submitting ? 'Creando...' : 'Crear en Google Calendar'}
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
