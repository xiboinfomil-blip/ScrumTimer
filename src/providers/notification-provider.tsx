'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert } from '@mui/material';

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
  return <NotificationContext.Provider value={notify}>{children}{message && <Alert data-notification severity={tone} variant="filled" role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true" className="shrink-0" sx={{ borderRadius: 0, minWidth: 0, width: '100%', py: 0, fontSize: 12, lineHeight: 1.35, overflowWrap: 'anywhere', '& .MuiAlert-icon': { fontSize: 16, mr: 1, py: .25 }, '& .MuiAlert-message': { minWidth: 0, py: .25 } }}>{message}</Alert>}</NotificationContext.Provider>;
}

export const useNotify = () => useContext(NotificationContext);