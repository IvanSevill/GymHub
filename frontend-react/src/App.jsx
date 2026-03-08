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
    Settings,
    Filter,
    Activity,
    CheckCircle2,
    XCircle
} from 'lucide-react'

// API
import { fetchWorkouts, fetchUser, syncWorkouts, fetchCalendars, disconnectFitbit } from './api/gymhubApi'

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
    const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('gymhub_user_email'))

    // Filters
    const [filterFitbit, setFilterFitbit] = useState(false)
    const [filterMuscles, setFilterMuscles] = useState([]) // Array for multiple selection
    const [toast, setToast] = useState(null)

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }

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
            showToast('Error al cargar datos. Revisa la consola.', 'error');
        } finally {
            setLoading(false)
        }
    }

    const handleSync = async () => {
        setSyncing(true)
        try {
            await syncWorkouts()
            const workoutsRes = await fetchWorkouts()
            setWorkouts(workoutsRes || [])
            showToast('Sincronización completada con éxito');
        } catch (error) {
            console.error('Sync failed:', error)
            showToast('Fallo en la sincronización. Revisa tu conexión.', 'error');
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

    const handleConnectFitbit = () => {
        // Redirigir al flujo OAuth de Fitbit
        const clientId = '23TXQR';
        const redirectUri = window.location.origin; // http://localhost:5173
        const scopes = 'activity heartrate sleep profile weight location nutrition settings';
        const fitbitAuthUrl = `https://www.fitbit.com/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&prompt=login%20consent`;

        sessionStorage.setItem('gymhub_pending_fitbit', 'true');
        window.location.href = fitbitAuthUrl;
    }

    const handleDisconnectFitbit = async () => {
        try {
            setLoading(true);
            await disconnectFitbit();
            showToast('Fitbit desconectado. Datos eliminados correctamente.');
            await loadData(); // Reload to reflect changes (workouts updated)
        } catch (error) {
            console.error('Failed to disconnect Fitbit:', error);
            showToast('Error al desconectar Fitbit', 'error');
        } finally {
            setLoading(false);
        }
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
        setSelectedCal('');
        setIsDemoMode(false);
    }

    useEffect(() => {
        const handleFitbitCallback = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const email = localStorage.getItem('gymhub_user_email');

            const isPendingFitbit = sessionStorage.getItem('gymhub_pending_fitbit') === 'true';

            if (code && email && isPendingFitbit) {
                try {
                    sessionStorage.removeItem('gymhub_pending_fitbit');
                    setLoading(true);
                    setSyncing(true); // Show spinner for Fitbit connection as requested
                    const redirectUri = window.location.origin;
                    const response = await fetch(
                        `http://localhost:8000/api/v1/auth/fitbit/connect?auth_code=${code}&user_email=${encodeURIComponent(email)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
                        { method: 'POST' }
                    );

                    if (response.ok) {
                        showToast('¡Cuenta de Fitbit vinculada correctamente!');
                    } else {
                        const errorData = await response.json();
                        showToast(`Error de Fitbit: ${errorData.detail || 'Fallo desconocido'}`, 'error');
                    }
                    window.history.replaceState({}, document.title, window.location.pathname);
                } catch (error) {
                    console.error("Error linking fitbit:", error);
                } finally {
                    setLoading(false);
                    setSyncing(false);
                }
            }
        };

        const init = async () => {
            await handleFitbitCallback();
            await loadData();
            // Automatically sync on page reload / initial load
            handleSync();
        };

        const handleFitbitDisconnectEvent = () => handleDisconnectFitbit();
        window.addEventListener('gymhub:disconnect_fitbit', handleFitbitDisconnectEvent);

        init();

        return () => {
            window.removeEventListener('gymhub:disconnect_fitbit', handleFitbitDisconnectEvent);
        };
    }, [])

    if (!isAuthenticated) {
        return <LoginScreen onLoginSuccess={handleLoginSuccess} />
    }

    return (
        <div className="min-h-screen bg-[#020617] text-white p-4 md:p-8">
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none" />

            {syncing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-[#1e293b] border border-white/10 rounded-3xl p-8 flex flex-col items-center gap-4 shadow-2xl"
                    >
                        <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin" />
                        <h3 className="text-xl font-bold text-white">Sincronizando datos...</h3>
                        <p className="text-gray-400 text-sm text-center max-w-xs">Buscando rutinas de Google Calendar y obteniendo tus métricas y sesiones de salud desde Fitbit.</p>
                    </motion.div>
                </div>
            )}

            <header className="max-w-6xl mx-auto mb-12 relative">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-4xl font-black bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                            GymHub Web
                        </h1>
                        <p className="text-gray-400 mt-2 font-medium tracking-wide">Panel de control de rendimiento</p>
                        <p className="text-[10px] text-gray-600 font-mono mt-1">
                            User: {currentUser?.email} | Workouts: {workouts?.length}
                        </p>
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
                    <TabButton
                        active={activeTab === 'fitbit'}
                        onClick={() => setActiveTab('fitbit')}
                        icon={<Watch className="w-4 h-4" />}
                        label={
                            <div className="flex items-center gap-1.5">
                                Fitbit
                                {currentUser?.fitbit_access_token && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />}
                            </div>
                        }
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
                            {(() => {
                                const now = new Date();
                                const pastWorkouts = workouts.filter(w => new Date(w.date) <= now);
                                const futureWorkouts = workouts.filter(w => new Date(w.date) > now).sort((a, b) => new Date(a.date) - new Date(b.date));

                                return (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <StatCard title="Sesiones Completadas" value={pastWorkouts.length} icon={<CalendarIcon className="text-cyan-400" />} delay={0.1} />
                                            <StatCard title="Ejercicios Registrados" value={pastWorkouts.reduce((acc, w) => acc + (w.exercise_sets?.length || 0), 0)} icon={<Dumbbell className="text-purple-400" />} delay={0.2} />
                                            <StatCard
                                                title="Volumen Total (kg)"
                                                value={(pastWorkouts || []).reduce((acc, w) =>
                                                    acc + (w.exercise_sets || []).reduce((a, s) => {
                                                        const vals = [s.value1, s.value2, s.value3, s.value4].map(v => parseFloat(v)).filter(v => !isNaN(v));
                                                        const sum = vals.reduce((x, y) => x + y, 0);
                                                        const reps = parseInt(s.reps) || 0;
                                                        return a + (sum * (reps > 0 ? reps : 1));
                                                    }, 0), 0).toLocaleString('es-ES')}
                                                icon={<Zap className="text-yellow-400" />}
                                                delay={0.3}
                                            />
                                        </div>

                                        {futureWorkouts.length > 0 && (
                                            <section className="mt-12">
                                                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                                    <Zap className="text-yellow-400 animate-pulse" /> Próximas Sesiones
                                                </h2>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                    {futureWorkouts.slice(0, 3).map((workout, idx) => (
                                                        <WorkoutCard key={workout.id} workout={workout} idx={idx} isSmall />
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        <section className="mt-12">
                                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                                <History className="text-cyan-400" /> Historial de Entrenamientos
                                            </h2>
                                            {/* Filter content stays same but operates on pastWorkouts */}

                                            <div className="flex flex-wrap items-center gap-4 mb-8 bg-[#1e293b]/20 p-4 rounded-3xl border border-white/5">
                                                <div className="flex items-center gap-2">
                                                    <Filter className="w-4 h-4 text-gray-500" />
                                                    <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">Filtros:</span>
                                                </div>

                                                <button
                                                    onClick={() => setFilterFitbit(!filterFitbit)}
                                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${filterFitbit
                                                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                                                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                                        }`}
                                                >
                                                    <Watch className="w-4 h-4" />
                                                    Con Fitbit
                                                </button>

                                                <div className="h-6 w-px bg-white/10 mx-2 hidden md:block"></div>

                                                <div className="flex-1 flex flex-wrap gap-2">
                                                    {Array.from(new Set(pastWorkouts.flatMap(w => w.muscle_groups ? w.muscle_groups.split(',').map(m => m.trim()) : [])))
                                                        .filter(Boolean)
                                                        .sort()
                                                        .map(m => (
                                                            <button
                                                                key={m}
                                                                onClick={() => {
                                                                    if (filterMuscles.includes(m)) {
                                                                        setFilterMuscles(filterMuscles.filter(x => x !== m));
                                                                    } else {
                                                                        setFilterMuscles([...filterMuscles, m]);
                                                                    }
                                                                }}
                                                                className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all border ${filterMuscles.includes(m)
                                                                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
                                                                    : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10'
                                                                    }`}
                                                            >
                                                                {m}
                                                            </button>
                                                        ))
                                                    }
                                                </div>

                                                <div className="flex items-center justify-between border-t border-white/5 pt-3">
                                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest bg-white/5 py-1 px-3 rounded-full border border-white/5">
                                                        {(() => {
                                                            const filtered = pastWorkouts.filter(w => {
                                                                const mF = filterFitbit ? !!w.fitbit_data : true;
                                                                let mM = true;
                                                                if (filterMuscles.length > 0) {
                                                                    const norm = (s) => s?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() || '';
                                                                    const wm = w.muscle_groups ? w.muscle_groups.split(',').map(m => norm(m.trim())) : [];
                                                                    const em = w.exercise_sets ? w.exercise_sets.map(s => norm(s.muscle_group)) : [];
                                                                    const allTM = [...new Set([...wm, ...em])];

                                                                    mM = filterMuscles.some(m => {
                                                                        const nm = norm(m);
                                                                        if (nm === 'pierna') {
                                                                            return allTM.some(tm => ['pierna', 'gluteo', 'cuadriceps', 'femoral', 'gemelo', 'isquios', 'aductores'].includes(tm));
                                                                        }
                                                                        return allTM.includes(nm);
                                                                    });
                                                                }
                                                                return mF && mM;
                                                            });
                                                            return `${filtered.length} entrenamientos encontrados`;
                                                        })()}
                                                    </p>

                                                    {(filterFitbit || filterMuscles.length > 0) && (
                                                        <button
                                                            onClick={() => { setFilterFitbit(false); setFilterMuscles([]); }}
                                                            className="text-xs font-bold text-gray-500 hover:text-white transition-colors underline underline-offset-4 ml-auto"
                                                        >
                                                            Limpiar
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                {loading ? (
                                                    <div className="flex justify-center p-20">
                                                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
                                                    </div>
                                                ) : pastWorkouts.length === 0 ? (
                                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-surface/30 border border-white/5 rounded-3xl p-20 text-center">
                                                        <Dumbbell className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                                                        <p className="text-gray-500 text-lg">No hay entrenamientos guardados</p>
                                                    </motion.div>
                                                ) : (() => {
                                                    const filteredWorkouts = pastWorkouts.filter(w => {
                                                        const matchesFitbit = filterFitbit ? !!w.fitbit_data : true;

                                                        let matchesMuscle = true;
                                                        if (filterMuscles.length > 0) {
                                                            const norm = (s) => s?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() || '';

                                                            // 1. Check muscle_groups field
                                                            const workoutMuscles = w.muscle_groups ? w.muscle_groups.split(',').map(m => norm(m.trim())) : [];

                                                            // 2. Check individual exercises (for generic titles like "Extra")
                                                            const exerciseMuscles = w.exercise_sets ? w.exercise_sets.map(s => norm(s.muscle_group)) : [];

                                                            const allTrainedMuscles = [...new Set([...workoutMuscles, ...exerciseMuscles])];

                                                            matchesMuscle = filterMuscles.some(m => {
                                                                const nm = norm(m);
                                                                // Match specific muscle or generic "pierna" for leg sub-groups
                                                                if (nm === 'pierna') {
                                                                    const legMuscles = ['pierna', 'gluteo', 'cuadriceps', 'femoral', 'gemelo', 'isquios', 'aductores'];
                                                                    return allTrainedMuscles.some(tm => legMuscles.includes(tm));
                                                                }
                                                                return allTrainedMuscles.includes(nm);
                                                            });
                                                        }

                                                        return matchesFitbit && matchesMuscle;
                                                    });

                                                    if (filteredWorkouts.length === 0) {
                                                        return (
                                                            <div className="text-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10">
                                                                <p className="text-gray-500 font-medium">No se encontraron entrenamientos con estos filtros.</p>
                                                            </div>
                                                        );
                                                    }

                                                    return filteredWorkouts.map((workout, idx) => <WorkoutCard key={workout.id} workout={workout} idx={idx} />);
                                                })()}
                                            </div>
                                        </section>
                                    </>
                                );
                            })()}
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
                            <WorkoutCalendar workouts={workouts} onRefresh={loadData} />
                        </motion.div>
                    )}

                    {activeTab === 'fitbit' && (
                        <motion.div key="fitbit" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                            <FitbitPanel
                                workouts={workouts}
                                userName={currentUser?.name}
                                onConnect={handleConnectFitbit}
                                isConnected={!!currentUser?.fitbit_access_token}
                            />
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
                handleConnectFitbit={handleConnectFitbit}
                handleDisconnectFitbit={handleDisconnectFitbit}
                handleSync={handleSync}
                showToast={showToast}
            />
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 20, x: '-50%' }}
                        className={`fixed bottom-8 left-1/2 z-[100] px-6 py-4 rounded-3xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl ${toast.type === 'error'
                            ? 'bg-red-500/20 border-red-500/30 text-red-200'
                            : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-200'
                            }`}
                    >
                        {toast.type === 'error' ? <XCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                        <span className="font-bold tracking-wide">{toast.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default App
