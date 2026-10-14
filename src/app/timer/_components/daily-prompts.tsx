import { card } from '@/components/ui/styles';

const prompts = [
  {
    number: '01 / HIER',
    title: 'Qu’avez-vous fait hier ?',
    description: 'Partagez vos avancées, vos petites réussites et ce que vous avez terminé.',
  },
  {
    number: '02 / EN CE MOMENT',
    title: 'Sur quoi travaillez-vous ?',
    description: 'Dites à l’équipe ce qui vous occupe et ce qui avance en ce moment.',
  },
  {
    number: '03 / AUJOURD’HUI',
    title: 'Que ferez-vous aujourd’hui ?',
    description: 'Présentez vos prochaines étapes, vos blocages et l’aide dont vous avez besoin.',
  },
];

export function DailyPrompts({ className = '' }: { className?: string }) {
  return (
    <section className={`daily-prompts ${card} flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-2xl p-3 ${className}`} aria-labelledby="prompts-title">
      <div className="shrink-0">
        <h2 id="prompts-title" className="flex h-11 items-center border-b border-line text-sm font-semibold">Pour guider le point</h2>
      </div>
      <div className="flex min-h-0 flex-col gap-5">
        {prompts.map(prompt => (
          <article className="min-w-0 border-l-2 border-accent/45 pl-3" key={prompt.number}>
            <span className="text-[9px] font-semibold tracking-wide text-brand">{prompt.number}</span>
            <h3 className="mt-1 text-sm font-semibold leading-snug">{prompt.title}</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted min-[801px]:max-[1100px]:hidden">{prompt.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}