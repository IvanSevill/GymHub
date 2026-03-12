import React from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Dumbbell } from 'lucide-react';
import { motion } from 'framer-motion';

const LoginPage = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (codeResponse) => {
      const success = await login(codeResponse.code);
      if (success) navigate('/');
    },
    flow: 'auth-code',
  });

  return (
    <div className="min-h-screen bg-background dot-pattern flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card max-w-md w-full p-10 text-center relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
        
        <div className="mb-8 flex justify-center">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary border border-primary/20">
            <Dumbbell size={40} />
          </div>
        </div>

        <h1 className="text-4xl font-black text-white mb-2 tracking-tight">GymHub</h1>
        <p className="text-slate-400 mb-10 font-medium">Tu rastreador de entrenamientos personal sincronizado con tu calendario</p>

        <button 
          onClick={() => handleGoogleLogin()}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-950 font-bold py-4 px-6 rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-xl"
        >
          <img 
            src="https://www.gstatic.com/images/branding/product/1x/gsa_512dp.png" 
            alt="Google" 
            className="w-6 h-6"
          />
          Iniciar sesión con Google
        </button>

        <div className="mt-10 pt-8 border-t border-white/5">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">
            Impulsado por Google Calendar & Fitbit
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;
