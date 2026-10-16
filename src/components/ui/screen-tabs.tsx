'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@mui/material';

const MotionButton = motion.create(Button);

export function ScreenTabs<T extends string>({ className, label, value, onChange, tabs }: { className: string; label: string; value: T; onChange: (value: T) => void; tabs: { value: T; label: string }[] }) {
  const reduced = useReducedMotion();
  return <div className={className} role="group" aria-label={label} data-motion-tabs>{tabs.map(tab => <MotionButton className="min-h-11 flex-1 rounded-xl px-2 py-1.5 text-[11px] motion-safe:transition-[background-color,color,border-color,box-shadow] motion-safe:duration-200" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none' }} key={tab.value} type="button" whileTap={reduced ? undefined : { scale: .98 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }} data-motion-control aria-pressed={tab.value === value} onClick={() => onChange(tab.value)}>{tab.label}</MotionButton>)}</div>;
}