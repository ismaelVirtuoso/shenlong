import * as THREE from 'three';
import { Atmosphere } from './atmosphere';
import { Dragon, HEAD_FINAL } from './dragon';
import type { DragonAsset } from './glb';
import { createMaterials, shared } from './materials';
import type { DragonInput, QualityLevel } from './types';

export const CAMERA_POS = new THREE.Vector3(0, 1.6, 15.5);
const CAMERA_TARGET = new THREE.Vector3(0, 1.3, 0);

/**
 * Cena 3D do Shenlong (three.js puro, sem React): roda no app (expo-gl) e no viewer de testes (WebGL).
 */
export class DragonScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private dragon: Dragon;
  private atmo: Atmosphere;
  private shake = new THREE.Vector3();
  /** câmera de inspeção (viewer): yaw/pitch em graus ao redor da cabeça */
  debugOrbit: { yaw: number; pitch: number; dist: number } | null = null;

  constructor(private renderer: THREE.WebGLRenderer, asset: DragonAsset, readonly quality: QualityLevel, width: number, height: number) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = quality === 'high'; // sombras só no perfil alto (iPhone); AO assado cobre os demais
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor('#04050c', 1);

    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 200);
    this.camera.position.copy(CAMERA_POS);
    this.camera.lookAt(CAMERA_TARGET);
    this.setSize(width, height);

    this.atmo = new Atmosphere(quality);
    this.scene.fog = this.atmo.fog;
    this.scene.add(this.atmo.group);
    this.dragon = new Dragon(asset, createMaterials(), quality, CAMERA_POS);
    this.scene.add(this.dragon.root);
  }

  setSize(width: number, height: number) {
    this.camera.aspect = width / height;
    // telas estreitas (celular em pé): abre o FOV vertical p/ caber a largura do dragão
    this.camera.fov = this.camera.aspect < 0.6 ? 40 : 34;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  update(inp: DragonInput) {
    shared.uTime.value = inp.t / 1000;
    shared.uRim.value = 0.25 + 0.55 * inp.appear + 0.6 * inp.wish + 0.8 * inp.flash;
    shared.uSwayAmp.value = 0.04 + 0.06 * inp.wish + 0.02 * inp.speak;

    // câmera: leve deriva + tremor (invocação/trovão)
    const t = inp.t / 1000;
    if (this.debugOrbit) {
      const { yaw, pitch, dist } = this.debugOrbit;
      const y = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
      const c = HEAD_FINAL.clone();
      this.camera.position.set(c.x + Math.sin(y) * Math.cos(p) * dist, c.y + Math.sin(p) * dist, c.z + Math.cos(y) * Math.cos(p) * dist);
      this.camera.lookAt(c);
    } else {
      const quake = inp.summon > 0 && inp.appear < 0.3 ? Math.pow(inp.summon, 3) * 0.05 : 0;
      const a = quake + inp.flash * 0.04;
      this.shake.set(Math.sin(inp.t * 0.09) * a, Math.cos(inp.t * 0.11) * a, 0);
      this.camera.position.copy(CAMERA_POS).add(this.shake);
      this.camera.position.x += Math.sin(t * 0.13) * 0.25;
      this.camera.position.y += Math.sin(t * 0.17) * 0.12;
      // aproxima um pouco quando o dragão está presente (dolly-in lento)
      this.camera.position.z -= 1.2 * inp.appear;
      this.camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y + 0.4 * inp.appear, CAMERA_TARGET.z);
    }
    this.atmo.update(inp, this.scene);
    this.dragon.update(inp, this.camera);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
