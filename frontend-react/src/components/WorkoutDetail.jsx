import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, Save, Plus, Trash2, Dumbbell, Activity } from 'lucide-react';
import { workoutApi, exerciseApi } from '../api/gymhubApi';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const WorkoutDetail = ({ workout, onClose, onUpdate }) => {
  const [editedWorkout, setEditedWorkout] = useState({...workout});
  const [exercises, setExercises] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchExercises = async () => {
      try {
        const res = await exerciseApi.getExercises();
        setExercises(res.data);
      } catch (err) {
        console.error("Failed to fetch exercises", err);
      }
    };
    fetchExercises();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Remove nested fitbit_data if any for the update request as per schema
      const { fitbit_data, ...updateData } = editedWorkout;
      await workoutApi.updateWorkout(workout.id, updateData);
      onUpdate();
      onClose();
    } catch (err) {
      console.error("Failed to update workout", err);
    } finally {
      setSaving(false);
    }
  };

  const addSet = () => {
    const newSets = [
      ...editedWorkout.exercise_sets,
      { exercise_id: exercises[0]?.id || "", value: "", measurement: "kg" }
    ];
    setEditedWorkout({ ...editedWorkout, exercise_sets: newSets });
  };

  const removeSet = (index) => {
    const newSets = editedWorkout.exercise_sets.filter((_, i) => i !== index);
    setEditedWorkout({ ...editedWorkout, exercise_sets: newSets });
  };

  const updateSet = (index, field, val) => {
    const newSets = [...editedWorkout.exercise_sets];
    newSets[index] = { ...newSets[index], [field]: val };
    setEditedWorkout({ ...editedWorkout, exercise_sets: newSets });
  };

  const handleSyncFitbit = async () => {
    try {
      const res = await workoutApi.syncFitbit(workout.id);
      setEditedWorkout({ ...editedWorkout, fitbit_data: res.data });
      alert("Fitbit metrics synced successfully!");
    } catch (err) {
      alert("No matching Fitbit activity found for this time range.");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="workout-detail-overlay"
    >
      <div className="workout-detail-card">
        <header className="detail-header">
          <button onClick={onClose} className="back-btn">
            <ChevronLeft size={20} />
            Back
          </button>
          <h2>{workout.title}</h2>
          <div className="header-actions">
             <button 
              onClick={handleSyncFitbit} 
              className="fitbit-sync-btn"
              title="Sync with Fitbit"
            >
              <Activity size={18} />
              Fitbit
            </button>
            <button onClick={handleSave} disabled={saving} className="save-btn">
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </header>

        <section className="detail-info">
          <div className="info-item">
            <label>Title</label>
            <input 
              value={editedWorkout.title} 
              onChange={(e) => setEditedWorkout({...editedWorkout, title: e.target.value})}
              className="detail-input"
            />
          </div>
          <div className="time-grid">
            <div className="info-item">
              <label>Start Time</label>
              <input 
                type="datetime-local"
                value={format(new Date(editedWorkout.start_time), "yyyy-MM-dd'T'HH:mm")}
                onChange={(e) => setEditedWorkout({...editedWorkout, start_time: e.target.value})}
                className="detail-input"
              />
            </div>
            <div className="info-item">
              <label>End Time</label>
              <input 
                type="datetime-local"
                value={format(new Date(editedWorkout.end_time), "yyyy-MM-dd'T'HH:mm")}
                onChange={(e) => setEditedWorkout({...editedWorkout, end_time: e.target.value})}
                className="detail-input"
              />
            </div>
          </div>
        </section>

        <section className="exercise-section">
          <div className="section-title">
            <h3>Exercises & Sets</h3>
            <button onClick={addSet} className="add-set-btn">
              <Plus size={16} /> Add Set
            </button>
          </div>

          <div className="sets-list">
            {editedWorkout.exercise_sets.map((set, idx) => (
              <div key={idx} className="set-row">
                <div className="col exercise">
                  <select 
                    value={set.exercise_id}
                    onChange={(e) => updateSet(idx, 'exercise_id', e.target.value)}
                  >
                    {exercises.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col value">
                  <input 
                    placeholder="e.g. 40-35" 
                    value={set.value}
                    onChange={(e) => updateSet(idx, 'value', e.target.value)}
                  />
                </div>
                <div className="col unit">
                  <select 
                    value={set.measurement}
                    onChange={(e) => updateSet(idx, 'measurement', e.target.value)}
                  >
                    <option value="kg">kg</option>
                    <option value="rep">rep</option>
                    <option value="s">s</option>
                  </select>
                </div>
                <button onClick={() => removeSet(idx)} className="remove-set">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {editedWorkout.fitbit_data && (
          <section className="fitbit-summary">
            <h3>Fitbit Metrics</h3>
            <div className="metrics-grid">
              <div className="metric">
                <span>Calories</span>
                <strong>{editedWorkout.fitbit_data.calories} kcal</strong>
              </div>
              <div className="metric">
                <span>Avg HR</span>
                <strong>{editedWorkout.fitbit_data.heart_rate_avg} bpm</strong>
              </div>
              <div className="metric">
                <span>Duration</span>
                <strong>{(editedWorkout.fitbit_data.duration_ms / 60000).toFixed(0)} min</strong>
              </div>
              <div className="metric">
                <span>Activity</span>
                <strong>{editedWorkout.fitbit_data.activity_name}</strong>
              </div>
            </div>
          </section>
        )}
      </div>
    </motion.div>
  );
};

export default WorkoutDetail;
