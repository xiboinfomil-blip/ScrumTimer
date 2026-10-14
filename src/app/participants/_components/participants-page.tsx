'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { card, routeStage } from '@/components/ui/styles';
import { AddPersonForm } from './add-person-form';
import { AttendanceList } from './attendance-list';
import { ParticipantsActions, ParticipantsHeading, ParticipantsToolbar } from './participants-controls';

export function ParticipantsPage() {
  const { state, updateTeam } = useTeam();
  const notify = useNotify();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'delete' | 'fresh' | null>(null);
  const [attendanceView, setAttendanceView] = useState(true);
  const present = state.roster.filter(person => person.present);
  const absent = state.roster.filter(person => !person.present);
  const selectedIds = new Set([...selected].filter(id => state.roster.some(person => person.id === id)));
  function remove(ids: Set<string>) {
    updateTeam(current => ({ ...current, roster: current.roster.filter(person => !ids.has(person.id)), session: [] }));
    setSelected(current => new Set([...current].filter(id => !ids.has(id))));
  }
  return <div id="participants-page" className={`${routeStage} mx-auto w-full max-w-6xl`}>
    <ParticipantsHeading total={state.roster.length} present={present.length} onFresh={() => setDialog('fresh')} />
    <section className={`card participants-panel ${card} flex min-h-0 w-full flex-1 flex-col gap-2 p-3 max-[650px]:p-2 ${state.roster.length ? 'max-h-160' : 'max-h-64'}`} aria-label="Les participants">
      <AddPersonForm />
      <ParticipantsToolbar total={state.roster.length} selectedCount={selectedIds.size} onSelectAll={checked => setSelected(new Set(checked ? state.roster.map(person => person.id) : []))} onDelete={() => setDialog('delete')} />
      <div className="hidden shrink-0 gap-1 border-b border-line max-[650px]:flex" role="group" aria-label="Afficher les présences">{[true, false].map(attendance => <button key={String(attendance)} type="button" aria-pressed={attendanceView === attendance} aria-controls={attendance ? 'attendance-present' : 'attendance-absent'} onClick={() => setAttendanceView(attendance)} className={`flex h-11 flex-1 items-center justify-center gap-2 border-b-2 text-xs font-semibold ${attendanceView === attendance ? attendance ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger' : 'border-transparent text-muted'}`}>{attendance ? 'Présents' : 'Absents'}<span className="text-[11px] font-normal">{attendance ? present.length : absent.length}</span></button>)}</div>
      <div className="attendance-columns grid min-h-0 flex-1 grid-cols-2 gap-3 max-[650px]:grid-cols-1">{[true, false].map(attendance => <AttendanceList key={String(attendance)} people={attendance ? present : absent} present={attendance} mobileVisible={attendanceView === attendance} selected={selectedIds} onSelect={id => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onToggle={id => updateTeam(current => ({ ...current, session: [], roster: current.roster.map(person => person.id === id ? { ...person, present: !person.present } : person) }))} onRemove={id => remove(new Set([id]))} />)}</div>
      <ParticipantsActions present={present.length} onContinue={() => router.push('/mood')} />
    </section>
    <ConfirmDialog open={dialog === 'delete'} title="Supprimer les personnes sélectionnées ?" description={`${selectedIds.size} personne(s) seront supprimées de l’équipe, avec leurs présences et humeurs. Cette action est irréversible.`} confirmLabel="Supprimer" danger onClose={() => setDialog(null)} onConfirm={() => { remove(selectedIds); notify(`${selectedIds.size} personne(s) supprimée(s).`); }} />
    <ConfirmDialog open={dialog === 'fresh'} title="Commencer un nouveau bilan ?" description="Votre équipe est conservée. Tout le monde sera marqué présent et les humeurs seront effacées pour permettre à chacun de choisir à nouveau." confirmLabel="Recommencer" onClose={() => setDialog(null)} onConfirm={() => { updateTeam(current => ({ ...current, session: [], roster: current.roster.map(person => ({ ...person, present: true, mood: null, moodUpdatedAt: null })) })); notify('Nouveau bilan prêt. Confirmez les présences et choisissez les humeurs du jour.'); }} />
  </div>;
}