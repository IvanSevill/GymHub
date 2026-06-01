import React from "react";

interface FilterButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const FilterButton: React.FC<FilterButtonProps> = ({
  label,
  active,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest border transition-all capitalize ${
      active
        ? "bg-primary/15 border-primary/40 text-primary"
        : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
    }`}
  >
    {label}
  </button>
);

export default FilterButton;
