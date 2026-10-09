import { lazy, Suspense } from 'react';

// Import tardio: no web o Skia só existe depois de LoadSkiaWeb (ver _layout).
const Experience = lazy(() => import('@/features/experience/Experience'));

export default function Index() {
  return (
    <Suspense fallback={null}>
      <Experience />
    </Suspense>
  );
}
