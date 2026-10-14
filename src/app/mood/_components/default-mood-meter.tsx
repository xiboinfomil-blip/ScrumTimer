const moods = [
  { number: 1, face: '😣', mood: 'Mauvaise humeur', energy: 'Énergie élevée', color: 'bg-orange-50 border-orange-200' },
  { number: 2, face: '😞', mood: 'Mauvaise humeur', energy: 'Énergie basse', color: 'bg-blue-50 border-blue-200' },
  { number: 3, face: '😌', mood: 'Bonne humeur', energy: 'Énergie basse', color: 'bg-teal-50 border-teal-200' },
  { number: 4, face: '😊', mood: 'Bonne humeur', energy: 'Énergie élevée', color: 'bg-green-50 border-green-200' },
];

export function DefaultMoodMeter() {
  return <div id="default-mood-meter" className="flex h-full min-h-0 w-full flex-col gap-2 p-2" aria-label="Baromètre par défaut : humeur et énergie">
    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-2">
      {moods.map(item => <article key={item.number} className={`flex min-h-0 flex-col justify-center rounded-xl border px-3 py-2 ${item.color}`}>
        <div className="flex items-center justify-between gap-2"><span className="text-xl font-bold text-brand">{item.number}</span><span className="text-2xl" aria-hidden="true">{item.face}</span></div>
        <h3 className="mt-1 text-xs font-semibold text-ink">{item.mood}</h3>
        <p className="text-[11px] text-muted">{item.energy}</p>
      </article>)}
    </div>
    <p className="shrink-0 text-center text-[10px] text-muted">Ces nombres sont des repères, pas des notes.</p>
  </div>;
}

export function MoodMeterLoading() {
  return <div role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-50 p-4 text-center text-xs text-muted">
    <span className="size-8 animate-spin rounded-full border-2 border-blue-100 border-t-brand" aria-hidden="true" />
    Chargement du baromètre…
  </div>;
}