import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, X, AlertCircle } from 'lucide-react';

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message, confirmText, icon: Icon = Calendar, type = 'primary' }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="modal-overlay">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="modal-container"
          >
            <div className="modal-header">
              <div className={`icon-circle ${type}`}>
                <Icon size={24} />
              </div>
              <button onClick={onClose} className="close-modal">
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <h3>{title}</h3>
              <p>{message}</p>
            </div>
            
            <div className="modal-footer">
              <button onClick={onClose} className="cancel-btn">Cancel</button>
              <button onClick={onConfirm} className={`confirm-btn ${type}`}>
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmationModal;
