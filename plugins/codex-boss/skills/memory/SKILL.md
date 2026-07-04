---
name: memory
description: Memoria semantica compartilhada do time, servida por um servidor MCP (native-java, GPU). O contexto relevante do time e INJETADO AUTOMATICAMENTE a cada prompt por um hook (auto-recall) e a sessao e INGERIDA AUTOMATICAMENTE no fim de cada turno. Use este conhecimento ao responder sobre temas do time (ex.: InsureMO, La Positiva, modelos de dados, regras de negocio).
disable-model-invocation: false
---

# Memoria do time (Codex Boss)

## Como funciona (automatico)

Este plugin conecta o Codex ao **servidor de memoria do time** (GPU, native-java) e opera em dois automatismos — voce **nao precisa chamar nada manualmente**:

1. **Auto-recall (a cada prompt).** Um hook busca o contexto relevante do acervo
   do time e o injeta no turno como `[CODEX-BOSS] Contexto recuperado...`. Leve
   esse contexto em conta ao responder; cite as origens quando usar.
2. **Auto-ingestao (fim de cada turno).** Um hook envia a conversa para a
   curadoria do servidor (`ingest_conversation`), que documenta a sessao em
   background. Isso alimenta a memoria de longo prazo e a consolidacao
   ("dreaming"). Nao e preciso pedir para "salvar" nada.

## Importante sobre as ferramentas MCP `memory`

O servidor expoe varias tools MCP (search_memory, get_context, compose_recall,
add_document, ...). **O acervo do time e escopado por projeto** (campo
`metadata.project_id`):

- O **auto-recall** (a cada prompt) ja envia o `project_id` do time
  automaticamente — o bloco `[CODEX-BOSS] Contexto recuperado...` ja vem
  escopado ao acervo do time. Confie nele.
- Ao chamar as tools MCP **manualmente**, passe o filtro de projeto para receber
  o acervo do time, por exemplo:
  `search_memory({ query: "...", metadata: { project_id: "la-positiva" } })`
  ou `get_context({ query: "...", metadata: { project_id: "la-positiva" } })`.
  **Sem** esse filtro a busca e abrangente (pode misturar projetos ou vir vazia
  para o acervo do time). Ajuste o `project_id` ao projeto em uso.
- `compose_recall` traz memoria **procedural/skills** por relevancia (incluindo
  itens promovidos pelo "dreaming"); `add_document` grava conhecimento novo.
- Se uma busca MCP vier vazia, **nao conclua** que o time nao sabe: confirme com
  o contexto ja injetado no prompt, ou rode `/memory-search` (REST ja escopada).

## Quando agir

- O usuario pergunta "o que ja sabemos sobre X?" -> use o contexto auto-injetado;
  se faltar, rode `/memory-search` (que usa a API REST correta do acervo).
- Diagnostico de conexao -> `/memory-doctor`.

## Boas praticas

- Cite os documentos/origens ao usar o que veio da memoria.
- A base e conhecimento do time, nao verdade absoluta — confirme pontos criticos.
- Nao invente contexto: se realmente nao houver informacao, diga isso.
