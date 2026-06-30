---
name: memory
description: Memoria semantica compartilhada do time, servida por um servidor MCP (native-java, GPU). Use quando o usuario perguntar o que o time/base ja sabe sobre um assunto, pedir contexto/historico de um projeto (ex.: InsureMO, La Positiva), ou quando recuperar conhecimento previo ajudar a responder. O plugin tambem injeta contexto relevante automaticamente a cada prompt (auto-recall).
disable-model-invocation: false
---

# Memoria do time (Codex Boss)

## Visao geral

Este plugin conecta o Codex ao **servidor de memoria semantica do time** via HTTP
(transporte MCP streamable em `/mcp`, mais a API REST `/api/v1/*`). A base e curada
e fica no head da equipe (GPU, modelo de embedding granite). O Codex **nao** sobe
nenhum processo local — apenas consome o servidor remoto.

## Quando usar

- O usuario pergunta "o que ja sabemos sobre X?", pede historico/decisoes de um projeto.
- Voce precisa de contexto previo para implementar/decidir algo do dominio do time.
- O usuario menciona temas da base (ex.: InsureMO, La Positiva, modelos de dados, regras).

## Como recuperar

1. **Ferramentas MCP `memory`**: prefira as ferramentas expostas pelo servidor
   `memory` (busca/contexto/gravacao) para consultar a base.
2. **Auto-recall**: a cada prompt, o hook `UserPromptSubmit` ja injeta o contexto
   relevante automaticamente — leve-o em conta antes de responder.
3. **Diagnostico**: se a memoria parecer indisponivel, rode `/memory-doctor`.

## Boas praticas

- Cite as origens (documentos) ao usar o que veio da base.
- A base e conhecimento do time, nao verdade absoluta — confirme pontos criticos.
- Se nada relevante for encontrado, diga claramente; nao invente contexto.
