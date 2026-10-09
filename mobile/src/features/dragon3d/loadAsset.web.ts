import { Asset } from 'expo-asset';
import { parseGlb, type DragonAsset } from './core/glb';

let cache: Promise<DragonAsset> | null = null;

export function loadDragonAsset(): Promise<DragonAsset> {
  cache ??= (async () => {
    const asset = Asset.fromModule(require('../../../assets/models/shenlong.glb'));
    return parseGlb(await (await fetch(asset.uri)).arrayBuffer());
  })();
  return cache;
}
