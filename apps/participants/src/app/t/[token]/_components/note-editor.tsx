'use client';
import { useEffect, useRef, useState } from 'react';
import { button, field, primary } from '@/components/ui';
import { characterCount, validateNote } from '@/lib/contracts';
import { mauritiusDay } from '@/lib/statistics';
import type { NoteInput, Notes, PortalData } from '@/types/portal';

type Props = {
  participant: { id: string; name: string }; data: PortalData; day: string; saving: boolean;
  save: (input: NoteInput) => Promise<Notes>; refresh: () => Promise<PortalData | null>;
  onClose: () => void;
};
export function NoteEditor({ participant, data, day, saving, save, refresh, onClose }: Props) {
  const current = data.hints.find(h => h.participantId === participant.id);
  const [base, setBase] = useState(() => ({ day: data.day, hint: current?.hint ?? '', revision: current?.revision ?? 0 }));
  const [draft, setDraft] = useState(base.hint);
  const [message, setMessage] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [review, setReview] = useState<{ day: string; hint: string; revision: number } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const dirty = draft !== base.hint;
  const removed = !data.team.roster.some(p => p.id === participant.id);
  const changed = base.day !== day || base.day !== data.day || (current?.revision ?? 0) !== base.revision || (current?.hint ?? '') !== base.hint;
  const conflict = uncertain || changed;
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, saving]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (conflict || saving || removed) return;
    try {
      const input = validateNote({ participantId: participant.id, hint: draft, day: base.day, revision: base.revision });
      if (input.day !== mauritiusDay()) { setUncertain(true); setMessage('La journée a changé. Rechargez pour vérifier.'); return; }
      const notes = await save(input);
      const saved = notes.hints.find(h => h.participantId === participant.id);
      if (!saved) throw new Error('Réponse incomplète. Rechargez pour vérifier l’enregistrement.');
      setBase({ day: notes.day, hint: saved.hint, revision: saved.revision }); setDraft(saved.hint);
      setMessage('Note enregistrée et partagée avec l’équipe.'); setReview(null);
    } catch (e) {
      // Even a timeout may have committed. Never retry a write without review.
      setUncertain(true); setReview(null);
      setMessage(e instanceof Error ? e.message : 'Enregistrement non confirmé. Rechargez pour vérifier.');
    }
  }
  async function loadReview() {
    setReviewing(true); setMessage('');
    const fresh = await refresh();
    if (fresh) {
      const hint = fresh.hints.find(h => h.participantId === participant.id);
      setReview({ day: fresh.day, hint: hint?.hint ?? '', revision: hint?.revision ?? 0 });
    } else setMessage('Rechargement impossible. Votre brouillon est conservé.');
    setReviewing(false);
  }
  return <section aria-labelledby="editor-title" className="mt-5 rounded-2xl border-2 border-brand bg-blue-50/50 p-4 sm:p-5"><div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-brand">Note partagée · {base.day}</p><h3 id="editor-title" className="text-lg font-bold">{participant.name}</h3></div><button className={button} disabled={saving || reviewing} onClick={() => { if (!dirty || window.confirm('Abandonner ce brouillon non enregistré ?')) onClose(); }}>Fermer</button></div>
    <p id="note-help" className="mb-3 text-sm text-slate-600">Vous écrivez pour ce participant, sans identité personnelle vérifiée. Toute l’équipe peut modifier cette note jusqu’à minuit à Maurice (UTC+4).</p>
    <form onSubmit={submit} className="space-y-3"><label htmlFor="note" className="block text-sm font-semibold">Note de {participant.name}</label><textarea ref={inputRef} id="note" className={`${field} min-h-40 resize-y`} value={draft} disabled={saving || reviewing} onChange={e => { setDraft(e.target.value.replace(/\r\n?/g, '\n')); setReview(null); }} aria-describedby="note-help note-count" /><p id="note-count" className={`text-xs ${characterCount(draft.trim()) > 600 ? 'text-red-800' : 'text-slate-600'}`}>{characterCount(draft.trim())} / 600 caractères Unicode · texte non vide, retours LF uniquement</p>
    {removed && <p role="alert" className="text-sm text-red-800">Ce participant ne figure plus dans l’équipe. Le brouillon est conservé mais ne peut pas être enregistré.</p>}
    {conflict && <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3"><p role="alert" className="text-sm text-amber-950">La version ou la journée a changé, ou le dernier enregistrement n’est pas confirmé. Votre brouillon n’a pas été remplacé. Rechargez et comparez avant tout nouvel enregistrement.</p><button type="button" className={button} disabled={saving || reviewing} onClick={() => void loadReview()}>{reviewing ? 'Rechargement…' : 'Recharger pour comparer'}</button>
      {review && <div className="space-y-3"><p className="text-xs font-semibold">Version serveur · {review.day} · révision {review.revision}</p><p className="whitespace-pre-wrap rounded-lg bg-white p-3 text-sm">{review.hint || 'Aucune note enregistrée.'}</p><button type="button" className={button} disabled={review.day !== day || removed} onClick={() => { setBase(review); setUncertain(false); setReview(null); setMessage('Version examinée. Le brouillon est conservé ; vérifiez-le puis enregistrez explicitement.'); }}>Version examinée : conserver mon brouillon</button><button type="button" className={button} onClick={() => { if (window.confirm('Remplacer votre brouillon par la version du serveur ?')) { setBase(review); setDraft(review.hint); setUncertain(false); setReview(null); setMessage('Version serveur chargée.'); } }}>Remplacer mon brouillon par cette version</button></div>}
    </div>}
    <div className="flex flex-wrap items-center gap-3"><button className={primary} disabled={saving || reviewing || conflict || removed || !dirty || !draft.trim() || characterCount(draft.trim()) > 600}>{saving ? 'Enregistrement…' : 'Enregistrer la note'}</button><span className="text-xs text-slate-600">{dirty ? 'Brouillon non enregistré' : 'Aucune modification en attente'}</span></div><p role="status" className="text-sm text-brand">{message}</p></form></section>;
}