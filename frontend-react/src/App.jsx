import { useState, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Dumbbell,
    RefreshCw,
    CheckCircle2,
    History,
    Trophy,
    Zap,
    Calendar,
    Plus,
    LayoutDashboard,
    PieChart,
    Watch,
    Settings,
    ChevronRight,
    Loader2
} from 'lucide-react'
import Analytics from './components/Analytics'
import WorkoutCalendar from './components/WorkoutCalendar'
import FitbitPanel from './components/FitbitPanel'



const API_URL = 'http://localhost:8000'
const USER_EMAIL = 'test@gymhub.app'

function App() {
    const [workouts, setWorkouts] = useState([])
    const [calendars, setCalendars] = useState([])
    const [selectedCal, setSelectedCal] = useState('')
    const [loading, setLoading] = useState(true)
    const [syncing, setSyncing] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const [isDemoMode, setIsDemoMode] = useState(false)
    const [activeTab, setActiveTab] = useState('overview')
    const [currentUser, setCurrentUser] = useState(null)
    const [autoSync, setAutoSync] = useState(true)
    const [units, setUnits] = useState('kg')




    const fetchWorkouts = async () => {
        try {
            const response = await axios.get(`${API_URL}/workouts?user_email=${USER_EMAIL}`)
            setWorkouts(response.data)
        } catch (error) {
            console.error('Error fetching workouts:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchUser = async () => {
        try {
            const response = await axios.get(`${API_URL}/users/me?user_email=${USER_EMAIL}`)
            setCurrentUser(response.data)
        } catch (error) {
            console.error('Error fetching user:', error)
        }
    }


    const handleSync = async () => {
        setSyncing(true)
        try {
            await axios.post(`${API_URL}/sync/manual?user_email=${USER_EMAIL}`)
            await fetchWorkouts()
        } catch (error) {
            console.error('Sync failed:', error)
            alert('Error al sincronizar. Verifica tus tokens de Google.')
        } finally {
            setSyncing(false)
        }
    }

    const fetchCalendars = async () => {
        try {
            const response = await axios.get(`${API_URL}/users/calendars?user_email=${USER_EMAIL}`)
            setCalendars(response.data)
            const active = response.data.find(c => c.primary)
            if (active) setSelectedCal(active.id)
        } catch (error) {
            console.error('Error fetching calendars:', error)
            setIsDemoMode(true)
        }
    }

    const handleConnectGoogle = async () => {
        try {
            setSyncing(true)
            const res = await axios.post(`${API_URL}/auth/google/mock?user_email=${USER_EMAIL}`)
            setCurrentUser(res.data.user)
            await fetchCalendars()
            setIsDemoMode(false)
        } catch (error) {
            console.error('Connection failed:', error)
            alert('No se pudo conectar con el servidor de autenticación.')
        } finally {
            setSyncing(false)
        }
    }

    const handleConnectFitbit = async () => {
        try {
            setSyncing(true)
            // Mock connection for now
            setTimeout(() => {
                alert('Fitbit conectado con éxito (Simulado)')
                setSyncing(false)
            }, 1000)
        } catch (error) {
            console.error('Fitbit connection failed:', error)
        }
    }


    const selectCalendar = async (id) => {
        try {
            await axios.patch(`${API_URL}/users/selected-calendar?user_email=${USER_EMAIL}&calendar_id=${id}`)
            setSelectedCal(id)
        } catch (error) {
            console.error('Update calendar failed:', error)
        }
    }


    useEffect(() => {
        fetchUser()
        fetchWorkouts()
        fetchCalendars()
    }, [])


    return (
        <div className="min-h-screen bg-[#020617] text-white p-4 md:p-8">
            {/* Background Orbs */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />

            <header className="max-w-6xl mx-auto mb-12 relative">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-black bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                            GymHub Web
                        </h1>
                        <p className="text-gray-400 mt-2 font-medium tracking-wide">Panel de control de rendimiento</p>
                    </div>
                    <div className="flex items-center gap-4">
                        {currentUser?.picture_url && (
                            <img
                                src={currentUser.picture_url}
                                alt="Profile"
                                className="w-10 h-10 rounded-full border-2 border-cyan-500/30 p-0.5"
                            />
                        )}
                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors"
                        >
                            <Settings className="w-6 h-6 text-gray-400" />
                        </button>
                        <button
                            onClick={handleSync}
                            disabled={syncing}
                            className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 rounded-2xl font-bold shadow-lg shadow-cyan-500/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {syncing ? <RefreshCw className="animate-spin w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
                            Sincronizar Cloud
                        </button>
                    </div>

                </div>

                {/* Navigation Tabs */}
                <nav className="flex items-center gap-2 mt-12 bg-white/5 p-1.5 rounded-2xl w-fit border border-white/5 backdrop-blur-md">
                    <TabButton
                        active={activeTab === 'overview'}
                        onClick={() => setActiveTab('overview')}
                        icon={<LayoutDashboard className="w-4 h-4" />}
                        label="Entrenamientos"
                    />
                    <TabButton
                        active={activeTab === 'analytics'}
                        onClick={() => setActiveTab('analytics')}
                        icon={<PieChart className="w-4 h-4" />}
                        label="Análisis"
                    />
                    <TabButton
                        active={activeTab === 'calendar'}
                        onClick={() => setActiveTab('calendar')}
                        icon={<CalendarIcon className="w-4 h-4" />}
                        label="Calendario"
                    />
                    <TabButton
                        active={activeTab === 'fitbit'}
                        onClick={() => setActiveTab('fitbit')}
                        icon={<Watch className="w-4 h-4" />}
                        label="Fitbit"
                    />
                </nav>
            </header>


            <main className="max-w-6xl mx-auto space-y-12 relative">
                <AnimatePresence mode="wait">
                    {activeTab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-8"
                        >
                            {/* Stats Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <StatCard
                                    title="Sesiones Totales"
                                    value={workouts.length}
                                    icon={<CalendarIcon className="text-cyan-400" />}
                                    delay={0.1}
                                />
                                <StatCard
                                    title="Récords Personales"
                                    value={workouts.reduce((acc, w) => acc + w.exercise_sets.filter(s => s.is_pr).length, 0)}
                                    icon={<Trophy className="text-yellow-400" />}
                                    delay={0.2}
                                />
                                <StatCard
                                    title="Intensidad Media"
                                    value="84%"
                                    icon={<Zap className="text-purple-400" />}
                                    delay={0.3}
                                />
                            </div>

                            {/* Workouts List */}
                            <section className="mt-12">
                                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                    <History className="text-cyan-400" />
                                    Entrenamientos Recientes
                                </h2>

                                <div className="space-y-6">
                                    {loading ? (
                                        <div className="flex justify-center p-20">
                                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                                        </div>
                                    ) : workouts.length === 0 ? (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="bg-surface/30 border border-white/5 rounded-3xl p-20 text-center"
                                        >
                                            <Dumbbell className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                                            <p className="text-gray-500 text-lg">No hay entrenamientos guardados</p>
                                        </motion.div>
                                    ) : (
                                        workouts.map((workout, idx) => (
                                            <WorkoutCard key={workout.id} workout={workout} idx={idx} />
                                        ))
                                    )}
                                </div>
                            </section>
                        </motion.div>
                    )}

                    {activeTab === 'analytics' && (
                        <motion.div
                            key="analytics"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <Analytics workouts={workouts} />
                        </motion.div>
                    )}

                    {activeTab === 'calendar' && (
                        <motion.div
                            key="calendar"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <WorkoutCalendar workouts={workouts} />
                        </motion.div>
                    )}

                    {activeTab === 'fitbit' && (
                        <motion.div
                            key="fitbit"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <FitbitPanel />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Settings Modal/Panel */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <div className="bg-[#1e293b] border border-white/10 w-full max-w-lg rounded-3xl p-8 shadow-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-4">
                                    {currentUser?.picture_url ? (
                                        <img src={currentUser.picture_url} className="w-12 h-12 rounded-full ring-2 ring-cyan-500/20" alt="" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                                            <Settings className="w-6 h-6 text-gray-600" />
                                        </div>
                                    )}
                                    <div>
                                        <h2 className="text-xl font-bold">{currentUser?.name || 'Configuración'}</h2>
                                        <p className="text-xs text-gray-500 font-medium">{currentUser?.email || USER_EMAIL}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white p-2">✕</button>
                            </div>


                            <div className="space-y-6">
                                <div>
                                    <label className="text-sm font-bold text-cyan-400 uppercase tracking-widest mb-3 block">Calendario de Google</label>
                                    {isDemoMode ? (
                                        <div className="space-y-4">
                                            <div className="bg-cyan-500/10 border border-cyan-500/20 p-4 rounded-2xl text-cyan-100 text-sm">
                                                Para sincronizar con tus calendarios reales y seleccionar "Gimnasio", primero debes conectar tu cuenta de Google.
                                            </div>
                                            <button
                                                onClick={handleConnectGoogle}
                                                className="w-full flex items-center justify-center gap-2 bg-white text-black font-black py-4 rounded-2xl hover:bg-gray-200 transition-colors"
                                            >
                                                {syncing ? <Loader2 className="animate-spin w-5 h-5" /> : <div className="w-5 h-5 bg-red-500 rounded-full" />}
                                                Conectar con Google Workspace
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                                            <p className="text-gray-500 text-xs mb-3 font-medium">Selecciona el calendario donde registras tus rutinas:</p>
                                            {calendars.map(cal => (
                                                <button
                                                    key={cal.id}
                                                    onClick={() => selectCalendar(cal.id)}
                                                    className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${selectedCal === cal.id
                                                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-100'
                                                        : 'bg-white/5 border-transparent text-gray-400 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cal.backgroundColor }} />
                                                        <span className={`font-medium ${cal.summary === 'Gimnasio' ? 'text-white' : ''}`}>
                                                            {cal.summary}
                                                            {cal.summary === 'Gimnasio' && <span className="ml-2 text-[10px] bg-cyan-500 text-white px-2 py-0.5 rounded-full uppercase">Recomendado</span>}
                                                        </span>
                                                    </div>
                                                    {selectedCal === cal.id && <CheckCircle2 className="w-5 h-5 text-cyan-400" />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>


                                <div>
                                    <label className="text-sm font-bold text-cyan-400 uppercase tracking-widest mb-4 block">Preferencias</label>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                            <div>
                                                <p className="font-bold">Sincronización Automática</p>
                                                <p className="text-xs text-gray-500">Actualizar cada vez que abras la web</p>
                                            </div>
                                            <button
                                                onClick={() => setAutoSync(!autoSync)}
                                                className={`w-12 h-6 rounded-full p-1 transition-colors ${autoSync ? 'bg-cyan-500' : 'bg-gray-700'}`}
                                            >
                                                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${autoSync ? 'translate-x-6' : 'translate-x-0'}`} />
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                            <div>
                                                <p className="font-bold">Unidades de Peso</p>
                                                <p className="text-xs text-gray-500">Métricas (kg) o Imperiales (lb)</p>
                                            </div>
                                            <div className="flex bg-black/20 p-1 rounded-xl">
                                                <button
                                                    onClick={() => setUnits('kg')}
                                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${units === 'kg' ? 'bg-cyan-500 text-white' : 'text-gray-500 hover:text-white'}`}
                                                >
                                                    KG
                                                </button>
                                                <button
                                                    onClick={() => setUnits('lb')}
                                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${units === 'lb' ? 'bg-cyan-500 text-white' : 'text-gray-500 hover:text-white'}`}
                                                >
                                                    LB
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                                            <div>
                                                <p className="font-bold">Salud & Wearables</p>
                                                <p className="text-xs text-gray-500">Métricas de Fitbit y Apple Health</p>
                                            </div>
                                            <button
                                                onClick={handleConnectFitbit}
                                                className="flex items-center gap-2 bg-[#00B0B9]/20 hover:bg-[#00B0B9]/30 text-[#00B0B9] px-4 py-2 rounded-xl text-xs font-bold transition-all border border-[#00B0B9]/30"
                                            >
                                                <Watch className="w-4 h-4" />
                                                Conectar
                                            </button>
                                        </div>
                                    </div>
                                </div>


                                <div className="pt-4 border-t border-white/10">
                                    <button
                                        onClick={() => setShowSettings(false)}
                                        className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-gray-200 transition-colors"
                                    >
                                        Guardar Cambios
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function StatCard({ title, value, icon, delay }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay }}
            className="bg-[#1e293b]/40 border border-white/5 backdrop-blur-xl p-8 rounded-3xl flex items-center gap-6"
        >
            <div className="p-4 bg-white/5 rounded-2xl">
                {icon}
            </div>
            <div>
                <p className="text-gray-400 font-medium text-sm">{title}</p>
                <p className="text-3xl font-black mt-1">{value}</p>
            </div>
        </motion.div>
    )
}

function WorkoutCard({ workout, idx }) {
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
                {workout.exercise_sets.map((set, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="text-cyan-400 w-4 h-4" />
                            <span className="font-medium">{set.exercise_name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="font-black text-purple-400">{set.weight_kg}kg</span>
                            {set.is_pr === 1 && (
                                <Trophy className="text-yellow-400 w-4 h-4" />
                            )}
                        </div>
                    </div>

                ))}
            </div>
        </motion.div>
    )
}

function TabButton({ active, onClick, icon, label }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${active
                ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
        >
            {icon}
            {label}
        </button>
    )
}

export default App

