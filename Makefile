.PHONY: dragon-build dragon-viewer dragon-shot icon voice-setup check-keys
.PHONY: help install install-server install-mobile setup-env up up-mock server server-mock mobile mobile-clear mobile-tunnel \
        gen-voice gen-sfx test typecheck lan-ip fix-inotify-watchers mobile-eas-auth-check \
        mobile-build-ios mobile-build-android mobile-build-all

GREEN=\033[0;32m
YELLOW=\033[1;33m
RED=\033[0;31m
BLUE=\033[0;34m
NC=\033[0m

.DEFAULT_GOAL := help

# IP da máquina na rede local (o celular acessa o backend e o Metro por ele)
LAN_IP := $(shell hostname -I 2>/dev/null | awk '{print $$1}')
# Perfil EAS: ENV=preview (padrão) | development | production
ENV ?= preview

help: ## Mostra esta ajuda
	@echo "$(GREEN)Shenlong — comandos disponíveis:$(NC)"
	@echo ""
	@echo "$(BLUE)🚀 TESTAR NO CELULAR (Expo Go):$(NC)"
	@echo "$(YELLOW)  make install      $(NC) Instala dependências (mobile + server) e cria server/.env"
	@echo "$(YELLOW)  make up           $(NC) Sobe backend + Expo juntos (QR code no terminal). Ctrl+C encerra os dois"
	@echo "$(YELLOW)  make up-mock      $(NC) Igual, mas com backend de teste (sem chaves de API; voz do aparelho, invoque por toque longo)"
	@echo "$(YELLOW)  make server       $(NC) Só o backend (porta 8787)       | make server-mock: sem chaves"
	@echo "$(YELLOW)  make mobile       $(NC) Só o Expo (LAN)  | mobile-clear: cache limpo | mobile-tunnel: redes restritas"
	@echo "$(YELLOW)  make lan-ip       $(NC) Mostra o IP da LAN usado pelo celular"
	@echo "$(YELLOW)  make fix-inotify-watchers$(NC) Linux: corrige ENOSPC do Metro"
	@echo ""
	@echo "$(BLUE)🛠  ASSETS & QUALIDADE:$(NC)"
	@echo "$(YELLOW)  make dragon-build $(NC) Regera o modelo 3D (tools/dragon → mobile/assets/models/shenlong.glb)"
	@echo "$(YELLOW)  make dragon-viewer$(NC) Abre o viewer 3D em http://localhost:8099/tools/viewer/index.html#anim=1"
	@echo "$(YELLOW)  make dragon-shot  $(NC) Renderiza PNGs de inspeção (Chrome headless) em /tmp/shenlong-shots"
	@echo "$(YELLOW)  make icon         $(NC) Renderiza o ícone/adaptive-icon a partir do modelo 3D"
	@echo "$(YELLOW)  make voice-setup  $(NC) Instala voz + reconhecimento de fala locais e grátis (Piper + Whisper)"
	@echo "$(YELLOW)  make gen-voice    $(NC) Regera as frases fixas de Shenlong com a voz de dragão"
	@echo "$(YELLOW)  make gen-sfx      $(NC) Regenera os efeitos sonoros sintetizados"
	@echo "$(YELLOW)  make test         $(NC) Testes (mobile + server)  | make typecheck: tsc nos dois"
	@echo ""
	@echo "$(BLUE)🏭 BUILD (EAS):$(NC)"
	@echo "$(YELLOW)  make mobile-build-ios | mobile-build-android | mobile-build-all$(NC)  (ENV=preview|development|production, padrão preview)"
	@echo ""

# ───────── setup ─────────
install: install-server install-mobile setup-env ## Instala tudo
	@$(MAKE) --no-print-directory voice-setup || echo "$(YELLOW)⚠️  voz local não instalada (precisa de uv); Shenlong usa a voz da OpenAI ou a do aparelho$(NC)"

install-server:
	@cd server && npm install

install-mobile:
	@cd mobile && npm install

setup-env: ## Cria server/.env a partir do exemplo
	@if [ ! -f server/.env ]; then cp server/.env.example server/.env; \
	  echo "$(YELLOW)⚠️  server/.env criado. Preencha OPENAI_API_KEY e ANTHROPIC_API_KEY (ou use make up-mock).$(NC)"; \
	else echo "$(GREEN)✓ server/.env já existe$(NC)"; fi

lan-ip:
	@echo "$(LAN_IP)"

# ───────── executar ─────────
server: ## Backend (porta 8787)
	@cd server && npm start

server-mock: ## Backend de teste, sem chaves
	@cd server && npm run mock

mobile: ## Expo Go via LAN
	@echo "$(GREEN)📱 Expo (LAN $(LAN_IP)) — celular e PC na mesma rede Wi‑Fi$(NC)"
	@cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=$(LAN_IP) npx expo start --go --lan

mobile-clear: ## Expo com cache limpo
	@cd mobile && REACT_NATIVE_PACKAGER_HOSTNAME=$(LAN_IP) npx expo start --clear --go --lan

mobile-tunnel: ## Expo via túnel (redes restritas; o backend precisa de EXPO_PUBLIC_API_URL público)
	@cd mobile && npx expo start --clear --go --tunnel

UV := $(shell command -v uv 2>/dev/null || echo $(HOME)/.local/bin/uv)
VOICE_DIR := tools/voice
voice-setup: ## Voz e reconhecimento de fala locais e grátis (Piper + Whisper) num venv isolado
	@test -x "$(UV)" || { echo "$(RED)❌ precisa do uv (https://docs.astral.sh/uv/)$(NC)"; exit 1; }
	@test -x $(VOICE_DIR)/.venv/bin/python || $(UV) venv -q --python 3.12 $(VOICE_DIR)/.venv
	@$(UV) pip install -q --python $(VOICE_DIR)/.venv/bin/python piper-tts faster-whisper
	@test -f $(VOICE_DIR)/models/pt_BR-faber-medium.onnx || (cd $(VOICE_DIR) && mkdir -p models && cd models && ../.venv/bin/python -m piper.download_voices pt_BR-faber-medium)
	@echo "$(BLUE)⬇️  modelo de reconhecimento de fala (Whisper base, ~150 MB, só na 1ª vez)$(NC)"
	@cd $(VOICE_DIR) && .venv/bin/python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8', download_root='models/whisper')" 2>/dev/null
	@command -v ffmpeg >/dev/null || echo "$(YELLOW)⚠️  instale o ffmpeg (sudo apt install ffmpeg) para o efeito de voz de dragão$(NC)"
	@echo "$(GREEN)✓ voz local pronta$(NC)"

check-keys:
	@test -x $(VOICE_DIR)/.venv/bin/python || { echo "$(YELLOW)⚠️  voz/reconhecimento locais não instalados: rode make voice-setup$(NC)"; }
	@if ! grep -qE '^(OPENAI|ANTHROPIC)_API_KEY=.+' server/.env 2>/dev/null; then \
	  echo "$(BLUE)ℹ️  Sem chave de API: ouvir e voz rodam grátis no computador; a conversa é por regras.$(NC)"; \
	  echo "$(BLUE)   Para a conversa com IA de verdade, preencha OPENAI_API_KEY em server/.env.$(NC)"; \
	fi

up: setup-env check-keys ## Backend + Expo juntos
	@test -d server/node_modules || $(MAKE) install-server
	@test -d mobile/node_modules || $(MAKE) install-mobile
	@echo "$(GREEN)🐉 Backend em http://$(LAN_IP):8787  |  Expo logo abaixo — leia o QR com o Expo Go$(NC)"
	@trap 'kill 0' INT TERM EXIT; \
	  (cd server && npm start) & \
	  sleep 2; $(MAKE) --no-print-directory mobile

up-mock: ## Backend de teste + Expo
	@test -d server/node_modules || $(MAKE) install-server
	@test -d mobile/node_modules || $(MAKE) install-mobile
	@echo "$(YELLOW)🧪 Modo mock: sem STT/TTS reais. Invoque segurando a tela por ~1 s.$(NC)"
	@trap 'kill 0' INT TERM EXIT; \
	  (cd server && npm run mock) & \
	  sleep 2; $(MAKE) --no-print-directory mobile

fix-inotify-watchers: ## Linux: corrige ENOSPC (Metro)
	@echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p

# ───────── assets / qualidade ─────────
gen-voice:
	@cd server && npm run gen:voice

gen-sfx:
	@cd mobile && npm run gen:sfx

test: ## Testes
	@cd mobile && npx jest
	@cd server && npx vitest run

typecheck:
	@cd mobile && npx tsc --noEmit
	@cd server && npx tsc --noEmit

# ───────── EAS ─────────
EAS_PROFILE = $(if $(filter $(ENV),production),production,$(if $(filter $(ENV),development),development,preview))

mobile-eas-auth-check:
	@cd mobile && npx --no-install eas whoami >/dev/null 2>&1 || { echo "$(RED)❌ Não autenticado no EAS. Rode: cd mobile && npx eas login$(NC)"; exit 1; }

mobile-build-ios: mobile-eas-auth-check ## Build iOS (ENV=preview|development|production)
	@cd mobile && npx --no-install eas build --platform ios --profile $(EAS_PROFILE)

mobile-build-android: mobile-eas-auth-check ## Build Android
	@cd mobile && npx --no-install eas build --platform android --profile $(EAS_PROFILE)

mobile-build-all: mobile-eas-auth-check ## Build iOS + Android
	@cd mobile && npx --no-install eas build --platform all --profile $(EAS_PROFILE)

# ───────── Shenlong 3D ─────────
dragon-build: ## Regera o GLB do Shenlong a partir da escultura SDF
	@node tools/dragon/build.mjs

dragon-viewer: ## Viewer 3D no navegador (mesmo código da cena do app)
	@tools/viewer/build.sh
	@echo "$(GREEN)🐉 http://localhost:8099/tools/viewer/index.html#anim=1  (Ctrl+C para sair)$(NC)"
	@python3 -m http.server 8099 --bind 127.0.0.1

SHOTS ?= /tmp/shenlong-shots
dragon-shot: ## PNGs de inspeção: pose final, aparição, rosto
	@tools/viewer/build.sh && mkdir -p $(SHOTS)
	@(python3 -m http.server 8099 --bind 127.0.0.1 >/dev/null 2>&1 & echo $$! > $(SHOTS)/.srv); sleep 1; \
	  for a in 0.2 0.5 0.8 1; do tools/viewer/shoot.sh $(SHOTS)/appear_$$a.png "appear=$$a&t=9000" 430x932 >/dev/null; done; \
	  tools/viewer/shoot.sh $(SHOTS)/face.png "appear=1&t=8000&yaw=-35&pitch=5&dist=6" 600x600 >/dev/null; \
	  kill $$(cat $(SHOTS)/.srv); echo "$(GREEN)✓ $(SHOTS)$(NC)"

icon: ## Ícone 1024 + adaptive icon renderizados do modelo 3D
	@tools/viewer/build.sh && mkdir -p $(SHOTS)
	@(python3 -m http.server 8099 --bind 127.0.0.1 >/dev/null 2>&1 & echo $$! > $(SHOTS)/.srv); sleep 1; \
	  tools/viewer/shoot.sh $(SHOTS)/icon_raw.png "appear=1&t=8000&speak=0.38&wish=0.25&yaw=-38&pitch=-14&dist=6.0&icon=1&bx=-0.6&by=-0.75&bs=0.34" 1024x1024 >/dev/null; \
	  tools/viewer/shoot.sh $(SHOTS)/adaptive_raw.png "appear=1&t=8000&speak=0.38&wish=0.25&yaw=-38&pitch=-14&dist=8.6&icon=1&bx=-0.45&by=-0.55&bs=0.26" 1024x1024 >/dev/null; \
	  kill $$(cat $(SHOTS)/.srv); \
	  python3 tools/viewer/finish_icon.py $(SHOTS)/icon_raw.png mobile/assets/icon.png && \
	  python3 tools/viewer/finish_icon.py $(SHOTS)/adaptive_raw.png mobile/assets/adaptive-icon.png && echo "$(GREEN)✓ ícones atualizados$(NC)"
