import React from "react";

interface Option {
  value: string;
  label: string;
}

interface PeriodSelectorProps {
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
  activeClass?: string;
}

const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  options,
  value,
  onChange,
  activeClass = "bg-primary shadow-xl shadow-primary/20",
}) => (
  <div className="flex bg-black/20 p-1 rounded-2xl border border-white/5">
    {options.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
          value === opt.value
            ? `${activeClass} text-white`
            : "text-slate-500 hover:text-white"
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

export default PeriodSelector;
