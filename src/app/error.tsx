'use client';
import { Button } from '@/components/ui/button';
import { StateScreen } from '@infomil/scrum-shared/ui';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <StateScreen title="Une erreur est survenue."><p>Les données déjà enregistrées dans Neon sont conservées.</p><Button onClick={reset} variant="default">Réessayer</Button></StateScreen>;
}