import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Dumbbell,
    RefreshCw,
    History,
    Trophy,
    Zap,
    Calendar as CalendarIcon,
    LayoutDashboard,
    PieChart,
    Watch,
    Settings
} from 'lucide-react'

// API
import { fetchWorkouts, fetchUser, syncWorkouts, fetchCalendars } from './api/gymhubApi'

// Components
import Analytics from './components/Analytics'
import WorkoutCalendar from './components/WorkoutCalendar'
import FitbitPanel from './components/FitbitPanel'
import StatCard from './components/common/StatCard'
import TabButton from './components/common/TabButton'
import WorkoutCard from './components/workouts/WorkoutCard'
import MaxLifts from './components/workouts/MaxLifts'
import SettingsModal from './components/settings/SettingsModal'
import LoginScreen from './components/LoginScreen'

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
    const [isAuthenticated, setIsAuthenticated] = useState(false)

    const loadData = async () => {
        try {
            setLoading(true)

            const email = localStorage.getItem('gymhub_user_email');
            if (email) {
                setIsAuthenticated(true);
            } else {
                setLoading(false);
                return;
            }

            const [userRes, workoutsRes, calsRes] = await Promise.all([
                fetchUser().catch(() => null),
                fetchWorkouts().catch(() => []),
                fetchCalendars().catch(() => null)
            ])

            if (userRes) setCurrentUser(userRes)
            if (workoutsRes) setWorkouts(workoutsRes)
            if (calsRes && Array.isArray(calsRes)) {
                setCalendars(calsRes)
                setIsDemoMode(false)
                if (userRes && userRes.selected_calendar_id) {
                    setSelectedCal(userRes.selected_calendar_id)
                } else {
                    setShowSettings(true) // Force calendar selection on new login or if none selected
                }
            } else {
                setIsDemoMode(true)
            }
        } catch (error) {
            console.error('Error loading data:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleSync = async () => {
        setSyncing(true)
        try {
            await syncWorkouts()
            const workoutsRes = await fetchWorkouts()
            setWorkouts(workoutsRes)
        } catch (error) {
            console.error('Sync failed:', error)
            alert('Error al sincronizar. Verifica tu conexión.')
        } finally {
            setSyncing(false)
        }
    }

    const loadCalendarsOnly = async () => {
        try {
            const res = await fetchCalendars()
            setCalendars(res)
        } catch (error) {
            console.error(error)
        }
    }

    const handleConnectFitbit = async () => {
        setSyncing(true)
        setTimeout(() => {
            alert('Fitbit conectado con éxito (Simulado)')
            setSyncing(false)
        }, 1000)
    }

    const handleLoginSuccess = async (user) => {
        setIsAuthenticated(true);
        setCurrentUser(user);
        await loadData();
    }

    const handleLogout = () => {
        localStorage.removeItem('gymhub_user_email');
        setIsAuthenticated(false);
        setCurrentUser(null);
        setWorkouts([]);
        setCalendars([]);
    }

    useEffect(() => {
        loadData()
    }, [])

    if (!isAuthenticated) {
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />
    }

    return (
        <div className="min-h-screen bg-[#020617] text-white p-4 md:p-8">
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
                            onClick={handleLogout}
                            className="p-3 bg-red-500/10 rounded-2xl hover:bg-red-500/20 transition-colors"
                            title="Cerrar sesión"
                        >
                            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
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

                <nav className="flex items-center gap-2 mt-12 bg-white/5 p-1.5 rounded-2xl w-fit border border-white/5 backdrop-blur-md">
                    <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={<LayoutDashboard className="w-4 h-4" />} label="Entrenamientos" />
                    <TabButton active={activeTab === 'maximos'} onClick={() => setActiveTab('maximos')} icon={<Trophy className="w-4 h-4" />} label="Máximos" />
                    <TabButton active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} icon={<PieChart className="w-4 h-4" />} label="Análisis" />
                    <TabButton active={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} icon={<CalendarIcon className="w-4 h-4" />} label="Calendario" />
                    <TabButton active={activeTab === 'fitbit'} onClick={() => setActiveTab('fitbit')} icon={<Watch className="w-4 h-4" />} label="Fitbit" />
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
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <StatCard title="Sesiones Totales" value={workouts.length} icon={<CalendarIcon className="text-cyan-400" />} delay={0.1} />
                                <StatCard title="Ejercicios Registrados" value={workouts.reduce((acc, w) => acc + w.exercise_sets.length, 0)} icon={<Dumbbell className="text-purple-400" />} delay={0.2} />
                                <StatCard title="Volumen Total (kg)" value={workouts.reduce((acc, w) => acc + w.exercise_sets.reduce((a, s) => a + ([s.value1, s.value2, s.value3, s.value4].filter(Boolean).reduce((x, y) => x + y, 0) * (s.reps > 0 ? s.reps : 1)), 0), 0).toLocaleString('es-ES')} icon={<Zap className="text-yellow-400" />} delay={0.3} />
                            </div>

                            <section className="mt-12">
                                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                    <History className="text-cyan-400" /> Entrenamientos Recientes
                                </h2>
                                <div className="space-y-6">
                                    {loading ? (
                                        <div className="flex justify-center p-20">
                                            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                                        </div>
                                    ) : workouts.length === 0 ? (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-surface/30 border border-white/5 rounded-3xl p-20 text-center">
                                            <Dumbbell className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                                            <p className="text-gray-500 text-lg">No hay entrenamientos guardados</p>
                                        </motion.div>
                                    ) : (
                                        workouts.map((workout, idx) => <WorkoutCard key={workout.id} workout={workout} idx={idx} />)
                                    )}
                                </div>
                            </section>
                        </motion.div>
                    )}

                    {activeTab === 'maximos' && (
                        <motion.div key="maximos" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                            <MaxLifts workouts={workouts} />
                        </motion.div>
                    )}

                    {activeTab === 'analytics' && (
                        <motion.div key="analytics" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                            <Analytics workouts={workouts} />
                        </motion.div>
                    )}

                    {activeTab === 'calendar' && (
                        <motion.div key="calendar" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                            <WorkoutCalendar workouts={workouts} />
                        </motion.div>
                    )}

                    {activeTab === 'fitbit' && (
                        <motion.div key="fitbit" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                            <FitbitPanel />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <SettingsModal
                showSettings={showSettings}
                setShowSettings={setShowSettings}
                currentUser={currentUser}
                isDemoMode={isDemoMode}
                setIsDemoMode={setIsDemoMode}
                syncing={syncing}
                setSyncing={setSyncing}
                calendars={calendars}
                selectedCal={selectedCal}
                setSelectedCal={setSelectedCal}
                autoSync={autoSync}
                setAutoSync={setAutoSync}
                units={units}
                setUnits={setUnits}
                fetchCalendars={loadCalendarsOnly}
                handleConnectFitbit={handleConnectFitbit}
            />
        </div>
    )
}

export default App
