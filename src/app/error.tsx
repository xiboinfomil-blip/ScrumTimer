'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="grid flex-1 place-content-center gap-4 text-center"><h1 className="text-2xl font-bold">Une erreur est survenue.</h1><p>Votre équipe enregistrée sur cet appareil est conservée.</p><button className="rounded-xl bg-brand px-4 py-3 text-white" onClick={reset}>Réessayer</button></section>;
}