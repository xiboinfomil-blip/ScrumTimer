'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'error';
const NotificationContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('info');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string, severity: Tone = 'info') => {
    clearTimeout(timeout.current);
    setMessage(text);
    setTone(severity);
    timeout.current = setTimeout(() => setMessage(''), severity === 'error' ? 8000 : 4000);
  }, []);
  useEffect(() => () => clearTimeout(timeout.current), []);
  const colors = tone === 'error' ? 'border-red-200 bg-red-800' : tone === 'warning' ? 'border-orange-200 bg-amber-800' : 'border-white/10 bg-brand-dark';
  return <NotificationContext.Provider value={notify}>{children}<div className={`pointer-events-none fixed bottom-4 left-1/2 z-50 w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-xl border px-4 py-2.5 text-center text-xs leading-relaxed text-white shadow-xl transition motion-reduce:transition-none ${colors} ${message ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}><span role="status" aria-live="polite">{tone !== 'error' ? message : ''}</span><span role="alert" aria-live="assertive">{tone === 'error' ? message : ''}</span></div></NotificationContext.Provider>;
}

export const useNotify = () => useContext(NotificationContext);