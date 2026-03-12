import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Activity, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

const FitbitSuccess = () => {
  const navigate = useNavigate();
  const { updateFitbitStatus } = useAuth();

  useEffect(() => {
    // We assume that if the user reached here, the backend successfully handled the callback.
    // In a more robust implementation, we might check an API status first.
    updateFitbitStatus(true);
    toast.success('Fitbit account linked successfully!', { duration: 5000 });
    
    const timeout = setTimeout(() => {
      navigate('/settings');
    }, 3000);

    return () => clearTimeout(timeout);
  }, [navigate, updateFitbitStatus]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 dot-pattern">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card max-w-sm w-full p-10 text-center"
      >
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-accent/20 rounded-full flex items-center justify-center text-accent">
            <CheckCircle2 size={48} />
          </div>
        </div>
        <h1 className="text-3xl font-black text-white mb-2">Connected!</h1>
        <p className="text-slate-400 font-medium mb-8">Your Fitbit metrics are now synced with GymHub.</p>
        
        <div className="flex items-center justify-center gap-2 text-accent font-black text-xs uppercase tracking-[0.2em] animate-pulse">
          <Activity size={16} />
          Redirecting to settings...
        </div>
      </motion.div>
    </div>
  );
};

export default FitbitSuccess;
