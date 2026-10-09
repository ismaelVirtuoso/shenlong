import { Suspense } from 'react';
import { DebugEntryScreen } from '@/features/experience/entries';

export default function Debug() {
  return (
    <Suspense fallback={null}>
      <DebugEntryScreen />
    </Suspense>
  );
}
