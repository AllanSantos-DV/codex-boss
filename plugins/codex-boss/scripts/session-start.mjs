#!/usr/bin/env node
/**
 * session-start.mjs — hook SessionStart.
 *
 * Sonda a saude do servidor de memoria do time. Espelha a filosofia do
 * claude-code-boss: silencio quando tudo esta OK; quando o servidor esta
 * inacessivel, injeta um aviso acionavel para o agente/usuario subir/abrir o
 * head. Nunca trava o turno (timeout curto, captura de erro total).
 */

import { readStdin, parsePayload, emitEmpty, emitContext, eventName } from './lib/hook-io.mjs';
import { loadConfig } from './lib/config.mjs';
import { health } from './lib/client.mjs';

async function main() {
  const evt = parsePayload(await readStdin()) || {};
  const name = eventName(evt, 'SessionStart');
  const cfg = loadConfig();

  const h = await health(cfg);

  if (!h.ok) {
    emitContext(
      name,
      `[CODEX-BOSS] Servidor de memoria do time INACESSIVEL em ${cfg.serverUrl} ` +
        `(${h.error || `HTTP ${h.status}`}). O auto-recall e as ferramentas MCP \`memory\` ` +
        `ficarao indisponiveis nesta sessao.\n` +
        `Acao: confirme que o head esta no ar e alcancavel na rede local. ` +
        `No servidor da equipe: inicie o \`run-server.bat\` e garanta o bind para a LAN ` +
        `(0.0.0.0), nao apenas 127.0.0.1. Diagnostico completo: \`/memory-doctor\`.`,
    );
    return;
  }

  // Servidor saudavel: sem ruido (o .mcp.json ja expoe as ferramentas ao modelo).
  emitEmpty();
}

main().catch(() => emitEmpty());
