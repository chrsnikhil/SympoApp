import ShiftVerse from '@/components/shiftverse/ShiftVerse';
import dynamic from 'next/dynamic';

const PortalBackground = dynamic(() => import('@/components/shiftverse/PortalBackground'), {
  ssr: false,
});

export default function GamePage() {
  return (
    <>
      <PortalBackground />
      <ShiftVerse />
    </>
  );
}
