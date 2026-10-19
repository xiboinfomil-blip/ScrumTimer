'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AttendanceList } from './attendance-list';
import { ParticipantsActions, ParticipantsHeading } from './participants-controls';
import { ParticipantIcon } from './participant-icon';
import { LineupRevealDialog, type RevealPerson } from '@/components/ui/lineup-reveal-dialog';
import { shuffle } from '@/lib/shuffle';
import { useViewMotion } from '@/hooks/use-view-motion';
import { freshRound, toggleAttendance as toggleTeamAttendance } from '@/lib/attendance';

export function ParticipantsPage() {
  const { state, activeTeamId, todayRound, updateTeam, participantOrder, setParticipantOrder } = useTeam();
  const notify = useNotify();
  const router = useRouter();
  const [fresh, setFresh] = useState(false);
  const [reveal, setReveal] = useState<{ people: RevealPerson[]; order: string[] } | null>(null);
  const [attendanceView, setAttendanceView] = useState(true);
  const panels = useViewMotion(attendanceView);
  const [query, setQuery] = useState('');
  const present = state.roster.filter(person => person.present);
  const absent = state.roster.filter(person => !person.present);
  const searchable = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr-FR');
  const matches = (name: string) => searchable(name).includes(searchable(query.trim()));
  function toggleAttendance(id: string) {
    const person = state.roster.find(person => person.id === id);
    if (!person) return;
    if (updateTeam(current => toggleTeamAttendance(current, id))) {
      notify(`${person.name} : ${person.present ? 'absent(e)' : 'présent(e)'}.`);
    }
  }
  return <div id="participants-page" className={`mx-auto flex min-h-0 w-full flex-1 flex-col gap-4 max-[650px]:gap-2 [@media(max-height:650px)]:gap-2 ${todayRound ? 'overflow-y-auto [&>.participants-panel]:min-h-96 [&>.participants-panel]:shrink-0' : ''}`}>
    <ParticipantsHeading total={state.roster.length} present={present.length} onFresh={() => setFresh(true)} />
    {todayRound && <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 rounded-xl border border-green-200 bg-success-soft px-3 text-xs text-success"><p>Point quotidien déjà terminé aujourd’hui.</p><Link href={`/timer?team=${activeTeamId}`} className="inline-flex min-h-11 items-center rounded-lg font-semibold hover:underline">Voir le bilan ou réinitialiser</Link></div>}
    <section className="participants-panel flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm shadow-brand/3" aria-label="Les participants">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2 max-[650px]:px-3">
        <div className="min-w-0"><h2 className="text-sm font-bold text-ink">Les présences du jour</h2><p className="mt-1 text-xs text-muted max-[650px]:hidden [@media(max-height:650px)]:hidden">Une absence aujourd’hui ne retire personne de l’équipe.</p></div>
        <Link href={`/manage-team?team=${activeTeamId}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 text-xs font-semibold text-brand hover:bg-blue-50"><ParticipantIcon name="people" className="size-4 max-[360px]:hidden" />Gérer l’équipe</Link>
      </div>
      {state.roster.length > 0 && <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-1 max-[650px]:px-3">
        <ParticipantIcon name="people" className="size-4 shrink-0 text-muted" />
        <label htmlFor="attendance-search" className="sr-only">Rechercher un participant</label>
        <input id="attendance-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une personne…" className="min-h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm text-ink placeholder:text-muted focus:bg-slate-50" />
        <span role="status" aria-live="polite" className="sr-only">{state.roster.filter(person => matches(person.name)).length} résultat(s).</span>
      </div>}
      <div className="mx-3 mt-2 hidden shrink-0 gap-1 rounded-xl bg-slate-100 p-1 max-[650px]:flex" role="group" aria-label="Afficher les présences">{[true, false].map(attendance => <button key={String(attendance)} type="button" aria-pressed={attendanceView === attendance} aria-controls={attendance ? 'attendance-present' : 'attendance-absent'} onClick={() => setAttendanceView(attendance)} className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg text-xs font-semibold ${attendanceView === attendance ? `bg-white shadow-sm ${attendance ? 'text-success' : 'text-ink'}` : 'text-muted hover:bg-white/60'}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${attendance ? 'bg-success' : 'bg-slate-400'}`} />{attendance ? 'Présents' : 'Absents'}<span className="rounded-md bg-slate-100 px-1.5 py-0.5 tabular-nums">{attendance ? present.length : absent.length}</span></button>)}</div>
      {state.roster.length ? <div ref={panels} className="attendance-columns grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 px-4 py-1 max-[650px]:grid-cols-1 max-[650px]:px-3">{[true, false].map(attendance => <AttendanceList key={`${attendance}-${query}`} people={(attendance ? present : absent).filter(person => matches(person.name))} total={(attendance ? present : absent).length} searching={!!query.trim()} present={attendance} mobileVisible={attendanceView === attendance} onToggle={toggleAttendance} />)}</div> : <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-3 text-center">
        <span aria-hidden="true" className="grid size-10 place-items-center rounded-2xl bg-blue-50 text-brand [@media(max-height:650px)]:hidden"><ParticipantIcon name="people" /></span><p className="text-sm font-semibold text-ink">Votre équipe vous attend.</p><p className="max-w-72 text-xs leading-relaxed text-muted">Ajoutez vos membres dans Gérer l’équipe, puis retrouvez-les ici pour les présences.</p>
      </div>}
      <ParticipantsActions present={present.length} onContinue={() => {
        if (reveal || !present.length) return;
        const ids = present.map(person => person.id);
        const previous = participantOrder.length === ids.length && ids.every(id => participantOrder.includes(id)) ? participantOrder : ids;
        setReveal({ people: previous.map(id => ({ id, name: present.find(person => person.id === id)!.name, postponed: false })), order: shuffle(previous, true) });
      }} />
    </section>
    {reveal && <LineupRevealDialog people={reveal.people} order={reveal.order} onCancel={() => setReveal(null)} onComplete={() => {
      setReveal(null);
      const ids = state.roster.filter(person => person.present).map(person => person.id);
      if (ids.length !== reveal.order.length || ids.some(id => !reveal.order.includes(id))) return;
      setParticipantOrder(reveal.order);
      router.push(`/mood?team=${activeTeamId}`);
    }} />}
    <ConfirmDialog open={fresh} title="Commencer un nouveau bilan ?" description="Votre équipe est conservée. Tout le monde sera marqué présent ; les humeurs, les reports et la progression du minuteur seront effacés pour permettre à chacun de choisir à nouveau." confirmLabel="Recommencer" onClose={() => setFresh(false)} onConfirm={() => { if (updateTeam(freshRound)) { setParticipantOrder([]); notify('Nouveau bilan prêt. Confirmez les présences et choisissez les humeurs du jour.'); } }} />
  </div>;
}