# /memory-status

Mostra um resumo rapido do estado da memoria do time (sem detalhar todos os checks).

## Workflow

1. Rode, a partir da raiz do plugin `codex-boss`:
   ```bash
   node ./scripts/doctor.mjs --json
   ```
2. A partir do JSON, reporte de forma curta:
   - servidor alcancavel? (`health.ok`)
   - versao do servidor
   - recall funcionando? (check `recall`)
   - handshake `/mcp` ok?
   - `serverUrl` em uso.
3. Uma linha de veredito: **CONECTADO** ou **DESCONECTADO** + a acao principal se desconectado.
