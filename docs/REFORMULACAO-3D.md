# Reformulação cinematográfica do Shenlong: auditoria e decisão

## 1. Auditoria da implementação atual
| Item | Como está | Veredito |
|---|---|---|
| Renderização | React Native Skia (2D, canvas), um `Canvas` em tela cheia | Bom para efeitos 2D; **não serve para personagem 3D** |
| Shenlong | `mobile/src/features/scene/Dragon.tsx`: corpo = ~70 **círculos 2D** ao longo de uma senoide; cabeça = paths SVG **frontais e chapados** (espelhados) | **Causa raiz** da aparência amadora: não há volume, perspectiva, anatomia nem material. Não é aproveitável como base |
| Materiais/luz | Gradientes lineares/radiais e linhas de "costela"; sem luz, sombra, normal ou rugosidade | Insuficiente |
| Animação | Onda viajante 2D + boca por translação + piscar | Lógica de tempo reaproveitável; geometria não |
| Efeitos de invocação | Altar, 7 esferas, pilar de luz, hélices, ondas, brasas, relâmpago, flash, vinheta, shake | **Bons: preservar** (camada Skia por cima do 3D) |
| Fluxo/áudio/IA | Máquina de estados, VAD/STT, chat em streaming, TTS, SFX, haptics | **Preservar sem mudanças** |

## 2. Diagnóstico
A baixa qualidade não é falta de detalhe: é a **técnica**. Um desenho 2D frontal nunca terá volume, escamas que respondem à luz, silhueta coerente em perspectiva nem deformação corporal. Retocar o `Dragon.tsx` seria desperdício.

## 3. Solução escolhida
**3D em tempo real com three.js sobre `expo-gl`** (ambos funcionam no Expo Go, sem dev client):

1. **Asset 3D próprio (GLB)** gerado por um pipeline em `tools/dragon/` (Node):
   - cabeça e mandíbula **esculpidas como SDF** (uniões suaves de crânio, focinho, nariz arrebitado com narinas, arcos das sobrancelhas, maçãs, órbitas, orelhas), poligonizadas com *surface nets* + projeção de Newton (~60k triângulos; LOD baixo ~20k);
   - AO e cor por região **assados em vertex color** (verde dorsal, garganta creme, lábios, palato);
   - malhas explícitas: dentes, chifres-galhada marfim com anéis, juba de espinhos verde-escuros (com atributo de balanço), garra/pata;
   - GLB padrão (abre no Blender): **pode ser trocado por um modelo de artista** sem mudar o código.
2. **Corpo em tempo real**: tubo contínuo (≈220 anéis × 28 lados) ao longo de um spline animado, com quadros de transporte paralelo (sem torção), seção achatada no ventre, placas ventrais creme, espinhos dorsais instanciados, 4 patas com garras; a cabeça percorre o caminho ao emergir do pilar e depois vira para a câmera.
3. **Material de pele PBR**: textura de escamas sobrepostas gerada em runtime (normal + cavidade + rugosidade), triplanar na cabeça; olhos com íris emissiva e pupila em fenda; bigodes com física *verlet* (inércia).
4. **Fotografia**: câmera com FOV ~35°, luz-chave dourada vinda das esferas, contraluz azul para a silhueta, hemisférica, luz do relâmpago, sombras (perfil alto), névoa, raios de luz volumétricos falsos e nuvens em sprites intercaladas com as voltas do corpo.
5. **Camadas**: GL (céu + dragão + nuvens) embaixo; Skia (altar, esferas, pilar, brasas, relâmpago, vinheta) por cima; a UI continua no topo.
6. **Validação real**: viewer em `tools/viewer/` (esbuild + Chrome headless com WebGL) para renderizar vários ângulos/estados e inspecionar; depois Expo web e aparelho.
7. **Ícone**: render do próprio modelo 3D (close da cabeça com olho aceso, contraluz e esfera) em 1024 px, mais o adaptive icon e o splash.

### Dependências e limites honestos
- Já instalados: `three@0.180`, `expo-gl`, `@types/three`, `esbuild`.
- Fidelidade máxima ("longa-metragem") exige **artista 3D** (modelo esculpido, rig e texturas 4K). O pipeline procedural chega a um nível "jogo mobile de qualidade", não a filme. Modelos de fã do Shenron na internet têm licença incerta e IP da Toei: só para uso pessoal.
- Desempenho no Android fraco: LOD baixo, sem sombras e pixel ratio 1.

## 4. Estado
- [x] Auditoria e decisão (este documento)
- [x] Dependências instaladas
- [ ] Gerador de asset (SDF → GLB)
- [ ] Viewer headless + iteração da escultura
- [ ] Cena three (corpo, materiais, luz, atmosfera, bigodes)
- [ ] Integração RN (GLView + Skia por cima), remover `Dragon.tsx`/`Sky` 2D
- [ ] Ícone/splash a partir do render
- [ ] Validação visual (web + aparelho), testes, commit
