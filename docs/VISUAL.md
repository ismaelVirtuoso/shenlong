> **Estado atual: 3D em tempo real (three.js + expo-gl), seção 9.** A versão anime em 2D (seção 8) foi
> testada e rejeitada ("a versão 3D estava muito melhor"); o 3D voltou e foi refinado pela referência do anime.
> As seções 1–7 registram a primeira fase 3D; a 8, a tentativa em 2D (histórico).

# Visual do Shenlong: do 2D amador ao 3D, o desvio pelo anime e a volta ao 3D

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

## 4. O que foi implementado

| Parte | Onde | Como |
|---|---|---|
| Asset 3D | `tools/dragon/` → `mobile/assets/models/shenlong.glb` (≈4,5 MB) | Escultura SDF (crânio, focinho longo, nariz com narinas para cima, sobrancelhas pesadas com pálpebra, maçãs, lábios, pescoço) → *surface nets* + projeção de Newton; AO e cor por região assados por vértice; máscara de mucosa (boca lisa/úmida); dentes, chifres em galhada, juba (com atributo de balanço) e pata com garras como malhas explícitas. LOD alto (~92k tri) e baixo (~28k tri). `make dragon-build` (~7 s). |
| Leitor GLB | `dragon3d/core/glb.ts` | Leitor mínimo (sem GLTFLoader/DOM), testado em `glb.test.ts` |
| Corpo | `core/tube.ts`, `core/path.ts`, `core/dragon.ts` | Tubo contínuo (230×30) em spline Catmull-Rom animada, quadros por transporte paralelo, ventre achatado, normais analíticas; espinhos dorsais instanciados; 4 patas; a cabeça percorre o caminho ao surgir (o corpo segue como serpente) e vira em 3/4 para a câmera |
| Pele | `core/textures.ts`, `core/materials.ts` | Escamas sobrepostas geradas em runtime (normal + cavidade + rugosidade + variação), UV no corpo e triplanar na cabeça/patas; placas ventrais; contraluz (fresnel) mascarado por AO |
| Rosto vivo | `core/dragon.ts`, `core/whisker.ts` | Mandíbula articulada com envelope de fala, olhos (íris emissiva, pupila em fenda) que seguem a câmera e piscam, juba balançando, bigodes com física verlet, orbe ao pensar, rugido no desejo |
| Fotografia | `core/atmosphere.ts`, `core/DragonScene.ts` | Céu por humor (noite → tempestade → verde/dourado), estrelas, nuvens em camadas intercaladas com o corpo, raios de luz, chave dourada de baixo, contraluz quente, luz de topo com sombras (PCF soft), luz do relâmpago, névoa, ACES, *dolly-in* e tremor de câmera |
| App | `dragon3d/DragonView.tsx`, `dragon3d/timeline.ts` | `expo-gl` + three no thread JS; a coreografia espelha a da cena 2D; rebaixamento automático (desliga sombras se < ~35 fps); Skia por cima (altar, esferas, pilar, relâmpagos, vinheta) |
| Inspeção | `tools/viewer/` | Mesmo código da cena renderizado em Chrome headless (`make dragon-shot`, `make dragon-viewer`) |
| Ícone | `make icon` | Render do próprio modelo (close 3/4 rugindo, olho aceso, esfera de 4 estrelas 3D) + bloom/vinheta; `adaptive-icon.png` com respiro para a zona segura |

Imagem atual (render real, Chrome/SwiftShader): `docs/img/shenlong-3d.jpg`.

## 5. Validação feita
- Renders inspecionados em 6 rodadas (vista frontal, 3/4, lateral, close da boca, aparição em 5 quadros, perfis médio/baixo). Defeitos encontrados e corrigidos: cara de "sapo" (olhos saltados, focinho curto), escala da cabeça, bigodes em zigue-zague (escala da cabeça e espaçamento não uniforme da forma de repouso), céu bege (halo largo), escamas grandes demais, boca com escamas e contraluz, corte plano na traseira da mandíbula, caminho saindo do quadro, coluna da raiz fina demais.
- App rodando no navegador (Expo web): GL + Skia + UI juntos, fluxo completo de invocação → aparição → saudação → escuta. Bug encontrado e corrigido: canvas do expo-gl web preso em 300×150.
- `jest` (31 testes, inclui integridade do GLB), `tsc` e `expo export` Android/iOS.

## 6. Limitações que permanecem
- **Não testado em aparelho físico.** Riscos: desempenho em Android fraco (há LOD e rebaixamento automático), diferenças do EXGL (sem MSAA fora do iOS; `renderbufferStorageMultisample` não implementado — a cena não usa).
- Qualidade de "jogo mobile de alto nível", não de longa-metragem: falta escultura de artista (micro-detalhe de pele, escamas individuais esculpidas, *rig* facial), sombreamento de subsuperfície real e *post-processing* (bloom real, profundidade de campo), caros demais no `expo-gl`.
- A juba é de espinhos (fiel ao Shenron do anime), não pelos; bigodes são tubos.
- Para publicar: o design segue o personagem da Toei → trocar marca/arte (ver PLANO §8). O pipeline permite: basta outro GLB com os mesmos nomes de malhas/nós.

## 7. Próximos passos sugeridos
1. Validar no iPhone e num Android médio (`make up`).
2. Se o FPS no Android ficar baixo: `quality: 'low'` por padrão nesse aparelho.
3. Para subir de patamar: encomendar a cabeça esculpida (ZBrush/Blender) exportada como GLB com os mesmos nomes; o resto da cena continua igual.


## 8. Tentativa em estilo anime (2D vetorial no Skia) — rejeitada, ver seção 9

**Por quê:** o anime é o visual que a criança reconhece como "o Shenlong"; o 3D procedural nunca chegaria ao
traço do desenho, e custava caro: three.js no thread JS, GLB de 4,5 MB, ~250 ms/quadro no emulador.

**Como ficou:**
| Parte | Onde | Técnica |
|---|---|---|
| Cabeça (frente, sobrancelhas em V, olhos, focinho com narinas, presas, galhada, tufos) | `mobile/src/features/scene/art/head.ts` | Arte vetorial em camadas (fonte única para app, prévia e ícone), gravada como `SkPicture` e **rasterizada uma vez** em textura na resolução do aparelho; mandíbula e boca são camadas separadas (abrem ao falar) |
| Olhos "iluminados" | `AnimeDragon.tsx` | Halo vermelho aditivo + íris com núcleo branco-quente + reflexo + brilho horizontal; pulsam e reagem à fala, à voz da criança e ao desejo |
| Corpo enrolado em volta da cabeça | `AnimeDragon.tsx` | Espinha animada (Catmull-Rom) → **malhas de triângulos** (`drawVertices`) numa `SkPicture` por quadro: aura com borda suave, nanquim, verde, luz, sombra, escamas, barriga bege segmentada e espinhos dorsais |
| Braços com garras, bigodes dourados | `art/arm.ts`, `AnimeDragon.tsx` | Textura do braço; bigodes ondulando |
| Céu, aura verde, raios de luz | `Backdrop.tsx`, `AnimeDragon.tsx` | Gradientes; raios girando (textura) |
| Rochas, nuvens, névoa | `art/landscape.ts`, `Foreground.tsx` | Texturas estáticas com deriva |
| Aparição | `AnimeDragon.tsx` | "Serpente de luz" que sobe do pilar contornando a tela e ganha as cores ao assentar |
| Ícone | `tools/art/icon.ts` (`make icon`) | A mesma arte vetorial + aura + esfera de 4 estrelas |

**Desempenho medido (emulador Android, GPU Intel UHD 620, modo produção):** boot 32 ms/quadro (piso do próprio
emulador), Shenlong presente 48 ms; GPU 18 ms. Lições registradas no código:
- `BlurMask` grande por quadro derrubava a GPU (percentil de 5 s) → aura feita com faixa de triângulos de alfa decrescente;
- caminhos dinâmicos complexos caem no rasterizador por software do Skia (máscara na CPU do tamanho da tela,
  por camada) → corpo em `drawVertices`;
- centenas de caminhos estáticos por quadro → rasterizados uma vez em textura.

**Removido do app:** `three`, `expo-gl`, o GLB e o pipeline 3D (continuam no histórico do git, commit `802c1d2`).


## 9. Volta ao 3D e refinamento pela referência do anime (estado atual)

Restaurado o 3D do commit `802c1d2` e ajustado à referência (Shenlong do anime: verde-limão, barriga pêssego
com a linha vermelha, galhada marrom, olhos vermelhos amendoados, juba em tufos, bigodes longos).

| Pedido | O que mudou | Onde |
|---|---|---|
| Rosto mais frontal, "serpente pronta para o bote", imponente | Cabeça centralizada e maior (`HEAD_SCALE` 1,75), de frente com leve 3/4, olhando para baixo, boca entreaberta com os dentes à mostra; pescoço em **S** que desce do laço de cima, passa por baixo da cabeça e sobe por trás dela; câmera mais baixa (contra-plongée). Na aparição a cabeça sobe pelo corpo e desce pelo S, como um bote | `core/dragon.ts`, `core/path.ts`, `core/DragonScene.ts` |
| "Está escondendo partes do corpo" | Câmera afastada (z 15,5 → 20) e centrada no corpo: o "8" inteiro cabe numa tela em pé, com a cabeça emoldurada pelo laço de cima | `core/DragonScene.ts` |
| Rotação do corpo estranha onde aparece a barriga | O alvo do dorso (para fora da curva + para a câmera) é **suavizado ao longo da coluna** (2× média móvel ±9 anéis) e o dorso **nunca fica de costas para a câmera**: a barriga aparece de lado, nas bordas internas das voltas, sem "fita torcida" nos pontos de inflexão do S | `core/tube.ts` (`computeFrames`) |
| Mancha/linha reta no corpo | Era borda do mapa de sombras; **sombras projetadas desligadas** (também custavam quadros no iPhone). O AO assado no modelo dá o contato | `core/atmosphere.ts` |
| Lábio inferior transparente | Caixa de recorte da mandíbula estendida para a frente (o lábio era cortado) | `tools/dragon/build.mjs` (`JAW_BOX`) |
| Olho redondo → como o original, vermelho | Olho amendoado inclinado, íris vermelha acesa com fenda fina, halo vermelho | `core/dragon.ts`, `core/materials.ts` |
| Chifres mais marrons; juba mais anime | Galhada `#3a2410 → #7e5428`; juba em tufos finos (bochechas, mandíbula, sobrancelhas, nuca, crista) | `tools/dragon/build.mjs`, `head.mjs` |
| Cenário vazio | Pilares de rocha com topo de grama, cordilheira azulada e chão (estilo dos cenários do anime), em poucas malhas | `core/landscape.ts` |
| Ícone | Novo render da pose atual; corrigido o acabamento que escurecia a imagem inteira (`ImageChops.add(scale=2.2)` dividia tudo por 2,2) | `make icon`, `tools/viewer/finish_icon.py` |

## 10. Cabeça, boca, dentes e volume do corpo

| Pedido | O que mudou | Onde |
|---|---|---|
| Formato da cabeça | Crânio mais largo, focinho mais estreito e longo que afina e achata na ponta, aros nas narinas viradas para cima, sobrancelhas mais orgânicas; canto da boca arredondado; cabeça maior (`HEAD_SCALE` 1,9) para acompanhar o corpo mais grosso | `tools/dragon/head.mjs`, `core/dragon.ts` |
| Interior da boca "de uma cor só" | Cada tecido com forma e cor: **palato** em abóbada (vinho, com rugas na cor), **gengivas** rosadas nas bordas, **assoalho** rebaixado e escuro, **língua** de verdade (volume, sulco central, dorso mais claro, ponta arredondada), garganta escurecendo. Mucosa úmida e lisa no shader (sem escamas, AO suave) | `head.mjs` (`palateLift`, `floorDrop`, `tongue`, cores), `parts.mjs`, `core/materials.ts` |
| Dentes realistas e imponentes | Mais dentes, em **lâmina recurvada** (seção achatada), raiz na gengiva, base marfim → ponta branca; molares curtos atrás, presas grandes em cima e embaixo (as de cima aparecem por fora do lábio com a boca fechada); boca entreaberta em repouso e mais aberta ao falar | `tools/dragon/build.mjs`, `core/dragon.ts` |
| Corpo "de cobra" | Perfil de raio novo: 0,85 no pescoço (casa com a cabeça) → **1,08 no peito** → afunila até ~0,2 na cauda (antes era quase cilíndrico, ~0,6); escamas repetidas 4× na volta para não esticarem; patas proporcionais ao raio | `core/dragon.ts` |
| Orientação do corpo | Garganta creme do pescoço voltada para quem olha (como na referência) e o resto com o dorso verde de frente; o alvo agora pesa quase por inteiro logo após o pescoço, então a orientação não "deriva" com a ondulação (antes a barriga aparecia de frente só em alguns instantes) | `core/tube.ts` (`computeFrames`) |

Bugs de inspeção corrigidos no caminho:
- O viewer reaproveitava um GLB antigo do cache do Chrome depois de `make dragon-build`; agora busca sem cache.
- Na mistura triplanar das normais, o `z` da textura de escamas ainda modulava a mucosa e desenhava escamas no reflexo da boca úmida.

O viewer ganhou parâmetros de inspeção: `mouth` (órbita centrada na boca), `jawonly` (esconde a parte de cima da cabeça) e `nobody` (esconde o corpo).
