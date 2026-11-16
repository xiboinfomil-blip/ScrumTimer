import { notFound } from 'next/navigation';

// Reject unmatched URLs before the parallel modal slot can stream a 200 response.
export const dynamicParams = false;

export function generateStaticParams() {
  return [];
}

export default function UnknownPage() {
  notFound();
}
