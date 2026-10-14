import type { Metadata } from 'next';
import { StatisticsPage } from './_components/statistics-page';

export const metadata: Metadata = {
  title: { absolute: 'Statistiques — Infomil Mauritius' },
};

export default function Page() {
  return <StatisticsPage />;
}