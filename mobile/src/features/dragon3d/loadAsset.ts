import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { parseGlb, type DragonAsset } from './core/glb';

let cache: Promise<DragonAsset> | null = null;

/** Carrega e decodifica o shenlong.glb empacotado no app (uma vez). */
export function loadDragonAsset(): Promise<DragonAsset> {
  cache ??= (async () => {
    const asset = Asset.fromModule(require('../../../assets/models/shenlong.glb'));
    await asset.downloadAsync();
    const bytes = await new File(asset.localUri ?? asset.uri).bytes();
    return parseGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  })();
  return cache;
}
