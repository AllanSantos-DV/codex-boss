# Changelog — codex-boss

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

## [0.1.0] — 2026-06-30

### Adicionado
- Plugin **codex-boss** para o Codex CLI: bridge de memoria semantica do time.
- `.mcp.json` apontando para o servidor MCP da equipe via HTTP streamable
  (`http://192.168.18.13:38080/mcp`) — sem subir jar local.
- Auto-recall no evento `UserPromptSubmit` (`scripts/recall.mjs` → `/api/v1/context`).
- Probe de saude no `SessionStart` (`scripts/session-start.mjs` → `/health`).
- Ferramenta de diagnostico `scripts/doctor.mjs` + comandos `/memory-doctor`,
  `/memory-search`, `/memory-status`.
- Skill `memory` (recall guiado) e configuracao em `config/memory.config.json`
  (override por variaveis de ambiente).
- Marketplace `allansantos-plugins` (`.agents/plugins/marketplace.json`) com
  `installation: INSTALLED_BY_DEFAULT` para auto-instalacao.

### Pendente (infra, fora do plugin)
- Autenticacao no servidor (REST/MCP hoje sem auth — rede local fechada).
- Bind do servidor em `0.0.0.0:38080` para acesso na LAN (hoje `127.0.0.1`).
- Validar no Codex real: shape de saida do hook para injecao de contexto,
  campo do prompt em `UserPromptSubmit`, e se `marketplace upgrade` reinstala.
