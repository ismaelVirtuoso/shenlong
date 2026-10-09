import { Suspense } from 'react';
import { ExperienceScreen } from '@/features/experience/entries';

export default function Index() {
  return (
    <Suspense fallback={null}>
      <ExperienceScreen />
    </Suspense>
  );
}
