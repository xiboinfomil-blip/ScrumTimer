'use client';

import type { Person } from '@/types/team';
import { Checkbox } from '@mui/material';
import { IconButton, Paper } from '@mui/material';
import { PaginatedList } from '@/components/ui/paginated-list';
import { presentBadge, absentBadge } from '@/components/ui/styles';
import { ParticipantIcon } from './participant-icon';

export function AttendanceList({ people, present, selected, onSelect, onToggle, onRemove, onEdit, mobileVisible }: { people: Person[]; present: boolean; selected: Set<string>; onSelect: (id: string) => void; onToggle: (id: string) => void; onRemove: (id: string) => void; onEdit: (id: string) => void; mobileVisible: boolean }) {
  return <Paper component="section" elevation={0} sx={{ background: 'transparent' }} id={present ? 'attendance-present' : 'attendance-absent'} className={`attendance-section${present ? '' : ' absent-section'} flex min-h-0 min-w-0 flex-col ${mobileVisible ? '' : 'max-[650px]:hidden'} [&>.checkin-list]:mt-1 [&>.checkin-list]:gap-1 [&>.list-pagination]:h-11 [&>.list-pagination>button]:size-11 [&>.list-pagination>button]:bg-slate-50 [&>.list-pagination>button]:rounded-lg [&>.list-pagination]:gap-2`} aria-label={present ? 'Présents' : 'Absents'}>
    <h3 className="flex h-9 shrink-0 items-center gap-2 text-xs font-semibold max-[650px]:sr-only"><span className={present ? presentBadge : absentBadge}>{present ? '✓ Présents' : '− Absents'} · {people.length}</span></h3>
    {people.length > 0 ? <PaginatedList items={people} renderItem={person => <li key={person.id} className={`checkin-person flex h-12 shrink-0 items-center gap-1 rounded-lg border-b border-l-2 px-1 motion-safe:animate-enter ${present ? 'border-l-success' : 'border-l-danger'} ${selected.has(person.id) ? 'selected border-b-brand/20 bg-blue-50' : present ? 'border-b-line/70 hover:bg-success-soft' : 'border-b-red-100 bg-danger-soft/35 hover:bg-danger-soft'}`}>
      <Checkbox size="small" sx={{ width: 32, height: 44, p: .5, flexShrink: 0 }} slotProps={{ input: { className: 'person-checkbox', 'aria-label': `Sélectionner ${person.name}` } }} checked={selected.has(person.id)} onChange={() => onSelect(person.id)} />
      <strong className="min-w-0 flex-1 truncate text-sm font-medium text-ink" title={person.name}>{person.name}</strong>
      <div className="ml-auto flex shrink-0 items-center">
        <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" className="edit-person grid size-11 shrink-0 place-items-center rounded-lg text-brand hover:bg-blue-50" aria-label={`Modifier le nom de ${person.name}`} title="Modifier le nom" onClick={() => onEdit(person.id)}><ParticipantIcon name="edit" /></IconButton>
        <IconButton size="small" sx={{ minWidth: 44, height: 44, fontSize: 11, borderRadius: 2 }} type="button" className={`attendance-button inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[11px] font-medium ${present ? 'text-danger hover:bg-danger-soft' : 'text-success hover:bg-success-soft'}`} aria-label={`Déplacer ${person.name} vers les ${present ? 'absents' : 'présents'}`} title={`Déplacer vers les ${present ? 'absents' : 'présents'}`} onClick={() => onToggle(person.id)}><span className="max-[800px]:hidden">{present ? 'Absent' : 'Présent'}</span><ParticipantIcon name={present ? 'away' : 'check'} /></IconButton>
        <IconButton size="small" sx={{ width: 44, height: 44 }} type="button" className="remove-person grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-red-50 hover:text-danger motion-reduce:transition-none" aria-label={`Retirer ${person.name} de l’équipe`} title="Retirer de l’équipe" onClick={() => onRemove(person.id)}><ParticipantIcon name="trash" /></IconButton>
      </div>
    </li>} /> : <p className="attendance-empty flex min-h-0 flex-1 items-center justify-center px-3 text-center text-xs text-muted">{present ? 'Ajoutez une personne pour commencer.' : 'Aucune personne absente.'}</p>}
  </Paper>;
}