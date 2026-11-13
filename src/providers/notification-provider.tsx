'use client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info as NoticeIcon } from 'lucide-react';


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
  return <NotificationContext.Provider value={notify}>{children}{message && <Alert variant={(tone) === 'error' ? 'destructive' : (tone)} data-notification role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true" className="min-w-0 shrink-0 rounded-none border-x-0 px-3 py-1 text-xs"><NoticeIcon aria-hidden="true" /><AlertDescription className="text-xs leading-[1.35]">{message}</AlertDescription></Alert>}</NotificationContext.Provider>;
}

export const useNotify = () => useContext(NotificationContext);