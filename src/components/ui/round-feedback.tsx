'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, NativeSelect } from '@mui/material';
import { useTeam } from '@/providers/team-provider';
import { FEEDBACK_VALUES, summarizeRoundFeedback, validateRoundFeedback, type FeedbackValue, type RoundFeedbackData } from '@/lib/meeting-settings';
import type { HistoryRound } from '@/lib/history';

const labels: Record<FeedbackValue, string> = { utile: 'Utile', mitige: 'Mitigé', 'pas-utile': 'Pas utile' };
function parseFeedback(value: unknown, round: HistoryRound): RoundFeedbackData {
  const body = value as Partial<RoundFeedbackData> | null;
  if (!body || body.roundId !== round.id || !Array.isArray(body.responses)) throw new Error('Retours invalides.');
  const responses = body.responses.map(response => validateRoundFeedback({ roundId: round.id, participantId: response.participantId, value: response.value }));
  if (new Set(responses.map(response => response.participantId)).size !== responses.length || responses.some(response => !round.people.some(person => person.id === response.participantId))) throw new Error('Retours invalides.');
  return summarizeRoundFeedback(round.id, responses);
}
export function RoundFeedback({ round }: { round: HistoryRound }) {
  const { activeTeamId } = useTeam();
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="text" aria-label="Utilité du point · facultatif" sx={{ minHeight: 44, minWidth: 44, px: 1, fontSize: 10, textTransform: 'none' }} onClick={() => setOpen(true)}><span className="max-[650px]:hidden">Utilité du point · facultatif</span><span className="min-[650px]:hidden">Avis</span></Button>
    {open && activeTeamId && <FeedbackDialog key={`${activeTeamId}:${round.id}`} teamId={activeTeamId} round={round} onClose={() => setOpen(false)} />}
  </>;
}
function FeedbackDialog({ teamId, round, onClose }: { teamId: string; round: HistoryRound; onClose: () => void }) {
  const [data, setData] = useState<RoundFeedbackData | null>(null);
  const [participantId, setParticipantId] = useState('');
  const [choice, setChoice] = useState<FeedbackValue | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    void (async () => {
      try {
        const response = await fetch(`/api/round-feedback?roundId=${encodeURIComponent(round.id)}`, { headers: { 'X-Team-Id': teamId }, cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Retours indisponibles.');
        const next = parseFeedback(body, round);
        if (!controller.signal.aborted) { setData(next); setError(''); }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Retours indisponibles.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); request.current?.abort(); };
  }, [teamId, round, reload]);
  const current = data?.responses.find(response => response.participantId === participantId)?.value;
  const retry = () => { request.current?.abort(); setLoading(true); setError(''); setNotice(''); setReload(value => value + 1); };
  const save = async () => {
    if (!data || loading || saving || !participantId || !choice) return;
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/round-feedback', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Team-Id': teamId }, body: JSON.stringify({ roundId: round.id, participantId, value: choice }), signal: controller.signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Enregistrement impossible.');
      const next = parseFeedback(body, round);
      if (!controller.signal.aborted) { setData(next); setNotice('Retour enregistré. Une nouvelle sélection remplace la précédente pour ce participant.'); }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Enregistrement impossible.');
    } finally { if (!controller.signal.aborted) setSaving(false); }
  };
  return <Dialog open onClose={() => { if (!saving) onClose(); }} fullWidth maxWidth="sm" aria-labelledby="round-feedback-title">
    <DialogTitle id="round-feedback-title">Ce point a-t-il été utile ?</DialogTitle>
    <DialogContent>
      <p className="mb-3 text-xs text-muted">Retour facultatif, sans commentaire libre. Sélectionnez explicitement un participant du bilan archivé. Accès partagé sans authentification : l’identité n’est pas vérifiée et les réponses ne sont pas anonymes.</p>
      {loading && <p role="status" className="text-xs text-muted">Chargement des retours…</p>}
      {data && <div aria-label="Retours enregistrés" className="mb-4 grid grid-cols-3 gap-2">{FEEDBACK_VALUES.map(value => <div key={value} className="rounded-xl border border-line bg-slate-50 p-2 text-center"><span className="block text-xs text-muted">{labels[value]}</span><strong className="text-lg text-brand">{data.counts[value]}</strong></div>)}</div>}
      <FormControl fullWidth disabled={loading || saving || !data}>
        <InputLabel htmlFor="feedback-participant" shrink>Participant du bilan</InputLabel>
        <NativeSelect value={participantId} inputProps={{ id: 'feedback-participant' }} onChange={event => { const id = event.target.value; setParticipantId(id); setChoice(data?.responses.find(response => response.participantId === id)?.value ?? ''); setNotice(''); }}>
          <option value="">Choisir un participant…</option>
          {round.people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
        </NativeSelect>
      </FormControl>
      {participantId && <p className="mt-3 text-xs text-muted">Réponse actuellement enregistrée : <strong>{current ? labels[current] : 'aucune'}</strong>.</p>}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Choix d’utilité">{FEEDBACK_VALUES.map(value => <Button key={value} variant={choice === value ? 'contained' : 'outlined'} aria-pressed={choice === value} disabled={!participantId || loading || saving || !data} onClick={() => { setChoice(value); setNotice(''); }}>{labels[value]}</Button>)}</div>
      {error && <div role="alert" className="mt-3 text-xs text-danger">{error}<Button disabled={saving || loading} onClick={retry}>Réessayer le chargement</Button></div>}
      {notice && <p role="status" className="mt-3 text-xs text-success">{notice}</p>}
      <p className="mt-3 text-[11px] text-muted">Une seule réponse par participant et par bilan. Les retours sont supprimés avec le bilan, y compris à la fin de sa durée de conservation.</p>
    </DialogContent>
    <DialogActions><Button disabled={saving} onClick={onClose}>Fermer sans répondre</Button><Button variant="contained" disabled={!participantId || !choice || !data || saving || loading} onClick={() => void save()}>{saving ? 'Enregistrement…' : current ? 'Mettre à jour' : 'Enregistrer'}</Button></DialogActions>
  </Dialog>;
}