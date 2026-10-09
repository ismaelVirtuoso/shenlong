# Shenlong 🐉

Experiência imersiva de celular: você diz **"Shenlong, apareça!"**, as esferas reagem, o dragão surge e conversa por voz com você (feito para uma criança de 5 anos). Plano e decisões: [`docs/PLANO.md`](docs/PLANO.md). Roteiro de testes manuais: [`docs/TESTES.md`](docs/TESTES.md).

```
mobile/   app Expo SDK 57 (Skia + Reanimated), roda no Expo Go
server/   backend Hono/Node: /api/stt, /api/chat (NDJSON por frase), /api/tts — as chaves ficam aqui
```

## Rodar no celular (Expo Go)

```bash
make install     # dependências + cria server/.env
# edite server/.env: OPENAI_API_KEY (STT+TTS) e ANTHROPIC_API_KEY (chat)
make up          # backend (:8787) + Expo; leia o QR com o Expo Go
```
- Celular e PC na **mesma rede Wi‑Fi**. Se o app não conectar, libere as portas: `sudo ufw allow 8081,8787/tcp`.
- Sem chaves ainda: `make up-mock` (invoque segurando a tela ~1 s; voz do aparelho).
- Rede restrita / iPhone sem LAN: `make mobile-tunnel` (e hospede o backend, definindo `EXPO_PUBLIC_API_URL`).
- Outros: `make help` (server, mobile-clear, test, typecheck, gen-voice, mobile-build-*).

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
