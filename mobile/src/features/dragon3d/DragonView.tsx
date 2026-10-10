import { useEffect, useRef } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { DragonScene } from './core/DragonScene';
import type { QualityLevel } from './core/types';
import { loadDragonAsset } from './loadAsset';
import { DragonTimeline } from './timeline';
import { useStore } from '../experience/store';
import { tailAnchor } from '../scene/anchor';

/** Log de desempenho: em dev, ou com EXPO_PUBLIC_PROFILE=1 (útil com --no-dev para medir o real). */
const PROFILE = process.env.EXPO_PUBLIC_PROFILE === '1';

/** Qualidade inicial por plataforma; o loop rebaixa (desliga sombras) se o FPS cair. */
const initialQuality = (): QualityLevel => {
  const q = useStore.getState().quality;
  if (q === 'low') return 'low';
  if (Platform.OS === 'ios') return q;
  return 'medium';
};

/** expo-gl não implementa alguns parâmetros de pixelStorei usados pelo three: ignora-os. */
function patchGl(gl: ExpoWebGLRenderingContext) {
  const pixelStorei = gl.pixelStorei.bind(gl);
  gl.pixelStorei = (pname: number, param: number | boolean) => {
    if (pname === gl.UNPACK_FLIP_Y_WEBGL || pname === gl.UNPACK_ALIGNMENT || pname === gl.PACK_ALIGNMENT) pixelStorei(pname, param as number);
  };
}

/**
 * O expo-gl (SDK 57) faz WebGL2RenderingContext herdar de WebGLRenderingContext (como na especificação),
 * mas o three.js ≥ r163 rejeita qualquer `instanceof WebGLRenderingContext` como "WebGL 1".
 * O contexto é WebGL2 de verdade (`supportsWebGL2`), então escondemos a classe só durante a construção.
 */
function createRenderer(gl: ExpoWebGLRenderingContext, canvas: unknown) {
  const g = globalThis as { WebGLRenderingContext?: unknown };
  const native = Platform.OS !== 'web';
  if (native && (gl as unknown as { supportsWebGL2?: boolean }).supportsWebGL2 === false) throw new Error('GLES 3 indisponível');
  const saved = g.WebGLRenderingContext;
  if (native) g.WebGLRenderingContext = undefined;
  try {
    return new THREE.WebGLRenderer({ canvas: canvas as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, antialias: true });
  } finally {
    if (native) g.WebGLRenderingContext = saved;
  }
}

/**
 * Camada 3D (fundo): céu, nuvens e o Shenlong em three.js sobre expo-gl.
 * A camada Skia (esferas, pilar, relâmpagos) e a UI ficam por cima.
 */
/** fração da resolução nativa em que o GL desenha (o resultado é ampliado p/ a tela inteira) */
const RENDER_SCALE: Record<QualityLevel, number> = { high: 1, medium: 0.8, low: 0.65 };

export function DragonView() {
  const raf = useRef<number | null>(null);
  const { width: W, height: H } = useWindowDimensions();
  const scale = Platform.OS === 'web' ? 1 : RENDER_SCALE[initialQuality()];
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, []);

  const onContextCreate = async (gl: ExpoWebGLRenderingContext) => {
    // web: o GLView usa um <canvas> real que não se redimensiona sozinho (fica 300×150)
    const webCanvas = Platform.OS === 'web' ? ((gl as unknown as { canvas: HTMLCanvasElement }).canvas ?? null) : null;
    const bufferSize = (): [number, number] =>
      webCanvas
        ? [Math.round(webCanvas.clientWidth * (window.devicePixelRatio || 1)), Math.round(webCanvas.clientHeight * (window.devicePixelRatio || 1))]
        : [gl.drawingBufferWidth, gl.drawingBufferHeight];
    const [w, h] = bufferSize();
    if (!webCanvas) patchGl(gl);
    const canvas = webCanvas ?? {
      width: w, height: h, style: {}, clientWidth: w, clientHeight: h,
      addEventListener: () => {}, removeEventListener: () => {}, getContext: () => gl,
    };
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createRenderer(gl, canvas);
    } catch (e) {
      console.warn('[dragon3d] WebGL2 indisponível neste aparelho', e);
      return;
    }
    renderer.setPixelRatio(1);

    let scene: DragonScene;
    try {
      scene = new DragonScene(renderer, await loadDragonAsset(), initialQuality(), w, h);
    } catch (e) {
      console.warn('[dragon3d] falha ao montar a cena 3D', e);
      return;
    }
    const timeline = new DragonTimeline();
    if (__DEV__) console.log('[dragon3d] buffer', w, h);
    let frames = 0, slowSum = 0, frameCost = 0;
    let bw = w, bh = h;
    let skip = 0;
    let statN = 0, statSum = 0;
    let pUpdate = 0, pRender = 0, pEnd = 0, workSum = 0;
    let last = performance.now();

    const loop = () => {
      if (!alive.current) {
        timeline.dispose();
        renderer.dispose();
        return;
      }
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (PROFILE) {
        statN++;
        statSum += dt;
        if (statSum > 5000) {
          const f = (v: number) => (v / statN).toFixed(0);
          console.log(`[dragon3d] ${(1000 / (statSum / statN)).toFixed(1)} fps · update ${f(pUpdate)} ms · render ${f(pRender)} ms · endFrame ${f(pEnd)} ms · calls ${renderer.info.render.calls} · tri ${renderer.info.render.triangles}`);
          pUpdate = pRender = pEnd = 0;
          statN = 0;
          statSum = 0;
        }
      }
      // o buffer pode mudar (rotação, layout tardio no web)
      const [cw, ch] = bufferSize();
      if (cw !== bw || ch !== bh) {
        bw = cw;
        bh = ch;
        scene.setSize(bw, bh);
      }
      // caçada: o app é o radar; o 3D fica parado (poupa bateria)
      if (useStore.getState().m.phase === 'hunt') {
        raf.current = requestAnimationFrame(loop);
        return;
      }
      const inp = timeline.sample(now);
      // sem dragão nem invocação (boot/altar): só céu e nuvens lentas → ~20 fps bastam
      skip = (skip + 1) % 3;
      if (inp.appear < 0.001 && inp.summon < 0.001 && inp.flash < 0.01 && skip !== 0) {
        raf.current = requestAnimationFrame(loop);
        return;
      }
      const t0 = performance.now();
      scene.update(inp);
      const a = tailAnchor.value;
      if (Math.abs(a.x - scene.anchor.x) + Math.abs(a.y - scene.anchor.y) > 0.0008) tailAnchor.value = { x: scene.anchor.x, y: scene.anchor.y };
      const t1 = performance.now();
      scene.render();
      const t2 = performance.now();
      gl.endFrameEXP();
      const t3 = performance.now();
      workSum += t3 - t0;
      if (PROFILE) {
        pUpdate += t1 - t0;
        pRender += t2 - t1;
        pEnd += t3 - t2;
      }
      // custo médio do quadro (~2 s): em aparelho lento, cede tempo ao resto do app (abaixo)
      frames++;
      slowSum += dt;
      if (frames >= 60 || slowSum > 2000) {
        frameCost = workSum / frames;
        workSum = 0;
        frames = 0;
        slowSum = 0;
      }
      const work = t3 - t0;
      if (frameCost > 50 && work > 50) {
        // aparelho lento: metade do tempo para o resto do app (rede, voz, timers)
        raf.current = null;
        setTimeout(() => {
          if (alive.current) raf.current = requestAnimationFrame(loop);
          else loop();
        }, Math.min(400, work));
      } else {
        raf.current = requestAnimationFrame(loop);
      }
    };
    loop();
  };

  if (scale === 1) return <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={4} />;
  const w = Math.round(W * scale), h = Math.round(H * scale);
  return (
    <GLView
      style={{ position: 'absolute', width: w, height: h, left: (W - w) / 2, top: (H - h) / 2, transform: [{ scale: 1 / scale }] }}
      onContextCreate={onContextCreate}
      msaaSamples={4}
    />
  );
}
