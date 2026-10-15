import { PageSkeleton } from '@/components/ui/page-skeleton';

const moods = [
  { number: 1, face: '😣', mood: 'Mauvaise humeur', energy: 'Énergie élevée', color: 'bg-orange-50 border-orange-200' },
  { number: 4, face: '😊', mood: 'Bonne humeur', energy: 'Énergie élevée', color: 'bg-green-50 border-green-200' },
  { number: 2, face: '😞', mood: 'Mauvaise humeur', energy: 'Énergie basse', color: 'bg-blue-50 border-blue-200' },
  { number: 3, face: '😌', mood: 'Bonne humeur', energy: 'Énergie basse', color: 'bg-teal-50 border-teal-200' },
];

export function DefaultMoodMeter() {
  return <div id="default-mood-meter" className="flex h-full min-h-0 w-full flex-col gap-2 overflow-y-auto p-2 [@media(max-height:650px)]:gap-1 [@media(max-height:650px)]:p-1.5" aria-label="Baromètre par défaut : humeur et énergie">
    <div className="grid min-h-44 flex-1 shrink-0 grid-cols-2 grid-rows-2 gap-2 [@media(max-height:650px)]:min-h-34 [@media(max-height:650px)]:gap-1">
      {moods.map(item => <article key={item.number} className={`flex min-h-0 flex-col justify-center rounded-xl border px-3 py-2 [@media(max-height:650px)]:px-2 [@media(max-height:650px)]:py-1 ${item.color}`}>
        <div className="flex items-center justify-between gap-2"><span className="grid size-8 place-items-center rounded-lg bg-white/80 text-base font-bold text-ink [@media(max-height:650px)]:size-6 [@media(max-height:650px)]:text-sm">{item.number}</span><span className="text-2xl [@media(max-height:650px)]:text-xl" aria-hidden="true">{item.face}</span></div>
        <h3 className="mt-1 text-xs font-semibold text-ink [@media(max-height:650px)]:mt-0.5 [@media(max-height:650px)]:text-[10px]">{item.mood}</h3>
        <p className="text-[11px] text-muted [@media(max-height:650px)]:text-[10px]">{item.energy}</p>
      </article>)}
    </div>
    <p className="shrink-0 text-center text-[10px] text-muted">Ces nombres sont des repères, pas des notes.</p>
  </div>;
}

export function MoodMeterLoading() {
  return <div className="absolute inset-0 z-10 flex min-h-0 flex-col bg-slate-50 p-2">
    <PageSkeleton variant="mood" scope="section" className="flex-1" />
  </div>;
}