'use client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Info, TriangleAlert } from 'lucide-react';
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
  const NoticeIcon = tone === 'error' ? AlertCircle : tone === 'warning' ? TriangleAlert : Info;
  return <NotificationContext.Provider value={notify}>{children}{message && <div className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+5.5rem)] z-[1300] flex justify-end max-[800px]:top-[calc(env(safe-area-inset-top)+7.25rem)] max-[800px]:justify-center">
    <Alert variant={tone === 'error' ? 'destructive' : tone} data-notification role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true" className="animate-enter pointer-events-auto w-full max-w-[26rem] rounded-2xl border px-4 py-3 text-sm shadow-xl shadow-slate-900/15">
      <NoticeIcon aria-hidden="true" />
      <AlertDescription className="text-sm leading-relaxed">{message}</AlertDescription>
    </Alert>
  </div>}</NotificationContext.Provider>;
}

export const useNotify = () => useContext(NotificationContext);