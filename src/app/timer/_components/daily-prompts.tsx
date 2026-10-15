'use client';

import { useEffect, useRef, useState } from 'react';
import { card } from '@/components/ui/styles';
import { useTeam } from '@/providers/team-provider';
import { DEFAULT_DISCUSSION_PROMPTS, validateDiscussionPrompts, validateMeetingSettings, type MeetingSettings } from '@/lib/meeting-settings';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, TextField } from '@mui/material';

const descriptions = [
  'Partagez vos avancées, vos petites réussites et ce que vous avez terminé.',
  'Dites à l’équipe ce qui vous occupe et ce qui avance en ce moment.',
  'Présentez vos prochaines étapes, vos blocages et l’aide dont vous avez besoin.',
];
const defaultHeadings = ['HIER', 'EN CE MOMENT', 'AUJOURD’HUI'];

export function DailyPrompts({ className = '' }: { className?: string }) {
  const { activeTeamId } = useTeam();
  return <TeamPrompts key={activeTeamId ?? 'none'} teamId={activeTeamId} className={className} />;
}
function TeamPrompts({ teamId, className }: { teamId: string | null; className: string }) {
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
    <Paper component="section" elevation={0} className={`daily-prompts ${card} flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border-slate-200/80 p-3 ${className}`} aria-labelledby="prompts-title">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-line">
        <h2 id="prompts-title" className="text-sm font-semibold">Pour guider le point</h2>
        <Button size="small" disabled={!loaded || saving} onClick={() => { setDraft([...settings.prompts]); setEditing(true); setError(''); setNotice(''); }} aria-label="Modifier les questions de l’équipe">Modifier</Button>
      </div>
      {!loaded && !error && <p role="status" className="text-[11px] text-muted">Chargement des questions de l’équipe…</p>}
      {error && !editing && <div role="alert" className="text-[11px] text-danger">{error} {!loaded && 'Questions par défaut affichées.'} <Button size="small" onClick={retry}>Réessayer</Button></div>}
      {notice && <p role="status" className="text-[11px] text-success">{notice}</p>}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {settings.prompts.map((prompt, index) => (
          <article className="min-w-0 shrink-0 rounded-xl border border-line bg-slate-50/60 p-2.5" key={index}>
            <span className="border-l-2 border-accent pl-1.5 text-[9px] font-semibold tracking-wide text-brand">{String(index + 1).padStart(2, '0')}{standard ? ` / ${defaultHeadings[index]}` : ' / ÉQUIPE'}</span>
            <h3 className="mt-1 break-words text-sm font-semibold leading-snug">{prompt}</h3>
            {standard && <p className="mt-1 text-[11px] leading-relaxed text-muted min-[801px]:max-[1100px]:hidden">{descriptions[index]}</p>}
          </article>
        ))}
      </div>
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