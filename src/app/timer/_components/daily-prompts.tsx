'use client';


import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from 'cn';


import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader } from '@infomil/scrum-shared/ui';
import { motion, useReducedMotion } from 'framer-motion';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { useTeam } from '@/providers/team-provider';
import { DEFAULT_DISCUSSION_PROMPTS, validateDiscussionPrompts, validateMeetingSettings, type MeetingSettings } from '@/lib/meeting/meeting-settings';

import { Button } from '@/components/ui/button';
import { JiraTickets } from './jira-tickets';
import { NotebookPen as EditNoteRounded } from 'lucide-react';
import { ListOrdered as FormatListNumberedRounded } from 'lucide-react';

const ParticipantNote = dynamic(() => import('@/components/ui/participant-note').then(module => module.ParticipantNote), {
  loading: () => <Loader size="sm" label="Chargement de la note…" />,
});

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
  compact?: boolean;
};

export function DailyPrompts({ className = '', compact = false, ...speaker }: SpeakerContent & { className?: string }) {
  const { activeTeamId, teams } = useTeam();
  return <TeamPrompts key={activeTeamId ?? 'none'} teamId={activeTeamId} sprint={teams.find(team => team.id === activeTeamId)?.kind === 'sprint'} className={className} compact={compact} {...speaker} />;
}
function TeamPrompts({ teamId, sprint, className, compact, speakerId, note, notesError, retryNotes, running, remaining = 0, onReturn }: SpeakerContent & { teamId: string | null; sprint: boolean; className: string; compact: boolean }) {
  const reduced = useReducedMotion();
  const [view, setView] = useState<'notes' | 'tickets'>(sprint ? 'tickets' : 'notes');
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
    const load = async () => {
      try {
        const response = await fetch('/api/meeting-settings', { headers: { 'X-Team-Id': teamId }, cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Questions indisponibles.');
        const next = validateMeetingSettings(body);
        if (!controller.signal.aborted) { setSettings(next); setLoaded(true); setError(''); setConflict(false); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Questions indisponibles.');
      }
    };
    const initial = setTimeout(() => void load(), 0);
    return () => { clearTimeout(initial); controller.abort(); request.current?.abort(); };
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
    <section className={`daily-prompts flex min-h-0 min-w-0 flex-col overflow-hidden rounded-none! border-0 bg-white ${compact ? 'gap-2 p-3 [@media(max-height:650px)]:p-2' : 'p-4 [@media(max-height:650px)]:p-3'} ${className}`} aria-labelledby={sprint && view === 'tickets' ? 'jira-tickets-heading' : note ? 'sidebar-note-title' : 'prompts-title'} data-speaker-sidebar>
      <Button type="button" onClick={onReturn} className={`mb-1 flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-md bg-blue-50 px-3 text-left min-[1100px]:hidden ${sprint ? '[@media(max-height:400px)]:hidden' : ''}`} aria-label="Revenir au minuteur" variant="ghost">
        <span className="min-w-0 text-xs font-semibold text-brand">{running ? 'À la parole · voir le minuteur' : 'Revenir au minuteur'}</span>
        <span className={`shrink-0 text-xl font-bold tabular-nums ${remaining < 0 ? 'text-danger' : 'text-brand'}`}>{remaining < 0 ? '+' : ''}{String(Math.floor(Math.ceil(Math.abs(remaining)) / 60)).padStart(2, '0')}:{String(Math.ceil(Math.abs(remaining)) % 60).padStart(2, '0')}</span>
      </Button>
      {sprint && <div role="group" aria-label="Contenu de l’intervenant" className="mb-1 flex h-11 shrink-0 gap-4 border-b border-line">{(['tickets', 'notes'] as const).map(tab => <Button key={tab} type="button" aria-pressed={view === tab} onClick={() => setView(tab)} className={`min-h-11 min-w-0 flex-1 border-b-2 px-2 text-sm font-semibold ${view === tab ? 'border-brand text-brand' : 'border-transparent text-muted hover:bg-slate-50'}`} variant="ghost">{tab === 'tickets' ? 'Tickets Jira' : note ? 'Pense-bête' : 'Questions'}</Button>)}</div>}
      {sprint && <div className={view === 'tickets' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}><JiraTickets teamId={teamId} participantId={speakerId} /></div>}
      {(!sprint || view === 'notes') && <>
      <motion.div key={`${speakerId ?? 'none'}-${note ? 'note' : 'questions'}`} initial={reduced ? false : { x: '100%' }} animate={{ x: 0 }} transition={reduced ? { duration: 0 } : { duration: .32, ease: [.22, 1, .36, 1] }} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-sidebar-slide>
      {notesError && <div role="alert" className="shrink-0 text-[11px] text-danger">{notesError} <Button onClick={retryNotes} variant="ghost" size="sm">Réessayer les notes</Button></div>}
      {note ? <>
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line pb-2">
          <h2 id="sidebar-note-title" className="flex min-w-0 items-center gap-2 text-sm font-bold"><EditNoteRounded size={20} className="shrink-0 text-amber-800" /><span className="truncate">Le pense-bête</span></h2><span className="shrink-0 rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 text-[10px] font-extrabold uppercase text-amber-950">À lire</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-orange-200 border-l-4 border-l-accent bg-orange-50/60 px-3 py-2">
          <div data-speaker-hint className="text-ink [&_.participant-note]:whitespace-normal [&_p]:whitespace-pre-line [&_p]:text-sm [&_p]:leading-relaxed [&_li]:text-sm [&_li]:leading-relaxed"><ParticipantNote hint={note} /></div>
        </div>
      </> : <>
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-line">
        <h2 id="prompts-title" className="flex items-center gap-2 text-sm font-bold"><FormatListNumberedRounded size={20} className="text-brand" />Le fil du point</h2>
        <Button disabled={!loaded || saving} onClick={() => { setDraft([...settings.prompts]); setEditing(true); setError(''); setNotice(''); }} aria-label="Modifier les questions de l’équipe" variant="ghost" size="sm" className="min-h-[44px] min-w-[0px] px-[8px] text-[11px] normal-case">Modifier</Button>
      </div>
      {!loaded && !error && <PageSkeleton variant="timer" scope="section" label="Chargement des questions de l’équipe…" />}
      {error && !editing && <div role="alert" className="text-[11px] text-danger">{error} {!loaded && 'Questions par défaut affichées.'} <Button onClick={retry} variant="ghost" size="sm">Réessayer</Button></div>}
      {notice && <p role="status" className="text-[11px] text-success">{notice}</p>}
      {(loaded || error) && <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {settings.prompts.map((prompt, index) => (
          <article className="grid min-w-0 shrink-0 grid-cols-[24px_minmax(0,1fr)] gap-x-3 border-b border-line py-3 last:border-0" key={index}>
            <span aria-hidden="true" className="row-span-3 pt-0.5 text-xs font-bold tabular-nums text-brand">{String(index + 1).padStart(2, '0')}</span><span className="text-[11px] font-semibold text-muted">{standard ? defaultHeadings[index] : 'ÉQUIPE'}</span>
            <h3 className="col-start-2 mt-1 break-words text-sm font-semibold leading-snug">{prompt}</h3>
            {standard && !compact && <p className="col-start-2 mt-1 text-xs leading-relaxed text-muted min-[801px]:max-[1100px]:hidden">{descriptions[index]}</p>}
          </article>
        ))}
      </div>}
      </>}
      </motion.div>
      </>}
      <Dialog open={editing} onOpenChange={next => { if (!next) (() => { if (!saving) setEditing(false); })?.(); }}><DialogContent showCloseButton={false} className="min-h-0 max-h-[calc(100dvh_-_24px)] border-[1px_solid_#dce3e9] rounded-[14px] max-w-[600px]" aria-labelledby="edit-prompts-title">
        <DialogTitle id="edit-prompts-title" className={cn("shrink-0 px-5 pt-5 pb-2", "border-t-2 border-t-accent pb-2! text-lg! font-bold!")}>Questions de l’équipe</DialogTitle>
        <div className={cn("min-h-0 overflow-y-auto px-5 py-3", "min-h-0 overflow-y-auto")}>
          <p className="mb-3 text-xs text-muted">1 à 5 questions, 160 caractères chacune. Ces questions sont partagées avec tous les appareils de cette équipe.</p>
          <div className="flex flex-col gap-3">
            {draft.map((prompt, index) => <div key={index} className="flex items-start gap-1">
              <div className="grid min-w-0 gap-1.5"><Label htmlFor={`daily-prompt-${index}`}>{`Question ${index + 1}`}</Label><Input id={`daily-prompt-${index}`} value={prompt} disabled={saving || conflict} onChange={event => setDraft(current => current.map((text, i) => i === index ? event.target.value : text))} aria-describedby={`daily-prompt-hint-${index}`} /><p id={`daily-prompt-hint-${index}`} className="text-xs text-muted">{`${[...prompt].length}/160`}</p></div>
              <Button disabled={saving || conflict || draft.length === 1} onClick={() => setDraft(current => current.filter((_, i) => i !== index))} aria-label={`Supprimer la question ${index + 1}`} variant="ghost" className="min-h-[44px] shrink-0">Retirer</Button>
            </div>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button disabled={saving || conflict || draft.length >= 5} onClick={() => setDraft(current => [...current, ''])} variant="ghost" className="min-h-[44px]">Ajouter une question</Button>
            <Button disabled={saving || conflict} onClick={() => setDraft([...DEFAULT_DISCUSSION_PROMPTS])} variant="ghost" className="min-h-[44px]">Rétablir les 3 questions par défaut</Button>
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
          {conflict && <Button onClick={retry} variant="ghost" className="min-h-[44px]">Recharger les questions partagées</Button>}
        </div>
        <DialogFooter className="border-t border-line"><Button disabled={saving} onClick={() => { setEditing(false); setError(''); if (conflict) retry(); }} variant="ghost" className="min-h-[44px]">Annuler</Button><Button disabled={saving || conflict} onClick={() => void save()} variant="default" className="min-h-[44px]">{saving ? 'Enregistrement…' : 'Enregistrer'}</Button></DialogFooter>
      </DialogContent></Dialog>
    </section>
  );
}