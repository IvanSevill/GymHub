import React from "react";

interface Props {
  icon: React.ReactNode;
  title: string;
}

const SectionHeader: React.FC<Props> = ({ icon, title }) => (
  <div className="flex items-center gap-3">
    {icon}
    <h2 className="text-base font-black text-white tracking-tight">{title}</h2>
    <div className="flex-1 h-px bg-white/5" />
  </div>
);

export default SectionHeader;
