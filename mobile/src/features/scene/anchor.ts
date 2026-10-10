import { makeMutable } from 'react-native-reanimated';

/** Ponta da cauda (as sete esferas unidas) na tela, em frações da largura/altura; escrita pela cena 3D. */
export const tailAnchor = makeMutable({ x: 0.5, y: 0.78 });
