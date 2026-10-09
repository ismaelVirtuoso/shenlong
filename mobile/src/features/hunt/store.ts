import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { scatter, type BallSpot, type LatLng } from './geo';

const KEY = 'shenlong.hunt.v1';

export interface HuntState {
  loaded: boolean;
  /** GPS no momento em que as esferas foram espalhadas (null = sem GPS: só passos + bússola) */
  origin: LatLng | null;
  balls: BallSpot[];
  /** posição estimada (m, relativa à origem) */
  x: number;
  y: number;
  /** rumo do aparelho (graus, 0 = norte) */
  heading: number;
  /** precisão do último GPS (m), null = sem GPS */
  accuracy: number | null;
  steps: number;
  /** sem giroscópio/bússola: o radar guia até a esfera mais próxima */
  guided: boolean;
  /** permissão de localização concedida */
  gps: boolean;
  /** quando as esferas foram espalhadas (mostra o aviso na tela do radar) */
  scatteredAt: number;
  set: (p: Partial<Omit<HuntState, 'set'>>) => void;
}

export const useHunt = create<HuntState>((set) => ({
  loaded: false,
  origin: null,
  balls: [],
  x: 0,
  y: 0,
  heading: 0,
  accuracy: null,
  steps: 0,
  guided: false,
  gps: false,
  scatteredAt: 0,
  set: (p) => set(p),
}));

export const collectedCount = (balls: BallSpot[]) => balls.filter((b) => b.collected).length;

/** Carrega a caçada salva (ou cria uma nova). */
export async function loadHunt() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as { origin: LatLng | null; balls: BallSpot[]; x?: number; y?: number };
      if (Array.isArray(s.balls) && s.balls.length === 7) {
        useHunt.getState().set({ origin: s.origin, balls: s.balls, x: s.x ?? 0, y: s.y ?? 0, loaded: true });
        return;
      }
    }
  } catch {}
  newHunt(null);
}

/** Espalha as 7 esferas de novo ao redor de onde a pessoa está agora. */
export function newHunt(origin: LatLng | null) {
  useHunt.getState().set({ origin, balls: scatter(), x: 0, y: 0, loaded: true });
  void saveHunt();
}

export async function saveHunt() {
  const { origin, balls, x, y } = useHunt.getState();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ origin, balls, x, y }));
  } catch {}
}

export function collect(stars: number) {
  const balls = useHunt.getState().balls.map((b) => (b.stars === stars ? { ...b, collected: true } : b));
  useHunt.getState().set({ balls });
  void saveHunt();
  return collectedCount(balls);
}
