import React from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  onNavigate?: () => void;
}

const NotConnectedState: React.FC<Props> = ({ onNavigate }) => {
  const navigate = useNavigate();

  const handleClick = (): void => {
    if (onNavigate) {
      onNavigate();
    } else {
      navigate("/settings");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <p className="text-white text-xl font-black">Fitbit no conectado</p>
      <p className="text-slate-500 text-sm">
        Conecta tu Fitbit para ver tus datos de salud.
      </p>
      <button
        onClick={handleClick}
        className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl text-sm hover:bg-primary/80 transition-colors"
      >
        Ir a Ajustes →
      </button>
    </div>
  );
};

export default NotConnectedState;
