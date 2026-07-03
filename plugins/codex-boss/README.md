# codex-boss — Memory

Plugin para o **Codex CLI** — **v0.1.0**

Bridge de **memoria semantica do time** para o Codex. Conecta-se ao servidor MCP
da equipe (native-java, GPU, modelo de embedding granite) **via HTTP**, faz
**auto-recall** de contexto a cada prompt e traz **ferramentas de diagnostico**.
Nao sobe processo/jar local — aponta direto para o head HTTP da equipe.

> Irmao do `claude-code-boss` (Claude Code), no mesmo estilo: hooks embutidos,
> health-probe que instrui a subir o servidor se cair, config rico e diagnostico.
> A diferenca: o Codex conecta no MCP **remoto** nativamente (o CRBB dava spawn
> de jar local).

---

## Arquitetura

```mermaid
flowchart LR
  subgraph Maquina do dev (Codex CLI)
    A[Codex] -->|.mcp.json url| B[(MCP client)]
    A -->|hooks: SessionStart / UserPromptSubmit| H[scripts node]
  end
  B -->|streamable HTTP /mcp| S
  H -->|REST /api/v1/context, /search, /health| S
  subgraph Servidor da equipe (LAN fechada)
    S[native-java MCP\nGPU CUDA · :38080]
    S --> DB[(memory.db\n~/.mcp-memory)]
  end
```

- **`.mcp.json`** registra o servidor `memory` (transporte streamable HTTP) — o
  Codex passa a expor as **32 tools** do servidor ao modelo automaticamente
  (compose_recall, ingest_conversation, search_memory, ...). A URL fixa significa
  que novas tools do servidor aparecem sem mudar o plugin.
- **Hooks** (`hooks/hooks.json`, auto-descobertos) sao scripts Node que falam com
  o mesmo head via REST **e** via MCP:
  - `SessionStart` → `scripts/session-start.mjs` → `/health` (avisa se cair).
  - `UserPromptSubmit` → `scripts/recall.mjs` → `/api/v1/context` (auto-recall do
    acervo do time).
  - `Stop` → `scripts/ingest-session.mjs` → tool MCP `ingest_conversation`
    (auto-ingestao da sessao; alimenta a memoria de longo prazo e o "dreaming").

> **Escopo do recall (importante):** o acervo plano do time (ex.: La Positiva) e
> servido pela API REST `/api/v1/context`. As tools MCP `search_memory` /
> `get_context` / `compose_recall` sao **project-scoped** e podem vir vazias para
> esse acervo — por isso o auto-recall usa REST, nao as tools MCP.

---

## Pre-requisitos

- **Codex CLI** instalado (testado com a serie 0.141).
- **Node.js 18+** no `PATH` do sistema (o Codex dispara os hooks com `node`).
- **Servidor de memoria do time** no ar e **alcancavel na LAN**
  (`http://192.168.18.13:38080` por padrao).

---

## Instalacao (via marketplace)

Este plugin e distribuido pelo marketplace **`allansantos-plugins`** (na raiz
deste repositorio, em `.agents/plugins/marketplace.json`).

```bash
# 1. registrar o marketplace (git ou caminho local)
codex plugin marketplace add AllanSantos-DV/codex-boss --ref main
#    (ou, local:)  codex plugin marketplace add ./caminho/para/codex-boss

# 2. instalar o plugin (ou ja vem auto-instalado por INSTALLED_BY_DEFAULT)
codex plugin add codex-boss@allansantos-plugins

# 3. habilitar features (uma vez por maquina), se necessario:
#    em ~/.codex/config.toml
#    [features]
#    plugins = true
#    hooks = true
```

> O `codex plugin add` injeta `[plugins."codex-boss@allansantos-plugins"] enabled = true`
> no `config.toml` automaticamente — o usuario nao edita o MCP/hooks na mao.

---

## Configuracao

A URL do MCP fica em **`.mcp.json`** (estatica). Os parametros usados pelos
hooks/scripts ficam em **`config/memory.config.json`** e podem ser sobrepostos
por **variaveis de ambiente** (precedencia: env > arquivo > defaults):

| Chave (arquivo) | Env override | Default | Descricao |
|---|---|---|---|
| `serverUrl` | `MEMORY_SERVER_URL` | `http://192.168.18.13:38080` | Base REST/MCP do head |
| `projectId` | `MEMORY_PROJECT_ID` | `la-positiva` | Projeto logico |
| `recall.topK` | `MEMORY_TOP_K` | `6` | Itens no recall |
| `recall.enabled` | `MEMORY_RECALL=off` | `true` | Liga/desliga auto-recall |
| `ingest.enabled` | `MEMORY_INGEST=off` | `true` | Liga/desliga auto-ingestao da sessao |
| `ingest.consumerId` | `MEMORY_CONSUMER_ID` | `codex-<hostname>` | Identifica a origem na ingestao |
| `ingest.maxCharsPerBatch` | — | `60000` | Teto por lote enviado ao `ingest_conversation` |
| `bearerTokenEnvVar` | (nomeia a env do token) | `MEMORY_BEARER_TOKEN` | Auth opcional (ver abaixo) |

**Trocar o endereco do servidor:** edite `serverUrl` em `config/memory.config.json`
**e** a `url` em `.mcp.json` (precisam apontar para o mesmo head), ou exporte
`MEMORY_SERVER_URL` para os scripts.

**Autenticacao (futuro):** hoje a rede e fechada e o servidor nao exige auth.
Quando houver, defina um token na env nomeada por `bearerTokenEnvVar` (ex.:
`MEMORY_BEARER_TOKEN`) e adicione `"bearer_token_env_var": "MEMORY_BEARER_TOKEN"`
ao bloco do servidor em `.mcp.json`.

---

## O que o plugin entrega

### Hooks (auto-recall + saude + auto-ingestao)
- **SessionStart** — verifica `/health`. Silencioso se OK; injeta aviso acionavel
  se o servidor estiver inacessivel.
- **UserPromptSubmit** — busca contexto em `/api/v1/context` e injeta no turno.
  Prompt curto ou recall desligado → silencio. Servidor fora do ar → 1 aviso por
  cooldown (nao polui).
- **Stop** — ingere a sessao na memoria via a tool MCP `ingest_conversation`.
  Le o rollout `.jsonl` do Codex, extrai so as mensagens novas (offset por sessao),
  normaliza para `{id, role, text}` e envia. A curadoria roda em background no
  servidor. Desligavel com `MEMORY_INGEST=off`.

### Comandos
- `/memory-doctor` — diagnostico completo da conexao.
- `/memory-search <termo>` — busca na base e resume.
- `/memory-status` — veredito rapido CONECTADO/DESCONECTADO.

### Skill
- `memory` — orienta o modelo a recuperar conhecimento do time quando util.

### Diagnostico (CLI)
```bash
node scripts/doctor.mjs            # relatorio legivel
node scripts/doctor.mjs --json     # saida estruturada
node scripts/doctor.mjs --query "InsureMO"
npm run test                       # smoke test dos hooks (sem servidor)
```
O doctor valida: `/health`, recall (`/context`), `/search`, `/documents` e o
**handshake `/mcp`** (o canal que o Codex usa).

---

## Auto-update

O marketplace e um repositorio **git**. Para publicar uma nova versao:

1. edite o codigo e **suba a `version`** em `.codex-plugin/plugin.json` (+ CHANGELOG).
2. `git commit && git push`.
3. nas maquinas do time:
   ```bash
   codex plugin marketplace upgrade allansantos-plugins
   ```
   (faz `git pull` do snapshot e detecta a nova versao).

---

## Troubleshooting

| Sintoma | Causa provavel | Acao |
|---|---|---|
| `/memory-doctor` falha em `health` | head fora do ar / inalcancavel | suba `run-server.bat`; confira a rede |
| health OK na maquina do servidor, mas falha nos outros | bind em `127.0.0.1` | rebinde para `0.0.0.0:38080` |
| recall nunca injeta contexto | recall desligado / prompt curto / base vazia | `MEMORY_RECALL=on`, teste com `/memory-search` |
| handshake `/mcp` "atencao" | cliente exige `Accept: text/event-stream` | validar no Codex real (ver Limitacoes) |

---

## Limitacoes / a validar no Codex real

- Shape exato da saida de hook que injeta contexto (`hookSpecificOutput.additionalContext`)
  — ponto unico em `scripts/lib/hook-io.mjs` se precisar ajustar.
- Nome do campo do prompt no payload de `UserPromptSubmit` (tratamos varias chaves).
- Se `codex plugin marketplace upgrade` reinstala o plugin automaticamente.
- `.mcp.json` com `bearer_token_env_var` (confirmado por CLI; validar no plugin).
