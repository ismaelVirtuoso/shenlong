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
	@echo "$(YELLOW)  make gen-voice    $(NC) Pré-gera as frases fixas de Shenlong (precisa OPENAI_API_KEY)"
	@echo "$(YELLOW)  make gen-sfx      $(NC) Regenera os efeitos sonoros sintetizados"
	@echo "$(YELLOW)  make test         $(NC) Testes (mobile + server)  | make typecheck: tsc nos dois"
	@echo ""
	@echo "$(BLUE)🏭 BUILD (EAS):$(NC)"
	@echo "$(YELLOW)  make mobile-build-ios | mobile-build-android | mobile-build-all$(NC)  (ENV=preview|development|production, padrão preview)"
	@echo ""

# ───────── setup ─────────
install: install-server install-mobile setup-env ## Instala tudo

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

up: setup-env ## Backend + Expo juntos
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
