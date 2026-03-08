import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings, CheckCircle2, Loader2, Watch, Download, Upload, Activity } from 'lucide-react'
import { updateSelectedCalendar, exportRootMock, importRootMock } from '../../api/gymhubApi'

export default function SettingsModal({
    showSettings,
    setShowSettings,
    currentUser,
    isDemoMode,
    setIsDemoMode,
    syncing,
    setSyncing,
    calendars,
    selectedCal,
    setSelectedCal,
    autoSync,
    setAutoSync,
    handleConnectFitbit,
    handleDisconnectFitbit,
    handleSync,
    showToast
}) {
    const [newExercise, setNewExercise] = useState({ name: '', muscle: 'Pecho' });
    const [isAddingExercise, setIsAddingExercise] = useState(false);

    if (!showSettings) return null;

    const handleAddManualExercise = async () => {
        if (!newExercise.name) return;
        try {
            setIsAddingExercise(true);
            const { addMasterExercise } = await import('../../api/gymhubApi');
            await addMasterExercise(newExercise.name, newExercise.muscle);
            showToast(`Ejercicio "${newExercise.name}" añadido correctamente`);
            setNewExercise({ ...newExercise, name: '' });
        } catch (error) {
            showToast('Error al añadir ejercicio', 'error');
        } finally {
            setIsAddingExercise(false);
        }
    }

    const handleConnectGoogle = async () => {
        try {
            setSyncing(true)
            await fetchCalendars()
            setIsDemoMode(false)
        } catch (error) {
            console.error('Connection failed:', error)
            showToast('No se pudo conectar con el servidor de autenticación.', 'error')
        } finally {
            setSyncing(false)
        }
    }

    const handleExportMock = async () => {
        try {
            const data = await exportRootMock();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gymhub_exercises_mock_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            showToast('Mock de ejercicios exportado correctamente');
        } catch (error) {
            showToast('Error al exportar mock', 'error');
        }
    }

    const handleImportMock = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const mockData = JSON.parse(event.target.result);
                    await importRootMock(mockData);
                    showToast('Mock importado con éxito. Refrescando...');
                    window.location.reload();
                } catch (err) {
                    showToast('Error al importar el archivo JSON', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    const selectCalendar = async (id) => {
        try {
            await updateSelectedCalendar(id);
            setSelectedCal(id)
            if (handleSync) handleSync();
        } catch (error) {
            console.error('Update calendar failed:', error)
        }
    }

    return (
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
                            <p className="text-xs text-gray-500 font-medium">{currentUser?.email || 'N/A'}</p>
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
                                    <p className="font-bold">Salud & Wearables</p>
                                    <p className="text-xs text-gray-500">Métricas de Fitbit y Apple Health</p>
                                </div>
                                {currentUser?.fitbit_id ? (
                                    <button
                                        onClick={handleDisconnectFitbit}
                                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-red-500/20"
                                    >
                                        Desconectar
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleConnectFitbit}
                                        className="flex items-center gap-2 bg-[#00B0B9]/20 hover:bg-[#00B0B9]/30 text-[#00B0B9] px-4 py-2 rounded-xl text-xs font-bold transition-all border border-[#00B0B9]/30"
                                    >
                                        <Watch className="w-4 h-4" />
                                        Conectar
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {currentUser?.is_root === true && (
                        <div className="space-y-6">
                            <div>
                                <label className="text-sm font-bold text-purple-400 uppercase tracking-widest mb-4 block">Herramientas Root</label>
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    <button
                                        onClick={handleExportMock}
                                        className="flex items-center justify-center gap-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 p-4 rounded-2xl text-xs font-bold transition-all border border-purple-500/20"
                                    >
                                        <Download className="w-4 h-4" />
                                        Exportar Mock
                                    </button>
                                    <button
                                        onClick={handleImportMock}
                                        className="flex items-center justify-center gap-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 p-4 rounded-2xl text-xs font-bold transition-all border border-indigo-500/20"
                                    >
                                        <Upload className="w-4 h-4" />
                                        Importar Mock
                                    </button>
                                </div>

                                <div className="bg-purple-500/5 border border-purple-500/10 p-5 rounded-3xl">
                                    <p className="text-xs font-bold text-purple-300 uppercase tracking-widest mb-4">Añadir Ejercicio Manual</p>
                                    <div className="space-y-3">
                                        <input
                                            type="text"
                                            placeholder="Nombre del ejercicio (ej: Press Militar)"
                                            value={newExercise.name}
                                            onChange={(e) => setNewExercise({ ...newExercise, name: e.target.value })}
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 text-white"
                                        />
                                        <select
                                            value={newExercise.muscle}
                                            onChange={(e) => setNewExercise({ ...newExercise, muscle: e.target.value })}
                                            className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-purple-500 text-white appearance-none"
                                        >
                                            <option value="Pecho">Pecho</option>
                                            <option value="Espalda">Espalda</option>
                                            <option value="Hombro">Hombro</option>
                                            <option value="Pierna">Pierna</option>
                                            <option value="Biceps">Biceps</option>
                                            <option value="Triceps">Triceps</option>
                                            <option value="Abdominales">Abdominales</option>
                                        </select>
                                        <button
                                            onClick={handleAddManualExercise}
                                            disabled={isAddingExercise || !newExercise.name}
                                            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all"
                                        >
                                            {isAddingExercise ? 'Añadiendo...' : 'Añadir al Master'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

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
    )
}
