'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { ParticipantNote } from '@/components/ui/participant-note';
import { useTeam } from '@/providers/team-provider';
import { DEFAULT_DISCUSSION_PROMPTS, validateDiscussionPrompts, validateMeetingSettings, type MeetingSettings } from '@/lib/meeting-settings';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField } from '@mui/material';

const descriptions = [
  'Partagez vos avancées, vos petites réussites et ce que vous avez terminé.',
  'Dites à l’équipe ce qui vous occupe et ce qui avance en ce moment.',
  'Présentez vos prochaines étapes, vos blocages et l’aide dont vous avez besoin.',
];
const defaultHeadings = ['HIER', 'EN CE MOMENT', 'AUJOURD’HUI'];

type SpeakerContent = {
  speakerId?: string | null;
  speakerName?: string;
  note?: string;
  notesError?: string;
  retryNotes?: () => void;
  running?: boolean;
  remaining?: number;
  onReturn?: () => void;
};

export function DailyPrompts({ className = '', ...speaker }: SpeakerContent & { className?: string }) {
  const { activeTeamId } = useTeam();
  return <TeamPrompts key={activeTeamId ?? 'none'} teamId={activeTeamId} className={className} {...speaker} />;
}
function TeamPrompts({ teamId, className, speakerId, speakerName, note, notesError, retryNotes, running, remaining = 0, onReturn }: SpeakerContent & { teamId: string | null; className: string }) {
  const reduced = useReducedMotion();
  const [settings, setSettings] = useState<MeetingSettings>({ prompts: [...DEFAULT_DISCUSSION_PROMPTS], revision: 0 });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!teamId) return;
    const controller = new AbortController();
    request.current = controller;
    void (async () => {
      try {
        const response = await fetch('/api/meeting-settings', { headers: { 'X-Team-Id': teamId }, cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Questions indisponibles.');
        const next = validateMeetingSettings(body);
        if (!controller.signal.aborted) { setSettings(next); setLoaded(true); setError(''); setConflict(false); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Questions indisponibles.');
      }
    })();
    return () => { controller.abort(); request.current?.abort(); };
  }, [teamId, reload]);
  const retry = () => {
    request.current?.abort(); setEditing(false); setLoaded(false); setError(''); setNotice(''); setReload(value => value + 1);
  };
  const save = async () => {
    if (!teamId || saving || !loaded || conflict) return;
    let prompts;
    try { prompts = validateDiscussionPrompts(draft.map(prompt => prompt.trim())); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Questions invalides.'); return; }
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/meeting-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify({ prompts, revision: settings.revision }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) { if (response.status === 409 && !controller.signal.aborted) setConflict(true); throw new Error(body.error ?? 'Sauvegarde impossible.'); }
      const next = validateMeetingSettings(body);
      if (!controller.signal.aborted) { setSettings(next); setEditing(false); setNotice('Questions enregistrées pour cette équipe.'); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Sauvegarde impossible.');
    } finally { if (!controller.signal.aborted) setSaving(false); }
  };
  const standard = settings.prompts.length === 3 && settings.prompts.every((prompt, index) => prompt === DEFAULT_DISCUSSION_PROMPTS[index]);
  return (
    <Paper component="section" elevation={0} className={`daily-prompts flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[28px] border border-line bg-white p-6 max-[800px]:rounded-2xl max-[800px]:p-4 [@media(max-height:650px)]:p-3 ${className}`} aria-labelledby={note ? 'sidebar-note-title' : 'prompts-title'} data-speaker-sidebar>
      <button type="button" onClick={onReturn} className="mb-3 flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-xl bg-blue-50 px-3 text-left min-[801px]:hidden" aria-label="Revenir au minuteur">
        <span className="min-w-0"><span className="block truncate text-xs font-bold text-brand">{speakerName}</span><span className="text-[10px] text-muted">{running ? 'À la parole · voir le minuteur' : 'Revenir au minuteur'}</span></span>
        <span className={`shrink-0 text-xl font-bold tabular-nums ${remaining < 0 ? 'text-danger' : 'text-brand'}`}>{remaining < 0 ? '+' : ''}{String(Math.floor(Math.ceil(Math.abs(remaining)) / 60)).padStart(2, '0')}:{String(Math.ceil(Math.abs(remaining)) % 60).padStart(2, '0')}</span>
      </button>
      <motion.div key={`${speakerId ?? 'none'}-${note ? 'note' : 'questions'}`} initial={reduced ? false : { x: '100%' }} animate={{ x: 0 }} transition={reduced ? { duration: 0 } : { duration: .32, ease: [.22, 1, .36, 1] }} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-sidebar-slide>
      {notesError && <div role="alert" className="shrink-0 text-[11px] text-danger">{notesError} <Button size="small" onClick={retryNotes}>Réessayer les notes</Button></div>}
      {note ? <>
        <div className="shrink-0 border-b border-line pb-3">
          <p className="mb-2 text-[10px] font-bold tracking-[.16em] text-brand">VOTRE ESPACE DE PAROLE</p>
          <h2 id="sidebar-note-title" className="text-2xl font-bold tracking-tight">Le pense-bête</h2>
          <p className="mt-1 break-words text-xs text-muted">{speakerName}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl border border-orange-100 border-l-[3px] border-l-accent bg-orange-50/40 p-5 max-[650px]:p-3">
          <div data-speaker-hint className="text-ink [&_.participant-note]:whitespace-normal [&_p]:whitespace-pre-line [&_p]:text-base [&_p]:leading-relaxed [&_li]:text-base [&_li]:leading-relaxed"><ParticipantNote hint={note} /></div>
        </div>
        <p className="shrink-0 border-t border-line pt-3 text-[11px] text-muted [@media(max-height:650px)]:hidden">Note partagée avec l’équipe · aujourd’hui, heure de Maurice.</p>
      </> : <>
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-line">
        <h2 id="prompts-title" className="text-xl font-bold tracking-tight">Le fil du point</h2>
        <Button size="small" sx={{ minHeight: 44, minWidth: 0, px: 1, fontSize: 11, textTransform: 'none' }} disabled={!loaded || saving} onClick={() => { setDraft([...settings.prompts]); setEditing(true); setError(''); setNotice(''); }} aria-label="Modifier les questions de l’équipe">Modifier</Button>
      </div>
      {!loaded && !error && <PageSkeleton variant="timer" scope="section" label="Chargement des questions de l’équipe…" />}
      {error && !editing && <div role="alert" className="text-[11px] text-danger">{error} {!loaded && 'Questions par défaut affichées.'} <Button size="small" onClick={retry}>Réessayer</Button></div>}
      {notice && <p role="status" className="text-[11px] text-success">{notice}</p>}
      {(loaded || error) && <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {settings.prompts.map((prompt, index) => (
          <article className="min-w-0 shrink-0 rounded-xl border border-transparent bg-slate-50/70 p-3" key={index}>
            <span className="flex items-center gap-2 text-[10px] font-semibold tracking-wide text-brand"><span className="grid size-6 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-brand">{String(index + 1).padStart(2, '0')}</span>{standard ? defaultHeadings[index] : 'ÉQUIPE'}</span>
            <h3 className="mt-1 break-words text-sm font-semibold leading-snug">{prompt}</h3>
            {standard && <p className="mt-1 text-[11px] leading-relaxed text-muted min-[801px]:max-[1100px]:hidden">{descriptions[index]}</p>}
          </article>
        ))}
      </div>}
      <p className="mt-auto shrink-0 border-t border-line pt-3 text-xs leading-relaxed text-muted [@media(max-height:650px)]:hidden">L’essentiel, simplement. Un sujet à approfondir ? Gardez-le pour après le tour.</p>
      </>}
      </motion.div>
      <Dialog open={editing} onClose={() => { if (!saving) setEditing(false); }} aria-labelledby="edit-prompts-title" fullWidth maxWidth="sm">
        <DialogTitle id="edit-prompts-title">Questions de l’équipe</DialogTitle>
        <DialogContent>
          <p className="mb-3 text-xs text-muted">1 à 5 questions, 160 caractères chacune. Ces questions sont partagées avec tous les appareils de cette équipe.</p>
          <div className="flex flex-col gap-3">
            {draft.map((prompt, index) => <div key={index} className="flex items-start gap-1">
              <TextField fullWidth label={`Question ${index + 1}`} value={prompt} disabled={saving || conflict} onChange={event => setDraft(current => current.map((text, i) => i === index ? event.target.value : text))} helperText={`${[...prompt].length}/160`} />
              <Button disabled={saving || conflict || draft.length === 1} onClick={() => setDraft(current => current.filter((_, i) => i !== index))} aria-label={`Supprimer la question ${index + 1}`}>Retirer</Button>
            </div>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button disabled={saving || conflict || draft.length >= 5} onClick={() => setDraft(current => [...current, ''])}>Ajouter une question</Button>
            <Button disabled={saving || conflict} onClick={() => setDraft([...DEFAULT_DISCUSSION_PROMPTS])}>Rétablir les 3 questions par défaut</Button>
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
          {conflict && <Button onClick={retry}>Recharger les questions partagées</Button>}
        </DialogContent>
        <DialogActions><Button disabled={saving} onClick={() => { setEditing(false); setError(''); if (conflict) retry(); }}>Annuler</Button><Button variant="contained" disabled={saving || conflict} onClick={() => void save()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button></DialogActions>
      </Dialog>
    </Paper>
  );
}