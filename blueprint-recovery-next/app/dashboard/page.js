'use client';
import dynamic from 'next/dynamic';

const CoordinatorDashboard = dynamic(
  () => import('@/components/pages/CoordinatorDashboard'),
  { ssr: false }
);

export default function DashboardPage() {
  return <CoordinatorDashboard />;
}
