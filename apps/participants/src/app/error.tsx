'use client';
import { button, StateScreen } from '@/components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <StateScreen title="Cet espace est indisponible"><p>Impossible d’afficher la page. Aucun détail technique n’est exposé.</p><button className={button} onClick={reset}>Réessayer</button></StateScreen>;
}