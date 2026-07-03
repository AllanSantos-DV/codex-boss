# Changelog — codex-boss

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

## [0.2.0] — 2026-07-03

Alinhamento com a evolucao do servidor (native-java 2.11.5): ingestao de sessao,
memoria de longo prazo e "dreaming".

### Adicionado
- **Ingestao de sessao (hook `Stop`)** — `scripts/ingest-session.mjs` le o
  transcript do Codex (`transcript_path`, rollout .jsonl), extrai as mensagens
  novas desde a ultima ingestao (offset por sessao) e envia para a tool MCP
  `ingest_conversation`. A curadoria (LLM) roda em background no servidor e
  alimenta a memoria de longo prazo + o material de consolidacao ("dreaming").
  As mensagens sao normalizadas para `{id, role, text}` (o discovery do servidor
  exige um id por mensagem — o rollout do Codex nao tem, entao normalizamos).
  Validado E2E contra o servidor: 9 pares extraidos e curados (success=9).
- **Helper MCP** `mcpCall` + `mcpToolsList` em `scripts/lib/client.mjs`
  (streamable HTTP: initialize -> tools/call; parse JSON/SSE; fail-open).
- **doctor** agora lista as tools MCP e checa a presenca de `ingest_conversation`;
  adiciona nota sobre o escopo REST-vs-MCP do recall.
- Config nova: bloco `ingest` (enabled, minChars, maxCharsPerBatch, timeoutMs,
  consumerId) + envs `MEMORY_INGEST=off` e `MEMORY_CONSUMER_ID`.

### Corrigido / esclarecido
- **Skill `memory`**: a orientacao anterior sugeria buscar o acervo do time via
  tools MCP. Na pratica, `search_memory`/`get_context`/`compose_recall` sao
  **project-scoped** e NAO retornam o acervo plano do time (podem vir vazias);
  o acervo e entregue pelo **auto-recall** (REST `/api/v1/context`). O skill agora
  deixa isso explicito e documenta a auto-ingestao no fim da sessao.
- O **auto-recall** permanece via REST `/api/v1/context` (unico canal confiavel
  para o acervo plano) — confirmado por testes ao vivo (as tools MCP vieram vazias
  para as mesmas queries).

### Notas
- O servidor expoe 32 tools MCP; o `.mcp.json` (URL inalterada) ja da ao Codex
  acesso a todas automaticamente — nada a mudar para novas tools.
- "Memoria infinita" e "dreaming" sao processos de background/config no servidor;
  o papel do cliente e alimentar (ingestao) e usar o recall — ambos cobertos aqui.

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
