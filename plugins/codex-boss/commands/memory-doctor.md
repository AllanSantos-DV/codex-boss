# /memory-doctor

Diagnostica a conexao do Codex com o servidor de memoria semantica do time (plugin **codex-boss**).

## Workflow

1. Rode o diagnostico no shell, a partir da raiz do plugin `codex-boss`:
   ```bash
   node ./scripts/doctor.mjs
   ```
   Se o cwd nao for a raiz do plugin, localize-o (ex.: a pasta do plugin instalado em `~/.codex/plugins/...` ou o checkout local do marketplace) e rode `node <plugin>/scripts/doctor.mjs`.
2. Apresente o relatorio ao usuario, destacando: status do `/health`, versao do servidor, se o **recall** (`/api/v1/context`) retornou contexto, contagem de documentos e o **handshake `/mcp`**.
3. Se houver falha critica, oriente a remediacao:
   - O head precisa estar no ar (no servidor: `run-server.bat`).
   - O bind deve ser acessivel na LAN (`0.0.0.0:38080`), nao apenas `127.0.0.1`.
   - Ajuste `serverUrl` em `config/memory.config.json` ou exporte `MEMORY_SERVER_URL`.

## Notas

- Para saida estruturada: `node ./scripts/doctor.mjs --json`.
- Para testar com outra consulta: `node ./scripts/doctor.mjs --query "sua busca"`.
