import { useEffect, useState } from 'react';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

/** Web (só para depurar o visual): carrega o CanvasKit antes de renderizar. */
export function useSkiaReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    LoadSkiaWeb({ locateFile: (f: string) => `/${f}` }).then(() => setReady(true));
  }, []);
  return ready;
}
