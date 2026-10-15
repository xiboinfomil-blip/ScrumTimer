'use client';
import Link from 'next/link';
import { Button } from '@mui/material';

export default function NotFound() { return <section className="grid flex-1 place-content-center gap-4 text-center"><h1 className="text-2xl font-bold">Page introuvable</h1><Button component={Link} variant="outlined" href="/participants">Retour aux participants</Button></section>; }