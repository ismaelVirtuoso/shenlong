import { useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { DragonScene } from './core/DragonScene';
import type { QualityLevel } from './core/types';
import { loadDragonAsset } from './loadAsset';
import { DragonTimeline } from './timeline';
import { useStore } from '../experience/store';

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
 * Camada 3D (fundo): céu, nuvens e o Shenlong em three.js sobre expo-gl.
 * A camada Skia (esferas, pilar, relâmpagos) e a UI ficam por cima.
 */
export function DragonView() {
  const raf = useRef<number | null>(null);
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
    const renderer = new THREE.WebGLRenderer({ canvas: canvas as unknown as HTMLCanvasElement, context: gl as unknown as WebGL2RenderingContext, antialias: true });
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
    let frames = 0, slowSum = 0, degraded = false;
    let bw = w, bh = h;
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
      // o buffer pode mudar (rotação, layout tardio no web)
      const [cw, ch] = bufferSize();
      if (cw !== bw || ch !== bh) {
        bw = cw;
        bh = ch;
        scene.setSize(bw, bh);
      }
      const inp = timeline.sample(now);
      scene.update(inp);
      scene.render();
      gl.endFrameEXP();
      // rebaixamento automático: se o dragão presente roda abaixo de ~35 fps, desliga sombras
      if (!degraded && inp.appear > 0.95 && renderer.shadowMap.enabled) {
        frames++;
        slowSum += dt;
        if (frames === 90) {
          if (slowSum / frames > 28) {
            renderer.shadowMap.enabled = false;
            scene.scene.traverse((o) => {
              const m = (o as THREE.Mesh).material as THREE.Material | undefined;
              if (m) m.needsUpdate = true;
            });
            degraded = true;
            if (__DEV__) console.log('[dragon3d] FPS baixo: sombras desligadas');
          }
          frames = 0;
          slowSum = 0;
        }
      }
      raf.current = requestAnimationFrame(loop);
    };
    loop();
  };

  return <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={4} />;
}
