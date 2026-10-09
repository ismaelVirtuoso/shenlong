import { lazy, Suspense } from 'react';

// Import tardio: no web o Skia só existe depois de LoadSkiaWeb (ver _layout).
const DebugScreen = lazy(() => import('@/features/experience/DebugScreen'));

export default function Index() {
  return (
    <Suspense fallback={null}>
      <DebugScreen />
    </Suspense>
  );
}
