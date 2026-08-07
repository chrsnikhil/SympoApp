'use client';
import { useEffect } from 'react';
import dynamic from 'next/dynamic';

const App = dynamic(() => import('@/components/App'), { ssr: false });

export default function Page() {
  useEffect(() => {
    if (typeof window !== 'undefined' && (window.location.hash === '#dashboard' || window.location.hash === '#/dashboard')) {
      window.location.href = '/dashboard';
    }
  }, []);

  return <App />;
}
