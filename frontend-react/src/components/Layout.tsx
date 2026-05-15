import React from 'react';
import Sidebar from './Sidebar';
import { motion, AnimatePresence } from 'framer-motion';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-background dot-pattern selection:bg-primary/30 selection:text-white">
      <Sidebar />
      <main className="flex-1 ml-64 p-6 md:p-10 relative z-10 overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      
      {/* Visual Accents */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-0 left-64 w-[300px] h-[300px] bg-secondary/5 blur-[100px] rounded-full -z-10 pointer-events-none" />
    </div>
  );
};

export default Layout;
