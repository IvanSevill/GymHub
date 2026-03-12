import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell 
} from 'recharts';
import { analyticsApi, exerciseApi } from '../api/gymhubApi';
import { TrendingUp, BarChart2, Activity } from 'lucide-react';
import { format } from 'date-fns';

const Analytics = () => {
  const [weightData, setWeightData] = useState([]);
  const [frequencyData, setFrequencyData] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const [exRes, freqRes] = await Promise.all([
          exerciseApi.getExercises(),
          analyticsApi.getFrequency({ days: 30 })
        ]);
        setExercises(exRes.data);
        setFrequencyData(freqRes.data);
        if (exRes.data.length > 0) {
          setSelectedExercise(exRes.data[0].id);
        }
      } catch (err) {
        console.error("Analytics init failed", err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedExercise) {
      const fetchHistory = async () => {
        try {
          const res = await analyticsApi.getWeightProgress(selectedExercise, 'month');
          setWeightData(res.data.map(d => ({
            ...d,
            formattedDate: format(new Date(d.date), 'MMM dd')
          })));
        } catch (err) {
          console.error("Failed to fetch weight history", err);
        }
      };
      fetchHistory();
    }
  }, [selectedExercise]);

  if (loading) return <div>Loading analytics...</div>;

  return (
    <div className="analytics-container">
      <div className="analytics-grid">
        {/* Weight Progress Chart */}
        <div className="analytics-card progress-card">
          <div className="card-header">
            <div className="title">
              <TrendingUp size={20} />
              <h3>Weight Progress</h3>
            </div>
            <select 
              value={selectedExercise} 
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="exercise-select"
            >
              {exercises.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name}</option>
              ))}
            </select>
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weightData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="formattedDate" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155' }}
                  itemStyle={{ color: '#6366f1' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="#6366f1" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#6366f1' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Frequency Bar Chart */}
        <div className="analytics-card freq-card">
          <div className="card-header">
            <div className="title">
              <BarChart2 size={20} />
              <h3>Exercise Frequency (30d)</h3>
            </div>
          </div>
          <div className="chart-wrapper">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={frequencyData.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="exercise_name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip 
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155' }}
                />
                <Bar dataKey="count" fill="#a855f7" radius={[4, 4, 0, 0]}>
                  {frequencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#6366f1' : '#a855f7'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
