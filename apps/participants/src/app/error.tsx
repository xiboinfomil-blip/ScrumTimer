'use client';
import { Button } from '@infomil/scrum-shared/ui/button';

import { button, StateScreen } from '@/components/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <StateScreen title="Cet espace est indisponible"><p>Impossible d’afficher la page. Aucun détail technique n’est exposé.</p><Button className={button} onClick={reset} variant="ghost" type="button">Réessayer</Button></StateScreen>;
}