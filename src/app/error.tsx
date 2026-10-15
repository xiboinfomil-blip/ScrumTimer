'use client';
import { Button } from '@mui/material';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="grid flex-1 place-content-center gap-4 text-center"><h1 className="text-2xl font-bold">Une erreur est survenue.</h1><p>Les données déjà enregistrées dans Neon sont conservées.</p><Button variant="contained" onClick={reset}>Réessayer</Button></section>;
}