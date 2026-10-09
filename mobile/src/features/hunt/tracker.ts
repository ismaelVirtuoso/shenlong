import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer, DeviceMotion } from 'expo-sensors';
import { makeMutable } from 'react-native-reanimated';
import { angleDiff, bearing, nearestUncollected, orientationFromEuler, toLocal } from './geo';
import { saveHunt, useHunt } from './store';

/** Inclinação da câmera (graus; 0 = horizonte, negativo = olhando para baixo) e rumo, a 60 fps na UI. */
export const camPitch = makeMutable(0);
export const camHeading = makeMutable(0);

const STEP_LEN = 0.62; // m
const STEP_MIN_MS = 300;
const DEG = 180 / Math.PI;

/**
 * Posição dentro de casa: o GPS do celular erra de 5 a 15 m em ambiente fechado — mais que a
 * área da caçada (≈ 11 m de diâmetro). Por isso a posição é estimada por PASSOS (acelerômetro)
 * na direção do aparelho; o GPS ancora a caçada no lugar e só corrige derivas grandes.
 * Sem giroscópio/bússola (tablets de entrada), entra o modo GUIADO: cada passo aproxima a
 * esfera mais próxima e o radar aponta para ela.
 */
class Tracker {
  private subs: { remove: () => void }[] = [];
  private running = false;
  private heading = 0;
  private motionHeading: number | null = null;
  /** bússola do sistema − rumo do giroscópio (corrige referência/norte verdadeiro), suavizado */
  private compassOffset: number | null = null;
  private lastTop: { heading: number; flat: number } | null = null;
  /** giro simulado (dev): somado ao rumo */
  private simTurn = 0;
  /** posição estimada no instante em que a origem GPS foi fixada (passos dados antes do 1º GPS) */
  private offset = { x: 0, y: 0 };
  private grav = { x: 0, y: 0, z: 1 };
  private base = 1;
  private above = false;
  private lastStep = 0;
  lastFix: { lat: number; lng: number } | null = null;

  async start() {
    if (this.running) return;
    this.running = true;
    let gps = false;
    try {
      gps = (await Location.requestForegroundPermissionsAsync()).granted;
    } catch {}
    let motion = false;
    try {
      motion = (await DeviceMotion.isAvailableAsync()) && (await DeviceMotion.requestPermissionsAsync()).granted;
    } catch {}
    if (!this.running) return;
    useHunt.getState().set({ guided: !motion, gps });

    // passos + inclinação (qualquer aparelho tem acelerômetro)
    try {
      Accelerometer.setUpdateInterval(40);
      this.subs.push(Accelerometer.addListener((a) => this.onAccel(a)));
    } catch {}
    if (motion) {
      DeviceMotion.setUpdateInterval(40);
      this.subs.push(DeviceMotion.addListener((m) => m.rotation && this.onRotation(m.rotation)));
    }
    if (gps) {
      if (motion) {
        try {
          this.subs.push(await Location.watchHeadingAsync((h) => this.onCompass(h.trueHeading >= 0 ? h.trueHeading : h.magHeading)));
        } catch {}
      }
      try {
        this.subs.push(
          await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
            (p) => this.onGps(p),
          ),
        );
      } catch {}
    }
  }

  stop() {
    if (this.running) void saveHunt();
    this.running = false;
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }

  /** Nova caçada: a origem passa a ser onde a pessoa está agora. */
  resetOrigin() {
    this.offset = { x: 0, y: 0 };
  }

  private publishHeading(v: number) {
    v = (((v + this.simTurn) % 360) + 360) % 360;
    this.heading = v;
    camHeading.value = v;
    const st = useHunt.getState();
    if (Math.abs(angleDiff(st.heading, v)) > 1.5) st.set({ heading: v });
  }

  private onRotation(r: { alpha: number; beta: number; gamma: number }) {
    const o = orientationFromEuler(r.alpha, r.beta, r.gamma, Platform.OS === 'ios');
    this.motionHeading = o.heading;
    this.lastTop = { heading: o.topHeading, flat: o.topFlat };
    camPitch.value = o.pitch;
    this.publishHeading(o.heading + (this.compassOffset ?? 0));
  }

  private onCompass(v: number) {
    // a bússola do sistema mede o rumo do TOPO do aparelho e é instável com ele em pé:
    // só calibra o deslocamento quando o aparelho está mais deitado
    if (v < 0 || !this.lastTop || this.lastTop.flat < 0.35) return;
    const d = angleDiff(v, this.lastTop.heading);
    this.compassOffset = this.compassOffset == null ? d : this.compassOffset + angleDiff(d, this.compassOffset) * 0.05;
  }

  private onAccel(a: { x: number; y: number; z: number }) {
    // gravidade (passa-baixa); iOS mede o sentido oposto ao Android
    const s = Platform.OS === 'ios' ? -1 : 1;
    const k = 0.12;
    this.grav = { x: this.grav.x + (s * a.x - this.grav.x) * k, y: this.grav.y + (s * a.y - this.grav.y) * k, z: this.grav.z + (s * a.z - this.grav.z) * k };
    if (this.motionHeading == null) {
      const n = Math.hypot(this.grav.x, this.grav.y, this.grav.z) || 1;
      camPitch.value = Math.asin(Math.max(-1, Math.min(1, -this.grav.z / n))) * DEG;
    }
    // passo = pico da aceleração total acima da média (em g), com intervalo mínimo
    const mag = Math.hypot(a.x, a.y, a.z);
    this.base += (mag - this.base) * 0.02;
    const dev = mag - this.base;
    const now = Date.now();
    if (!this.above && dev > 0.13 && now - this.lastStep > STEP_MIN_MS) {
      this.above = true;
      this.lastStep = now;
      this.step(STEP_LEN);
    } else if (this.above && dev < 0.03) {
      this.above = false;
    }
  }

  private onGps(p: Location.LocationObject) {
    const st = useHunt.getState();
    const acc = p.coords.accuracy ?? 99;
    const here = { lat: p.coords.latitude, lng: p.coords.longitude };
    this.lastFix = here;
    if (!st.origin) {
      // primeira leitura: vira a origem da caçada, compensando passos já dados
      this.offset = { x: st.x, y: st.y };
      st.set({ origin: here, accuracy: acc });
      return;
    }
    const l = toLocal(st.origin, here);
    const g = { x: l.x + this.offset.x, y: l.y + this.offset.y };
    // só corrige quando o GPS discorda muito além do próprio erro (deriva dos passos ao ar livre);
    // dentro de casa ele oscila mais que a área inteira e só atrapalharia
    const off = Math.hypot(g.x - st.x, g.y - st.y);
    const k = acc <= 8 && off > Math.max(4, 2 * acc) ? 0.1 : 0;
    st.set({ x: st.x + (g.x - st.x) * k, y: st.y + (g.y - st.y) * k, accuracy: acc });
  }

  /** Um passo à frente (também usado pelo controle de simulação em dev). */
  step(len: number) {
    const st = useHunt.getState();
    let h = this.heading;
    if (st.guided) {
      // sem bússola: o radar guia — o passo vai na direção da esfera mais próxima
      const n = nearestUncollected(st.balls, st.x, st.y);
      if (n) {
        h = bearing(st.x, st.y, n.ball.x, n.ball.y);
        this.publishHeading(h - this.simTurn);
        len = Math.min(len, Math.max(0, n.d - 1.4)); // para a ~1,4 m: a esfera fica ~40° abaixo do horizonte
      }
    }
    const r = (h * Math.PI) / 180;
    st.set({ x: st.x + Math.sin(r) * len, y: st.y + Math.cos(r) * len, steps: st.steps + 1 });
    if ((st.steps + 1) % 5 === 0) void saveHunt(); // reabrindo o app, continua de onde parou
  }

  /** Modo guiado (sem bússola): passa a "olhar" para um rumo (a esfera que a câmera procura). */
  face(deg: number) {
    if (useHunt.getState().guided) this.publishHeading(deg - this.simTurn);
  }

  /** Simulação (dev/emulador): gira o "corpo". */
  turn(deg: number) {
    const target = this.heading + deg;
    this.simTurn = (this.simTurn + deg) % 360;
    this.publishHeading(target - this.simTurn); // publishHeading soma o giro simulado de volta
  }
}

export const tracker = new Tracker();
