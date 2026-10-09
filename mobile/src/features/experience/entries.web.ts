import { lazy } from 'react';

// Web (só depuração): o Skia web precisa do CanvasKit carregado antes de avaliar os módulos da cena.
export const ExperienceScreen = lazy(() => import('./Experience'));
export const DebugEntryScreen = lazy(() => import('./DebugScreen'));
