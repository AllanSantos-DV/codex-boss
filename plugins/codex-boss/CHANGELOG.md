# Changelog — codex-boss

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/).

## [0.3.0] — 2026-07-03

Escopo de projeto no auto-recall (client-side, sem qualquer mudanca no servidor).

### Adicionado
- **Recall escopado por projeto.** `getContext`/`search` agora enviam
  `metadata: { project_id: <cfg.projectId> }` no corpo das chamadas REST
  (`/api/v1/context` e `/api/v1/search`). O servidor ja filtra por
  `metadata.project_id` nativamente — o auto-recall passa a trazer o acervo do
  **projeto do time** em vez de resultados abrangentes.
- `scripts/selftest-scope.mjs`: teste unitario (mock de `fetch`) que prova o
  filtro presente com `projectId` e ausente quando vazio/whitespace/null.
  Ligado ao `npm test`.

### Corrigido / Guia
- `skills/memory/SKILL.md`: orienta o modelo a passar
  `metadata: { project_id: "..." }` nas chamadas MCP **manuais**
  (`search_memory`/`get_context`) para receber o acervo do time.
- `README.md` e `scripts/doctor.mjs`: corrigida a nota de escopo que dizia
  (desatualizada) que `/api/v1/context` era global e as tools MCP vinham vazias.
  A verdade: **REST e tools MCP filtram pelo mesmo `metadata.project_id`**; o hook
  usa REST apenas porque o Codex nao tem hook que chame tool MCP direto.
- `scripts/lib/config.mjs`: `MEMORY_PROJECT_ID` passa a ser honrada quando
  **definida**, mesmo vazia (`MEMORY_PROJECT_ID=""` forca recall abrangente).

### Notas
- **Nenhuma alteracao no servidor** (`native-java` permanece na 2.11.5 publicada;
  o head em producao roda 2.11.3). O escopo ja e nativo por `metadata.project_id`.
- **Verificado no servidor real da equipe (2.11.3, 192.168.18.13):** REST
  `/api/v1/context` honra `metadata.project_id`; a base esta 100% tagueada
  `la-positiva` — recall escopado retorna a base (18.901 chars), `project_id`
  inexistente retorna vazio. Confirma o comportamento client-side.
- **Ingestao NAO e escopada por projeto** (limitacao de servidor, fora deste
  release): a tool `ingest_conversation` aceita apenas `consumerId`/`sessionId`/
  `raw` — **nao** aceita `project_id`. Logo, sessoes auto-ingeridas pelo plugin
  caem no projeto default do servidor, nao em `la-positiva`. Escopar a ingestao
  exigiria evoluir o servidor (`native-java`), o que fica para um trabalho futuro.
- Guard: `projectId` vazio/whitespace/null => recall abrangente (sem filtro),
  evitando um filtro vazio que zeraria os resultados.
- `project_id` configuravel por `MEMORY_PROJECT_ID` (env) ou
  `config/memory.config.json` (default `la-positiva`).

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
