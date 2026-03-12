import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, User, LogOut, Calendar, Mail, Shield, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { workoutApi } from '../api/gymhubApi';
import toast from 'react-hot-toast';

const SettingsModal = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();
  const [calendars, setCalendars] = useState([]);
  const [loadingCals, setLoadingCals] = useState(false);

  const fetchCalendars = async () => {
    setLoadingCals(true);
    try {
      const res = await workoutApi.getCalendars();
      setCalendars(res.data);
    } catch (err) {
      console.error("Failed to fetch calendars", err);
    } finally {
      setLoadingCals(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCalendars();
    }
  }, [isOpen]);

  const handleSelectCalendar = async (calId) => {
    const tid = toast.loading('Cambiando calendario...');
    try {
      await workoutApi.setCalendar(calId);
      toast.success('Calendario actualizado', { id: tid });
      fetchCalendars();
    } catch (err) {
      toast.error('Error al cambiar calendario', { id: tid });
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay">
          <motion.div 
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="settings-panel"
          >
            <div className="settings-header">
              <h2>Account Settings</h2>
              <button onClick={onClose} className="close-btn">
                <X size={24} />
              </button>
            </div>

            <div className="settings-content">
              <section className="profile-section">
                <div className="profile-hero">
                  {user?.picture_url ? (
                    <img src={user.picture_url} alt={user.name} className="profile-img" />
                  ) : (
                    <div className="profile-avatar-large">{user?.name?.[0]}</div>
                  )}
                  <div className="profile-info">
                    <h3>{user?.name}</h3>
                    <div className="badge-row">
                      {user?.is_root === 1 && <span className="admin-badge"><Shield size={12}/> Admin</span>}
                      <span className="email-label"><Mail size={12}/> {user?.email}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="calendar-section">
                <div className="section-title">
                  <Calendar size={18} />
                  <h3>Google Calendars</h3>
                </div>
                <div className="calendar-list">
                  {loadingCals ? (
                    <p className="loading-small">Loading calendars...</p>
                  ) : calendars.length > 0 ? (
                    calendars.map(cal => {
                      const isSelected = cal.selected || (cal.primary && !calendars.some(c => c.selected));
                      return (
                        <div 
                          key={cal.id} 
                          className={`calendar-item ${cal.primary ? 'primary' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={() => handleSelectCalendar(cal.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <div className={`cal-check ${isSelected ? 'active' : ''}`}>
                             {isSelected ? <Check size={12} className="text-white" /> : (cal.primary && <div className="primary-dot" />)}
                          </div>
                          <span className="cal-name">{cal.summary}</span>
                          {cal.primary && <span className="tag">Primary</span>}
                          {isSelected && <span className="tag selected-tag">Selected</span>}
                        </div>
                      );
                    })
                  ) : (
                    <p className="empty-small">No calendars found.</p>
                  )}
                </div>
              </section>

              <section className="actions-section">
                <button onClick={logout} className="logout-action-btn">
                  <LogOut size={18} />
                  Logout
                </button>
              </section>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
