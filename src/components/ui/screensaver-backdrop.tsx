'use client';

import { motion } from 'framer-motion';

export function ScreensaverBackdrop({ moving }: { moving: boolean }) {
  return <div aria-hidden="true" data-screensaver-decor className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    <motion.div animate={{ x: moving ? [0, 64] : 0, y: moving ? [0, 64] : 0 }} transition={moving ? { duration: 12, repeat: Infinity, ease: 'linear' } : { duration: 0 }} className="absolute -inset-16 bg-[linear-gradient(#205f9d09_1px,transparent_1px),linear-gradient(90deg,#205f9d09_1px,transparent_1px)] bg-size-[64px_64px]" />
    <div className="absolute -inset-x-1/2 top-[65%] h-[65%] -rotate-12">
      {['bg-[#c6e2ed]', 'bg-[#f5bd71]', 'bg-[#b8ddd1]', 'bg-white/80'].map((color, index) => <motion.div key={color} animate={{ y: moving ? [0, -35 - index * 12, 0] : 0, rotate: moving ? [0, index % 2 ? 5 : -5, 0] : 0, scaleY: moving ? [1, 1.3, 1] : 1 }} transition={moving ? { duration: 5 + index * 2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0 }} className={`h-1/4 w-full border-b-8 border-[#f4f8fa] ${color}`} />)}
    </div>
    <motion.div animate={{ x: moving ? ['-30%', '100%'] : '-30%' }} transition={moving ? { duration: 18, repeat: Infinity, ease: 'linear' } : { duration: 0 }} className="absolute inset-x-0 top-[22%] flex -rotate-12 gap-12 opacity-40"><span className="h-1.5 w-28 bg-brand" /><span className="h-1.5 w-16 bg-accent" /><span className="h-1.5 w-40 bg-success" /></motion.div>
  </div>;
}