#!/usr/bin/env node
/**
 * ingest-session.mjs — hook Stop (ingestao cooperativa de sessao).
 *
 * No fim de cada turno, le o transcript do Codex (payload.transcript_path — um
 * rollout .jsonl), extrai as mensagens NOVAS desde a ultima ingestao (offset por
 * sessao) e envia para a tool MCP `ingest_conversation`. O servidor faz discovery
 * de template + curadoria (LLM) em BACKGROUND — isso alimenta a "memoria infinita"
 * e o material de "dreaming". O Codex nao expoe hook do tipo mcp_tool, entao o
 * script fala MCP-HTTP direto no /mcp (initialize -> tools/call).
 *
 * Robustez:
 *   - Incremental: so envia o delta (linhas alem do offset salvo) — Stop dispara
 *     a cada turno; o offset evita reingerir a conversa inteira toda vez.
 *   - Acumula turnos pequenos: se o delta e curto demais, NAO avanca o offset,
 *     deixando juntar com o proximo turno ate ter conteudo util.
 *   - Fail-open/silencioso: qualquer erro (sem transcript, rede, parse) -> `{}`.
 *   - Nunca trava o encerramento do turno (timeout curto + captura total).
 */

import fs from 'node:fs';
import path from 'node:path';
import { readStdin, parsePayload, emitEmpty } from './lib/hook-io.mjs';
import { loadConfig } from './lib/config.mjs';
import { mcpCall } from './lib/client.mjs';

function sanitize(s) {
  return String(s || 'default').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

function offsetFile(dir, sessionId) {
  return path.join(dir, `.ingest-offset-${sanitize(sessionId)}.json`);
}

function readOffset(dir, sessionId) {
  try {
    const raw = fs.readFileSync(offsetFile(dir, sessionId), 'utf-8');
    const j = JSON.parse(raw);
    return Number.isFinite(j.lines) ? j.lines : 0;
  } catch {
    return 0;
  }
}

function writeOffset(dir, sessionId, lines) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(offsetFile(dir, sessionId), JSON.stringify({ lines, at: Date.now() }));
  } catch {
    // best-effort: se nao gravar, no proximo turno reprocessa (idempotente no servidor)
  }
}

/** Texto concatenado de um payload.content[] de mensagem do rollout do Codex. */
function contentText(content) {
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const b of content) {
    if (b && typeof b.text === 'string') parts.push(b.text);
  }
  return parts.join('\n').trim();
}

/** Wrapper de contexto do Codex (nao e fala real do usuario)? */
function isNoise(text) {
  const t = String(text || '').trimStart();
  return (
    t.startsWith('<environment_context') ||
    t.startsWith('<permissions') ||
    t.startsWith('<user_instructions') ||
    t.startsWith('<system')
  );
}

/**
 * Monta o delta a ingerir desde `fromLine`, ate o teto de caracteres.
 *
 * NORMALIZA cada mensagem user/assistant do rollout .jsonl do Codex para uma
 * linha jsonl trivial `{id, role, text}`. Motivo: o rollout do Codex NAO tem um
 * id por mensagem, e o discovery do servidor exige `id_field` para parear/dedup —
 * sem id, o parser extrai zero pares ("discovery failed; raw mode"). Com o
 * `{id, role, text}`, o discovery infere o template de primeira e extrai os pares.
 * O `id` deriva do indice da LINHA no transcript (estavel entre turnos → dedup).
 *
 * Descarta ruido (session_meta/event_msg/function_call, roles developer/system,
 * e wrappers <environment_context>/<permissions>).
 *
 * @returns {{ text: string, consumed: number, hasSignal: boolean }}
 */
function buildDelta(lines, fromLine, sessionId, maxChars) {
  const out = [];
  let total = 0;
  let i = fromLine;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!line.trim()) continue;

    let evt;
    try { evt = JSON.parse(line); } catch { continue; }
    if (!evt || evt.type !== 'response_item') continue;
    const p = evt.payload;
    if (!p || p.type !== 'message') continue;
    if (p.role !== 'user' && p.role !== 'assistant') continue;
    const text = contentText(p.content);
    if (!text) continue;
    if (p.role === 'user' && isNoise(text)) continue;

    const norm = JSON.stringify({ id: `${sessionId}-L${i}`, role: p.role, text });
    if (total + norm.length > maxChars && out.length > 0) break;
    out.push(norm);
    total += norm.length + 1;
  }
  return { text: out.join('\n'), consumed: i, hasSignal: out.length > 0 };
}

async function main() {
  const evt = parsePayload(await readStdin()) || {};
  const cfg = loadConfig();

  if (!cfg.ingest.enabled) { emitEmpty(); return; }

  const transcriptPath = evt.transcript_path || evt.transcriptPath || (evt.input && evt.input.transcript_path);
  const sessionId = evt.session_id || evt.sessionId || 'default';
  if (!transcriptPath) { emitEmpty(); return; }

  let content;
  try {
    content = fs.readFileSync(transcriptPath, 'utf-8');
  } catch {
    emitEmpty();
    return;
  }
  const lines = content.split(/\r?\n/);
  const fromLine = readOffset(cfg.dataDir, sessionId);
  if (fromLine >= lines.length) { emitEmpty(); return; }

  const { text, consumed, hasSignal } = buildDelta(lines, fromLine, sessionId, cfg.ingest.maxCharsPerBatch);

  // Sem mensagem de conversa real no lote (so lifecycle/tool/ruido) ou muito curto:
  // avanca o offset (essas linhas ja foram vistas) mas nao ingere.
  if (!hasSignal || !text || text.length < cfg.ingest.minChars) {
    writeOffset(cfg.dataDir, sessionId, consumed);
    emitEmpty();
    return;
  }

  const r = await mcpCall('ingest_conversation', {
    consumerId: cfg.ingest.consumerId,
    sessionId,
    raw: text,
  }, cfg);

  // r.ok = transporte MCP OK. Avanca o offset para nao reenviar o mesmo trecho
  // (a curadoria roda em background no servidor; re-staging seria desperdicio).
  if (r.ok) {
    writeOffset(cfg.dataDir, sessionId, consumed);
  } else {
    // falha de transporte: nao avanca (tenta de novo no proximo turno). Log discreto.
    try { process.stderr.write(`[codex-boss] ingest falhou: ${r.error || 'erro'}\n`); } catch { /* noop */ }
  }
  emitEmpty();
}

main().catch(() => emitEmpty());
