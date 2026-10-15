'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Snackbar, useMediaQuery } from '@mui/material';

type Tone = 'info' | 'warning' | 'error';
const NotificationContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<Tone>('info');
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useCallback((text: string, severity: Tone = 'info') => {
    clearTimeout(timeout.current);
    setMessage(text);
    setTone(severity);
    timeout.current = setTimeout(() => setMessage(''), severity === 'error' ? 8000 : 4000);
  }, []);
  useEffect(() => () => clearTimeout(timeout.current), []);
  return <NotificationContext.Provider value={notify}>{children}<Snackbar open={Boolean(message)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} transitionDuration={reducedMotion ? 0 : undefined} sx={{ pointerEvents: 'none', maxWidth: 'calc(100% - 32px)', bottom: '16px !important' }}><Alert severity={tone} variant="filled" role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true" sx={{ minWidth: 0, width: '100%', fontSize: 12, overflowWrap: 'anywhere', '& .MuiAlert-message': { minWidth: 0 } }}>{message}</Alert></Snackbar></NotificationContext.Provider>;
}

export const useNotify = () => useContext(NotificationContext);