'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { validateDailyHint, type DailyHintsData } from '@/lib/meeting/daily-hints';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Indian/Mauritius', year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Browser-safe local Mauritius day, independent of the device's time zone. */
export function currentMauritiusDay(now = new Date()): string {
  const parts = dayFormat.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function readData(value: unknown, day: string): DailyHintsData {
  const data = value as DailyHintsData | null;
  if (!data || data.day !== day || !Array.isArray(data.hints)) {
    throw new Error('Les notes reçues ne correspondent pas à aujourd’hui. Réessayez le chargement.');
  }
  const ids = new Set<string>();
  const hints = data.hints.map(item => {
    const valid = validateDailyHint({ ...item, day });
    if (valid.revision < 1 || ids.has(valid.participantId)) throw new Error('Réponse des notes invalide.');
    ids.add(valid.participantId);
    return { participantId: valid.participantId, hint: valid.hint, revision: valid.revision };
  });
  return { day, hints };
}

export function useDailyHints(teamId: string | null) {
  const [day, setDay] = useState(currentMauritiusDay);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ teamId: string; data: DailyHintsData } | null>(null);
  const [loading, setLoading] = useState(Boolean(teamId));
  const [saving, setSaving] = useState(false);
  const [readError, setReadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const scope = useRef({ generation: 0, busy: false, cleanups: new Set<() => void>() });

  // Invalidate before paint: old team/day writes must never report success.
  useLayoutEffect(() => {
    const context = scope.current;
    context.generation++;
    context.busy = false;
    setResult(null);
    setLoading(Boolean(teamId));
    setSaving(false);
    setReadError('');
    setSaveError('');
    return () => {
      context.generation++;
      context.busy = false;
      for (const cleanup of context.cleanups) cleanup();
      context.cleanups.clear();
    };
  }, [teamId, day]);

  useEffect(() => {
    const revalidate = () => {
      const today = currentMauritiusDay();
      setDay(today);
      if (today === day && !scope.current.busy) setRefresh(value => value + 1);
    };
    // Mauritius uses UTC+04:00, with no daylight-saving transitions.
    const midnight = Date.parse(`${day}T00:00:00+04:00`) + 86_400_000;
    const timer = setTimeout(revalidate, Math.max(1, midnight - Date.now()));
    const onVisibility = () => { if (document.visibilityState === 'visible') revalidate(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [day, refresh]);

  useEffect(() => {
    if (!teamId) return;
    const context = scope.current;
    const generation = context.generation;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const cleanup = () => { controller.abort(); clearTimeout(timeout); };
    context.cleanups.add(cleanup);
    const valid = () => active && generation === context.generation;
    setLoading(true);
    setReadError('');
    void (async () => {
      try {
        const response = await fetch('/api/daily-hints', {
          cache: 'no-store', credentials: 'same-origin', signal: controller.signal,
          headers: { 'X-Team-Id': teamId },
        });
        if (!response.ok) throw new Error('Impossible de charger les notes du jour. Réessayez.');
        const data = readData(await response.json(), day);
        if (!valid() || day !== currentMauritiusDay()) return;
        if (controller.signal.aborted) throw new Error('timeout');
        setResult({ teamId, data });
      } catch (error) {
        if (!valid()) return;
        setResult(null);
        setReadError(controller.signal.aborted ? 'Le chargement a dépassé 15 secondes. Réessayez.'
          : error instanceof Error ? error.message : 'Chargement des notes impossible.');
      } finally {
        clearTimeout(timeout);
        context.cleanups.delete(cleanup);
        if (valid()) setLoading(false);
      }
    })();
    return () => { active = false; cleanup(); context.cleanups.delete(cleanup); };
  }, [teamId, day, refresh]);

  const retry = useCallback(() => {
    if (scope.current.busy) return;
    setDay(currentMauritiusDay());
    setRefresh(value => value + 1);
  }, []);

  const data = result?.teamId === teamId && result.data.day === day && day === currentMauritiusDay()
    ? result.data : null;

  const save = useCallback(async (participantId: string, hint: string, revision: number): Promise<boolean> => {
    const context = scope.current;
    if (!teamId || context.busy || loading || !data) return false;
    if (day !== currentMauritiusDay()) {
      setDay(currentMauritiusDay());
      setSaveError('La journée a changé. Votre brouillon est conservé ; rechargez les notes avant de confirmer.');
      return false;
    }
    let input;
    try { input = validateDailyHint({ participantId, hint, day, revision }); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Note invalide.'); return false; }
    const generation = context.generation;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const cleanup = () => { controller.abort(); clearTimeout(timeout); };
    context.cleanups.add(cleanup);
    const valid = () => generation === context.generation && day === currentMauritiusDay();
    context.busy = true;
    setSaving(true);
    setSaveError('');
    try {
      const response = await fetch('/api/daily-hints', {
        method: 'PUT', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify(input),
      });
      if (!valid()) return false;
      if (controller.signal.aborted) throw new Error('timeout');
      if (response.status === 409) {
        setSaveError('Conflit : la note ou la journée a changé. Rechargement des notes ; votre brouillon est conservé. Comparez la version enregistrée, puis confirmez à nouveau pour la remplacer.');
        setDay(currentMauritiusDay());
        setRefresh(value => value + 1);
        return false;
      }
      if (!response.ok) throw new Error('Enregistrement impossible. Votre brouillon est conservé. Réessayez.');
      const saved = readData(await response.json(), day);
      if (!valid()) return false;
      if (controller.signal.aborted) throw new Error('timeout');
      setResult({ teamId, data: saved });
      return true;
    } catch (error) {
      if (valid()) setSaveError(controller.signal.aborted
        ? 'L’enregistrement a dépassé 15 secondes. Son résultat est incertain ; rechargez les notes avant de réessayer. Votre brouillon est conservé.'
        : error instanceof Error ? error.message : 'Enregistrement impossible. Votre brouillon est conservé.');
      return false;
    } finally {
      clearTimeout(timeout);
      context.cleanups.delete(cleanup);
      if (generation === context.generation) { context.busy = false; setSaving(false); }
    }
  }, [teamId, day, loading, data]);

  return { data, day, loading, error: [readError, saveError].filter(Boolean).join(' '), retry, save, saving };
}