import Link from 'next/link';

export default function NotFound() { return <section className="grid flex-1 place-content-center gap-4 text-center"><h1 className="text-2xl font-bold">Page introuvable</h1><Link className="text-brand underline" href="/participants">Retour aux participants</Link></section>; }