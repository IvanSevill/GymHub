import React, { useState, useEffect } from 'react';
import { workoutApi } from '../api/gymhubApi';
import { Calendar, Clock, ChevronRight, Activity, Trash2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import WorkoutDetail from './WorkoutDetail';
import ConfirmationModal from './ConfirmationModal';

const WorkoutList = () => {
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const fetchWorkouts = async () => {
    try {
      const response = await workoutApi.getWorkouts();
      setWorkouts(response.data);
    } catch (error) {
      console.error('Error fetching workouts', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkouts();
  }, []);

  const handleSyncAll = async () => {
    setShowSyncDialog(false);
    setSyncing(true);
    try {
      await workoutApi.syncAll();
      await fetchWorkouts();
    } catch (error) {
      console.error('Sync failed', error);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await workoutApi.deleteWorkout(deleteId);
      setWorkouts(workouts.filter(w => w.id !== deleteId));
    } catch (error) {
      console.error('Delete failed', error);
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) return <div className="loading">Loading workouts...</div>;

  return (
    <div className="workout-list-container">
      <div className="section-header">
        <h2>Your Workouts</h2>
        <button 
          onClick={() => setShowSyncDialog(true)} 
          disabled={syncing}
          className="sync-btn"
        >
          <RefreshCw size={18} className={syncing ? 'spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync from Calendar'}
        </button>
      </div>

      <div className="workouts-grid">
        <AnimatePresence>
          {workouts.length > 0 ? (
            workouts.map((workout) => (
              <motion.div 
                key={workout.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="workout-card"
                onClick={() => setSelectedWorkout(workout)}
              >
                <div className="workout-info">
                  <h3>{workout.title || 'Untitled Workout'}</h3>
                  {(() => {
                    const isCardio = workout.exercise_sets.length === 0 && workout.fitbit_data;
                    if (isCardio) return <span className="cardio-label">Cardio Session</span>;
                    return null;
                  })()}
                  <div className="meta">
                    <div className="meta-item">
                      <Calendar size={14} />
                      <span>{format(new Date(workout.start_time), 'MMM dd, yyyy')}</span>
                    </div>
                    <div className="meta-item">
                      <Clock size={14} />
                      <span>{format(new Date(workout.start_time), 'HH:mm')}</span>
                    </div>
                  </div>
                </div>

                <div className="workout-stats">
                  {(() => {
                    const isCardio = workout.exercise_sets.length === 0 && workout.fitbit_data;
                    if (isCardio) {
                      return (
                        <div className="stat cardio">
                          <Clock size={16} />
                          <span>{(workout.fitbit_data.duration_ms / 60000).toFixed(0)} min</span>
                        </div>
                      );
                    }
                    if (workout.exercise_sets.length > 0) {
                      return (
                        <div className="stat">
                          <Activity size={16} />
                          <span>{workout.exercise_sets.length} Sets</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {workout.fitbit_data && (
                    <div className="fitbit-badge">
                      <Activity size={14} />
                      {workout.fitbit_data.calories} kcal
                    </div>
                  )}
                </div>

                <div className="workout-actions">
                  <button onClick={(e) => handleDelete(e, workout.id)} className="delete-btn">
                    <Trash2 size={18} />
                  </button>
                  <button className="view-btn">
                    <ChevronRight size={18} />
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="empty-state">
               <div className="empty-content">
                <Calendar size={48} />
                <p>No workouts found. Use the sync button to fetch your exercise logs from Google Calendar.</p>
                <button onClick={() => setShowSyncDialog(true)} className="sync-btn-large">
                  Sync Now
                </button>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Sync Dialog */}
      <ConfirmationModal 
        isOpen={showSyncDialog}
        onClose={() => setShowSyncDialog(false)}
        onConfirm={handleSyncAll}
        title="Sync from Google Calendar?"
        message="GymHub will fetch your exercise logs from the last 30 days that contain '[GymHub]' in their description. Existing workouts with the same calendar ID will be updated."
        confirmText="Sync Calendar"
        icon={RefreshCw}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal 
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete Workout?"
        message="Are you sure you want to remove this workout? This will also remove it from your history and analytics."
        confirmText="Remove Workout"
        icon={Trash2}
        type="danger"
      />

      <AnimatePresence>
        {selectedWorkout && (
          <WorkoutDetail 
            workout={selectedWorkout} 
            onClose={() => setSelectedWorkout(null)}
            onUpdate={fetchWorkouts}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkoutList;
