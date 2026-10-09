# Shenlong 🐉

Experiência imersiva de celular: você diz **"Shenlong, apareça!"**, as esferas reagem, o dragão surge e conversa por voz com você (feito para uma criança de 5 anos). Plano e decisões: [`docs/PLANO.md`](docs/PLANO.md). Roteiro de testes manuais: [`docs/TESTES.md`](docs/TESTES.md).

```
mobile/   app Expo SDK 57 (Skia + Reanimated), roda no Expo Go
server/   backend Hono/Node: /api/stt, /api/chat (NDJSON por frase), /api/tts — as chaves ficam aqui
```

## Rodar (Expo Go)

1. **Backend** (celular e computador na mesma rede Wi‑Fi):
   ```bash
   cd server
   cp .env.example .env     # preencha OPENAI_API_KEY (STT+TTS) e ANTHROPIC_API_KEY (chat)
   npm start                # porta 8787. Sem chaves: `npm run mock` (respostas de teste)
   ```
2. **App**:
   ```bash
   cd mobile
   npm start                # expo start --go → leia o QR com o Expo Go
   ```
   O app descobre o IP do computador sozinho (via Metro). Para outro backend: `EXPO_PUBLIC_API_URL=https://...`.
3. Toque na tela, diga **"Shenlong, apareça!"** (ou segure a tela por ~1 s) e converse.

Opcional — voz fixa com latência zero (abertura/despedida): `cd server && npm run gen:voice`.
Regenerar efeitos sonoros (sintetizados por código): `cd mobile && npm run gen:sfx`.

### Sem chaves / sem internet
- Sem backend: invocação por voz alta ou toque longo funciona; Shenlong fala com a voz do aparelho (expo-speech) e se despede com elegância.
- `/debug` (abra no app via `shenlong://debug`, ou no web) pula para qualquer fase da cena.

## Testes
`cd mobile && npm test` (máquina de estados, reconhecimento da invocação) · `cd server && npm test` (segmentador de frases, filtros) · `npx tsc --noEmit` nos dois.

## Builds (EAS)
`cd mobile && eas init && npm run eas:build:ios:preview` / `eas:build:android:preview`. Antes: hospede o backend e ajuste `EXPO_PUBLIC_API_URL` em `eas.json`; troque `BUNDLE_ID` em `app.config.js`. Para publicar nas lojas: ver §8 e §11 do plano (marca/arte próprias, gate parental, política de privacidade).

## Estado atual
Implementado: fases 0–9 do plano + configuração de build (10–11). Não verificado em aparelho real (validar: latência do VAD/STT, áudio de gravação↔reprodução no iOS, FPS no Android fraco). Visual conferido no browser via Skia web.
