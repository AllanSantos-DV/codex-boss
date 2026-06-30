# /memory-search

Busca na memoria semantica do time (base curada no servidor da equipe) e resume os achados.

## Arguments

- `$ARGUMENTS`: o termo ou pergunta a buscar.

## Workflow

1. Prefira as ferramentas MCP do servidor `memory` (expostas por este plugin via `.mcp.json`) para buscar por `$ARGUMENTS`.
2. Alternativa por linha de comando (a partir da raiz do plugin `codex-boss`):
   ```bash
   node ./scripts/doctor.mjs --query "$ARGUMENTS"
   ```
   (o bloco de recall do relatorio mostra o contexto relevante).
3. Resuma os resultados citando os documentos/origens. Se nada relevante voltar, diga isso claramente — nao invente.

## Nota

A base e compartilhada e curada; trate o conteudo como conhecimento do time, nao como verdade absoluta. Confirme pontos criticos.
