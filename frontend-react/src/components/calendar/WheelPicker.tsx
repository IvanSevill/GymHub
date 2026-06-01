import React, { useEffect, useRef } from "react";

const ITEM_H = 44;
const VISIBLE = 5;
const PADDING = Math.floor(VISIBLE / 2); // 2 spacer items top & bottom

interface Props {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

/**
 * iOS-style scroll-snap wheel picker.
 * scrollTop = selectedIndex * ITEM_H centers the selected item.
 */
const WheelPicker: React.FC<Props> = ({ items, selectedIndex, onChange }) => {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticRef = useRef(false);

  // Scroll to selected item on mount and when selectedIndex changes externally
  useEffect(() => {
    if (!ref.current) return;
    programmaticRef.current = true;
    ref.current.scrollTo({ top: selectedIndex * ITEM_H, behavior: "smooth" });
    const id = setTimeout(() => {
      programmaticRef.current = false;
    }, 400);
    return () => clearTimeout(id);
  }, [selectedIndex]);

  const handleScroll = () => {
    if (programmaticRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      // Snap to exact position
      programmaticRef.current = true;
      ref.current.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      setTimeout(() => {
        programmaticRef.current = false;
      }, 300);
      onChange(clamped);
    }, 80);
  };

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{ height: VISIBLE * ITEM_H, width: 56 }}
    >
      {/* Scrollable list */}
      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-scroll no-scrollbar"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {/* Top spacers */}
        {Array.from({ length: PADDING }).map((_, i) => (
          <div key={`t${i}`} style={{ height: ITEM_H }} />
        ))}

        {/* Items */}
        {items.map((item, i) => (
          <div
            key={i}
            style={{ height: ITEM_H, scrollSnapAlign: "center" }}
            className="flex items-center justify-center cursor-pointer"
            onClick={() => onChange(i)}
          >
            <span
              className="font-black tabular-nums transition-all duration-150"
              style={{
                fontSize:
                  i === selectedIndex
                    ? "1.6rem"
                    : Math.abs(i - selectedIndex) === 1
                      ? "1.1rem"
                      : "0.85rem",
                color:
                  i === selectedIndex
                    ? "white"
                    : Math.abs(i - selectedIndex) === 1
                      ? "rgba(148,163,184,0.5)"
                      : "rgba(71,85,105,0.3)",
              }}
            >
              {item}
            </span>
          </div>
        ))}

        {/* Bottom spacers */}
        {Array.from({ length: PADDING }).map((_, i) => (
          <div key={`b${i}`} style={{ height: ITEM_H }} />
        ))}
      </div>

      {/* Top fade */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: PADDING * ITEM_H,
          background: "linear-gradient(to bottom, #0a0f1e 30%, transparent)",
        }}
      />
      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{
          height: PADDING * ITEM_H,
          background: "linear-gradient(to top, #0a0f1e 30%, transparent)",
        }}
      />
      {/* Center selection lines */}
      <div
        className="absolute inset-x-0 pointer-events-none"
        style={{ top: PADDING * ITEM_H, height: ITEM_H }}
      >
        <div className="h-px bg-white/10" />
        <div className="h-px bg-white/10 absolute bottom-0 inset-x-0" />
      </div>
    </div>
  );
};

export default WheelPicker;
