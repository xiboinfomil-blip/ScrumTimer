'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTeam } from '@/providers/team-provider';
import { useNotify } from '@/providers/notification-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { card, routeStage } from '@/components/ui/styles';
import { validatePersonName } from '@/lib/action-validation';
import { AddPersonForm } from './add-person-form';
import { AttendanceList } from './attendance-list';
import { EditPersonDialog } from './edit-person-dialog';
import { ParticipantsActions, ParticipantsHeading, ParticipantsToolbar } from './participants-controls';

export function ParticipantsPage() {
  const { state, todayRound, updateTeam } = useTeam();
  const notify = useNotify();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'delete' | 'fresh' | null>(null);
  const [pendingDeletionIds, setPendingDeletionIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [attendanceView, setAttendanceView] = useState(true);
  const present = state.roster.filter(person => person.present);
  const absent = state.roster.filter(person => !person.present);
  const selectedIds = new Set([...selected].filter(id => state.roster.some(person => person.id === id)));
  const deletionIds = new Set([...pendingDeletionIds].filter(id => state.roster.some(person => person.id === id)));
  const editingPerson = state.roster.find(person => person.id === editingId);
  function requestDeletion(ids: Set<string>) {
    const existing = new Set([...ids].filter(id => state.roster.some(person => person.id === id)));
    if (!existing.size) { notify('Aucune personne à supprimer.'); return; }
    setPendingDeletionIds(existing);
    setDialog('delete');
  }
  function closeDialog() { setDialog(null); setPendingDeletionIds(new Set()); }
  function remove(ids: Set<string>) {
    const existing = new Set([...ids].filter(id => state.roster.some(person => person.id === id)));
    if (!existing.size) { notify('Aucune personne à supprimer.'); return; }
    const accepted = updateTeam(current => {
      const roster = current.roster.filter(person => !existing.has(person.id));
      return roster.length === current.roster.length ? current : { ...current, roster, session: [] };
    });
    if (!accepted) return;
    setSelected(current => new Set([...current].filter(id => !existing.has(id))));
    notify(`${existing.size} personne(s) supprimée(s).`);
  }
  function saveName(id: string, name: string): string | null {
    const error = validatePersonName(name);
    if (error) return error;
    const person = state.roster.find(person => person.id === id);
    if (!person) return 'Cette personne ne fait plus partie de l’équipe.';
    const trimmed = name.trim();
    if (person.name === trimmed) return null;
    const accepted = updateTeam(current => {
      if (!current.roster.some(person => person.id === id)) return current;
      return { ...current, session: [], roster: current.roster.map(person => person.id === id ? { ...person, name: trimmed } : person) };
    });
    if (!accepted) return 'Modification impossible. Rechargez votre équipe depuis Neon.';
    notify('Nom du participant modifié.');
    return null;
  }
  return <div id="participants-page" className={`${routeStage} mx-auto w-full max-w-6xl`}>
    <ParticipantsHeading total={state.roster.length} present={present.length} onFresh={() => setDialog('fresh')} />
    {todayRound && <p className="shrink-0 rounded-xl border border-green-200 bg-green-50 px-3 text-xs text-success">Point quotidien déjà terminé aujourd’hui. <Link href="/timer" className="inline-flex min-h-11 items-center font-semibold underline">Voir le bilan ou réinitialiser</Link></p>}
    <section className={`card participants-panel ${card} flex min-h-0 w-full flex-1 flex-col gap-2 p-3 max-[650px]:p-2 ${state.roster.length ? 'max-h-160' : 'max-h-64'}`} aria-label="Les participants">
      <AddPersonForm />
      <ParticipantsToolbar total={state.roster.length} selectedCount={selectedIds.size} onSelectAll={checked => setSelected(new Set(checked ? state.roster.map(person => person.id) : []))} onDelete={() => requestDeletion(selectedIds)} />
      <div className="hidden shrink-0 gap-1 border-b border-line max-[650px]:flex" role="group" aria-label="Afficher les présences">{[true, false].map(attendance => <button key={String(attendance)} type="button" aria-pressed={attendanceView === attendance} aria-controls={attendance ? 'attendance-present' : 'attendance-absent'} onClick={() => setAttendanceView(attendance)} className={`flex h-11 flex-1 items-center justify-center gap-2 border-b-2 text-xs font-semibold ${attendanceView === attendance ? attendance ? 'border-success bg-success-soft text-success' : 'border-danger bg-danger-soft text-danger' : 'border-transparent text-muted'}`}>{attendance ? 'Présents' : 'Absents'}<span className="text-[11px] font-normal">{attendance ? present.length : absent.length}</span></button>)}</div>
      <div className="attendance-columns grid min-h-0 flex-1 grid-cols-2 gap-3 max-[650px]:grid-cols-1">{[true, false].map(attendance => <AttendanceList key={String(attendance)} people={attendance ? present : absent} present={attendance} mobileVisible={attendanceView === attendance} selected={selectedIds} onSelect={id => setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} onToggle={id => updateTeam(current => current.roster.some(person => person.id === id) ? ({ ...current, session: [], roster: current.roster.map(person => person.id === id ? { ...person, present: !person.present } : person) }) : current)} onEdit={id => { if (state.roster.some(person => person.id === id)) setEditingId(id); }} onRemove={id => requestDeletion(new Set([id]))} />)}</div>
      <ParticipantsActions present={present.length} onContinue={() => router.push('/mood')} />
    </section>
    {editingPerson && <EditPersonDialog key={editingPerson.id} person={editingPerson} onSave={saveName} onClose={() => setEditingId(null)} />}
    <ConfirmDialog open={dialog === 'delete'} title={pendingDeletionIds.size === 1 ? 'Supprimer cette personne ?' : 'Supprimer les personnes sélectionnées ?'} description={`${deletionIds.size} personne(s) seront supprimées de l’équipe, avec leurs présences et humeurs. Cette action est irréversible.`} confirmLabel="Supprimer" danger onClose={closeDialog} onConfirm={() => remove(deletionIds)} />
    <ConfirmDialog open={dialog === 'fresh'} title="Commencer un nouveau bilan ?" description="Votre équipe est conservée. Tout le monde sera marqué présent et les humeurs seront effacées pour permettre à chacun de choisir à nouveau." confirmLabel="Recommencer" onClose={closeDialog} onConfirm={() => { updateTeam(current => ({ ...current, session: [], roster: current.roster.map(person => ({ ...person, present: true, mood: null, moodUpdatedAt: null, moodSlide: null })) })); notify('Nouveau bilan prêt. Confirmez les présences et choisissez les humeurs du jour.'); }} />
  </div>;
}