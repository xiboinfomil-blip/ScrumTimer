'use client';

import { motion, useReducedMotion } from 'framer-motion';

export function ScreenTabs<T extends string>({ className, label, value, onChange, tabs }: { className: string; label: string; value: T; onChange: (value: T) => void; tabs: { value: T; label: string }[] }) {
  const reduced = useReducedMotion();
  return <div className={className} role="group" aria-label={label} data-motion-tabs>{tabs.map(tab => <motion.button className="min-h-11 flex-1 rounded-xl px-2 py-1.5 text-[11px]" key={tab.value} type="button" whileTap={reduced ? undefined : { scale: .96 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }} data-motion-control aria-pressed={tab.value === value} onClick={() => onChange(tab.value)}>{tab.label}</motion.button>)}</div>;
}