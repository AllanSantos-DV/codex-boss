#!/usr/bin/env node
/**
 * recall.mjs — hook UserPromptSubmit (auto-recall).
 *
 * Pega o prompt do usuario, consulta /api/v1/context no servidor de memoria do
 * time e injeta o contexto relevante de volta no turno. Equivalente ao
 * `brain_retrieve_context` do claude-code-boss, mas via REST (o Codex nao tem
 * o handler de hook `mcp_tool`, apenas `command`/`prompt`/`agent`).
 *
 * Regras:
 *   - recall desligado (cfg/env) ou prompt curto demais  -> silencio.
 *   - servidor inacessivel                               -> aviso 1x/cooldown.
 *   - sem contexto relevante                             -> silencio.
 *   - contexto encontrado                                -> injeta (truncado).
 *
 * Nunca trava o turno: timeout por requisicao + captura total de erros.
 */

import { readStdin, parsePayload, emitEmpty, emitContext, eventName } from './lib/hook-io.mjs';
import { loadConfig } from './lib/config.mjs';
import { getContext } from './lib/client.mjs';
import { withinCooldown, stampCooldown } from './lib/cooldown.mjs';

/** Extrai o texto do prompt tolerando variacoes de chave entre runtimes. */
function extractPrompt(evt) {
  if (!evt) return '';
  return (
    evt.prompt ||
    evt.user_prompt ||
    evt.userPrompt ||
    evt.message ||
    (evt.input && (evt.input.prompt || evt.input.text)) ||
    ''
  );
}

function looksEmpty(ctx) {
  if (!ctx) return true;
  const t = String(ctx).trim();
  if (!t) return true;
  // o servidor pode responder um cabecalho sem resultados
  return /no relevant context|nenhum contexto|sem resultados/i.test(t) && t.length < 80;
}

async function main() {
  const evt = parsePayload(await readStdin()) || {};
  const name = eventName(evt, 'UserPromptSubmit');
  const cfg = loadConfig();

  if (!cfg.recall.enabled) {
    emitEmpty();
    return;
  }

  const prompt = String(extractPrompt(evt) || '').trim();
  if (prompt.length < cfg.recall.minQueryChars) {
    emitEmpty();
    return;
  }

  const r = await getContext(prompt, cfg);

  // Servidor fora do ar: avisa no maximo 1x por cooldown para nao poluir.
  if (r.status === 0) {
    if (!withinCooldown(cfg.dataDir, 'recall-down', cfg.recall.downWarnCooldownMs)) {
      stampCooldown(cfg.dataDir, 'recall-down');
      emitContext(
        name,
        `[CODEX-BOSS] Memoria do time indisponivel (${r.error}) em ${cfg.serverUrl}; ` +
          `seguindo sem auto-recall. Rode \`/memory-doctor\` para diagnosticar.`,
      );
      return;
    }
    emitEmpty();
    return;
  }

  if (!r.ok || !r.json || !r.json.context || looksEmpty(r.json.context)) {
    emitEmpty();
    return;
  }

  let ctx = String(r.json.context).trim();
  if (ctx.length > cfg.recall.maxChars) {
    ctx = `${ctx.slice(0, cfg.recall.maxChars)}\n…(contexto truncado em ${cfg.recall.maxChars} chars)`;
  }

  emitContext(
    name,
    `[CODEX-BOSS] Contexto recuperado da memoria do time (servidor ${cfg.serverUrl}):\n\n${ctx}\n\n` +
      `(Use as ferramentas MCP \`memory\` para buscar/gravar mais detalhes.)`,
  );
}

main().catch(() => emitEmpty());
