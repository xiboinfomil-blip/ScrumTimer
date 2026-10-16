'use client';

import { useState } from 'react';
import { Button, Paper } from '@mui/material';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { card, routeStage } from '@/components/ui/styles';
import { AttendanceList } from './attendance-list';
import { ParticipantsActions, ParticipantsHeading } from './participants-controls';
import { ParticipantIcon } from './participant-icon';
import { LineupRevealDialog, type RevealPerson } from '@/components/ui/lineup-reveal-dialog';
import { shuffle } from '@/lib/shuffle';

export function ParticipantsPage() {
  const { state, activeTeamId, todayRound, updateTeam, participantOrder, setParticipantOrder } = useTeam();
  const notify = useNotify();
  const router = useRouter();
  const [fresh, setFresh] = useState(false);
  const [reveal, setReveal] = useState<{ people: RevealPerson[]; order: string[] } | null>(null);
  const [attendanceView, setAttendanceView] = useState(true);
  const present = state.roster.filter(person => person.present);
  const absent = state.roster.filter(person => !person.present);
  return <div id="participants-page" className={`${routeStage} mx-auto w-full max-w-6xl max-[400px]:[&>section:first-child_.MuiAvatar-root]:hidden max-[400px]:[&_h1]:text-lg`}>
    <ParticipantsHeading total={state.roster.length} present={present.length} onFresh={() => setFresh(true)} />
    {todayRound && <p className="shrink-0 rounded-xl border border-green-200 bg-green-50 px-3 text-xs text-success">Point quotidien déjà terminé aujourd’hui. <Button component={Link} href={`/timer?team=${activeTeamId}`} sx={{ minHeight: 44, fontSize: 12, textTransform: 'none' }}>Voir le bilan ou réinitialiser</Button></p>}
    <Paper component="section" elevation={0} className={`participants-panel ${card} flex min-h-0 w-full flex-1 flex-col gap-2 rounded-2xl border-slate-200/80 p-4 max-[650px]:p-2.5`} aria-label="Les participants">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line pb-2"><p className="text-xs font-medium text-muted max-[400px]:text-[11px]">Confirmez les présences du jour.</p><Button component={Link} href={`/manage-team?team=${activeTeamId}`} variant="outlined" sx={{ minHeight: 44, minWidth: 0, px: 1.5, fontSize: 12, textTransform: 'none', borderRadius: '12px' }} className="shrink-0 gap-2"><ParticipantIcon name="people" />Gérer l’équipe</Button></div>
      <div className="hidden shrink-0 gap-1 rounded-xl bg-slate-100/80 p-1 max-[650px]:flex" role="group" aria-label="Afficher les présences">{[true, false].map(attendance => <Button key={String(attendance)} type="button" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 12 }} aria-pressed={attendanceView === attendance} aria-controls={attendance ? 'attendance-present' : 'attendance-absent'} onClick={() => setAttendanceView(attendance)} className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-xs font-semibold ${attendanceView === attendance ? `bg-white shadow-sm ring-1 ring-slate-200/70 ${attendance ? 'text-success' : 'text-muted'}` : 'text-muted hover:bg-white/60'}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${attendance ? 'bg-success' : 'bg-slate-400'}`} />{attendance ? 'Présents' : 'Absents'}<span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px]">{attendance ? present.length : absent.length}</span></Button>)}</div>
      <div className="attendance-columns grid min-h-0 flex-1 grid-cols-2 gap-3 max-[650px]:grid-cols-1">{[true, false].map(attendance => <AttendanceList key={String(attendance)} people={attendance ? present : absent} present={attendance} mobileVisible={attendanceView === attendance} onToggle={id => updateTeam(current => current.roster.some(person => person.id === id) ? ({ ...current, session: [], roster: current.roster.map(person => person.id === id ? { ...person, present: !person.present } : person) }) : current)} />)}</div>
      <ParticipantsActions present={present.length} onContinue={() => {
        if (reveal || !present.length) return;
        const ids = present.map(person => person.id);
        const previous = participantOrder.length === ids.length && ids.every(id => participantOrder.includes(id)) ? participantOrder : ids;
        setReveal({ people: previous.map(id => ({ id, name: present.find(person => person.id === id)!.name, postponed: false })), order: shuffle(previous, true) });
      }} />
    </Paper>
    {reveal && <LineupRevealDialog people={reveal.people} order={reveal.order} onCancel={() => setReveal(null)} onComplete={() => {
      setReveal(null);
      const ids = state.roster.filter(person => person.present).map(person => person.id);
      if (ids.length !== reveal.order.length || ids.some(id => !reveal.order.includes(id))) return;
      setParticipantOrder(reveal.order);
      router.push(`/mood?team=${activeTeamId}`);
    }} />}
    <ConfirmDialog open={fresh} title="Commencer un nouveau bilan ?" description="Votre équipe est conservée. Tout le monde sera marqué présent et les humeurs seront effacées pour permettre à chacun de choisir à nouveau." confirmLabel="Recommencer" onClose={() => setFresh(false)} onConfirm={() => { updateTeam(current => ({ ...current, session: [], roster: current.roster.map(person => ({ ...person, present: true, mood: null, moodUpdatedAt: null, moodSlide: null })) })); notify('Nouveau bilan prêt. Confirmez les présences et choisissez les humeurs du jour.'); }} />
  </div>;
}