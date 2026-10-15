import Link from 'next/link';
import { Button, IconButton, Paper } from '@mui/material';
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PaginatedList } from '@/components/ui/paginated-list';
import { card, countPill, textButton } from '@/components/ui/styles';
import type { StandupTimer } from './timer-page';
import { PostponedPeople } from './postponed-people';

export function TeamLineup({ timer, className = '' }: { timer: StandupTimer; className?: string }) {
  const [shuffleCount, setShuffleCount] = useState(0);
  const [shuffling, setShuffling] = useState(false);
  const reduced = useReducedMotion();
  const { people, activeId, turnStarted } = timer;
  const done = people.filter(person => person.done).length;
  const left = people.length - done;
  const candidates = people.filter(person => !person.done && !person.postponed && (!turnStarted || person.id !== activeId));
  const shuffleTitle = candidates.length < 2
    ? 'Au moins deux personnes disponibles sont nécessaires pour mélanger'
    : turnStarted
      ? 'Mélanger les prochains passages sans interrompre la personne qui parle'
      : 'Mélanger les personnes qui n’ont pas encore parlé, y compris le prochain intervenant';

  return (
    <Paper component="aside" elevation={0} sx={{ borderRadius: 3 }} className={`team-panel ${card} flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl p-3 [&_.person-list]:gap-1 ${className}`} aria-labelledby="team-title">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="team-title" className="flex items-center gap-2 text-sm font-semibold">Équipe <span className={countPill} id="team-count">{people.length}</span></h2>
        </div>
        <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 11 }} type="button" className={`${textButton} min-h-11`} id="shuffle-button" title={shuffleTitle} aria-busy={shuffling} disabled={candidates.length < 2 || shuffling} onClick={() => { timer.shuffleWaiting(); setShuffleCount(value => value + 1); setShuffling(!reduced); }}><motion.span className="inline-block" key={shuffleCount} aria-hidden="true" initial={{ rotate: 0, scale: 1 }} animate={shuffleCount && !reduced ? { rotate: [0, -25, 380, 360], scale: [1, 1.2, 1] } : { rotate: 0, scale: 1 }} transition={{ duration: .7, ease: [.22, 1, .36, 1] }} onAnimationComplete={() => setShuffling(false)}>↝</motion.span> {shuffling ? 'Mélange…' : 'Mélanger'}</Button>
      </div>
      <Button component={Link} href="/mood" disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontSize: 11 }} className="flex min-h-11 shrink-0 items-center text-[11px] text-muted hover:text-brand">← Humeurs</Button>
      <div className="flex shrink-0 justify-between gap-2 border-t border-line pt-2 text-[10px] text-muted">
        <span>Passages</span>
        <span id="done-count">{done} / {people.length} {done === 1 ? 'passage terminé' : 'passages terminés'}</span>
      </div>
      <div id="person-list" className="contents">
        <PaginatedList
          items={people.filter(person => !person.postponed)}
          className="person-list"
          ordered
          activeId={activeId}
          renderItem={(person, index) => {
            const active = person.id === activeId;
            return (
              <li key={person.id} className={`person-row flex h-12 min-w-0 shrink-0 items-center gap-2 rounded-lg border-b px-1 transition-colors motion-safe:animate-enter ${active ? timer.ended ? 'active border-red-200 bg-danger-soft' : 'active border-blue-200 bg-blue-50' : person.done ? 'border-green-100 bg-success-soft/50' : 'border-line/70 hover:bg-slate-50'} ${person.done ? 'done' : ''}`} data-person-id={person.id}>
                <span className="shrink-0 text-[10px] text-muted" aria-hidden="true">{person.done ? '✓' : String(index + 1).padStart(2, '0')}</span>
                <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, p: 0, justifyContent: 'flex-start', textTransform: 'none', color: 'inherit' }} type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 bg-transparent text-left" aria-label={`Donner la parole à ${person.name}${person.done ? ' (a déjà parlé)' : ''}`} aria-pressed={active} onClick={() => timer.select(person.id)}>
                  <span className="grid min-w-0 gap-1">
                    <span className="person-name truncate text-xs font-bold" title={person.name}>{person.name}</span>
                    <span className={`text-[9px] leading-snug ${active && timer.ended ? 'text-danger' : person.done ? 'text-success' : active ? 'text-brand' : 'text-muted'}`}>{active ? timer.ended ? 'Temps écoulé · conclure' : timer.running ? 'Parle maintenant' : 'Prêt à parler' : person.done ? '✓ Passage terminé' : 'À venir'} · Humeur {person.mood}</span>
                  </span>
                </Button>
                {!person.done && <IconButton size="small" sx={{ width: 44, height: 44, borderRadius: 2 }} type="button" className="grid size-11 shrink-0 place-items-center rounded-lg text-brand hover:bg-blue-50" aria-label={`Reporter le passage de ${person.name}`} onClick={() => timer.postpone(person.id)}>↷</IconButton>}
              </li>
            );
          }}
        />
      </div>
      <PostponedPeople timer={timer} />
      <div className="py-4 text-center text-xs text-muted" id="empty-team" hidden={people.length > 0}>
        <span className="block text-2xl text-accent" aria-hidden="true">↗</span>
        <strong className="mt-2 block text-ink">On commence le point quotidien ?</strong>
        <p className="mt-2 leading-relaxed">Complétez le bilan d’humeur.<br />Chaque personne présente aura la parole.</p>
      </div>
      <div className="shrink-0 border-t border-line pt-2.5">
        <div className="h-1 overflow-hidden rounded-full bg-blue-50" role="progressbar" aria-label="Passages terminés" aria-valuemin={0} aria-valuemax={Math.max(1, people.length)} aria-valuenow={done} aria-valuetext={`${done} sur ${people.length}`}>
          <span id="team-progress-fill" className="block h-full rounded-full bg-success transition-[width] motion-reduce:transition-none" style={{ width: `${people.length ? done / people.length * 100 : 0}%` }} />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-muted">
          <span id="team-progress-label">{done === people.length && people.length > 0 ? 'Tout le monde a eu la parole ✨' : done ? `${left} ${left === 1 ? 'passage restant' : 'passages restants'}` : 'À vous de commencer'}</span>
          <Button disableElevation size="small" variant="text" sx={{ minHeight: 44, minWidth: 0, textTransform: 'none', fontSize: 11 }} type="button" id="new-round-button" className={`${textButton} min-h-11`} disabled={!people.length} onClick={timer.newRound}>Nouveau tour</Button>
        </div>
      </div>
    </Paper>
  );
}