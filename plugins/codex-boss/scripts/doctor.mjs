#!/usr/bin/env node
/**
 * doctor.mjs — diagnostico do bridge de memoria (codex-boss).
 *
 * Valida ponta a ponta a conexao com o servidor da equipe:
 *   1. Config efetiva (serverUrl, mcpUrl, projectId, recall, token).
 *   2. GET  /health                -> liveness + versao + checks.
 *   3. POST /api/v1/context        -> recall formatado (caminho do auto-recall).
 *   4. POST /api/v1/search         -> busca crua.
 *   5. GET  /api/v1/documents      -> base alcancavel.
 *   6. POST /mcp (initialize)      -> handshake streamable HTTP (o que o Codex usa).
 *
 * Uso:
 *   node scripts/doctor.mjs            # relatorio legivel
 *   node scripts/doctor.mjs --json     # saida estruturada
 *   node scripts/doctor.mjs --query "InsureMO La Positiva"
 *
 * Exit code 0 se os checks criticos passarem; 1 caso contrario.
 */

import { loadConfig, mcpUrl } from './lib/config.mjs';
import { health, getContext, search, listDocuments, serverVersion } from './lib/client.mjs';
import { request } from './lib/client.mjs';

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const JSON_OUT = process.argv.includes('--json');
const QUERY = arg('--query', 'InsureMO La Positiva');

function preview(obj, n = 160) {
  let s = typeof obj === 'string' ? obj : JSON.stringify(obj);
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function mcpHandshake(cfg) {
  // POST initialize ao /mcp (streamable HTTP). Aceitamos json OU text/event-stream.
  const url = mcpUrl(cfg);
  const base = String(cfg.serverUrl || '').replace(/\/$/, '');
  const pathname = url.slice(base.length) || '/mcp';
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'codex-boss-doctor', version: '0.1.0' },
    },
  };
  const r = await request(pathname, { method: 'POST', cfg, body, timeoutMs: 8000 });
  const text = r.text || '';
  const looksMcp = r.status === 200 && /"result"|"protocolVersion"|serverInfo|event:/i.test(text);
  return { ...r, looksMcp };
}

async function runChecks() {
  const cfg = loadConfig();
  const checks = [];
  const add = (name, ok, detail, critical = false) => checks.push({ name, ok, detail, critical });

  // 1. config
  add(
    'config',
    true,
    `serverUrl=${cfg.serverUrl} | mcp=${mcpUrl(cfg)} | projectId=${cfg.projectId} | ` +
      `recall=${cfg.recall.enabled ? `on(topK=${cfg.recall.topK})` : 'off'} | ` +
      `auth=${cfg.bearerToken ? 'bearer' : 'nenhuma'}`,
  );

  // 2. /health
  const h = await health(cfg);
  add(
    'health',
    h.ok,
    h.ok
      ? `HTTP 200 em ${h.ms}ms | status=${h.json?.status} v${h.json?.version} | checks=${preview(h.json?.checks || {})}`
      : `FALHOU: ${h.error || `HTTP ${h.status}`}`,
    true,
  );

  // 3. /context (recall)
  const ctx = await getContext(QUERY, cfg);
  const ctxText = ctx.json?.context || '';
  add(
    'recall (/api/v1/context)',
    ctx.ok && !!ctxText,
    ctx.ok
      ? (ctxText ? `OK em ${ctx.ms}ms | ${preview(ctxText)}` : 'HTTP 200 mas sem contexto (base vazia para a query?)')
      : `FALHOU: ${ctx.error || `HTTP ${ctx.status}`}`,
    true,
  );

  // 4. /search
  const s = await search(QUERY, cfg);
  const nHits = Array.isArray(s.json?.data) ? s.json.data.length : (Array.isArray(s.json?.results) ? s.json.results.length : null);
  add(
    'search (/api/v1/search)',
    s.ok,
    s.ok ? `OK em ${s.ms}ms | hits=${nHits ?? '?'}` : `FALHOU: ${s.error || `HTTP ${s.status}`}`,
  );

  // 5. /documents
  const d = await listDocuments(cfg);
  let docCount = null;
  if (d.json) {
    if (Array.isArray(d.json)) docCount = d.json.length;
    else if (Array.isArray(d.json.data)) docCount = d.json.data.length;
    else if (typeof d.json.total === 'number') docCount = d.json.total;
    else if (typeof d.json.count === 'number') docCount = d.json.count;
  }
  add(
    'documents (/api/v1/documents)',
    d.ok,
    d.ok ? `OK em ${d.ms}ms | docs=${docCount ?? '?'} | bytes=${(d.text || '').length}` : `FALHOU: ${d.error || `HTTP ${d.status}`}`,
  );

  // 6. /mcp handshake
  const m = await mcpHandshake(cfg);
  add(
    'mcp handshake (/mcp)',
    m.looksMcp,
    m.looksMcp
      ? `OK em ${m.ms}ms | streamable HTTP respondendo`
      : `Atencao: HTTP ${m.status} | ${m.error || preview(m.text) || 'sem resposta MCP reconhecivel'} ` +
        `(o Codex pode exigir Accept: text/event-stream — VALIDAR no cliente real)`,
  );

  // versao (informativo)
  const v = await serverVersion(cfg);
  if (v.ok) add('server version', true, preview(v.json));

  return { cfg, checks };
}

function reportText({ checks }) {
  const lines = [];
  lines.push('CODEX-BOSS · diagnostico da memoria do time');
  lines.push('='.repeat(52));
  let crit = 0;
  for (const c of checks) {
    const mark = c.ok ? '✓' : (c.critical ? '✗' : '!');
    if (!c.ok && c.critical) crit++;
    lines.push(`${mark} ${c.name}`);
    lines.push(`    ${c.detail}`);
  }
  lines.push('='.repeat(52));
  if (crit === 0) {
    lines.push('Resultado: CONECTADO. O auto-recall e as ferramentas `memory` devem operar.');
  } else {
    lines.push(`Resultado: ${crit} verificacao(oes) critica(s) falhou(aram).`);
    lines.push('Remediacao: confirme que o head esta no ar e alcancavel na LAN');
    lines.push('  (no servidor: run-server.bat; bind 0.0.0.0:38080, nao apenas 127.0.0.1;');
    lines.push('  ajuste serverUrl em config/memory.config.json ou a env MEMORY_SERVER_URL).');
  }
  return { text: lines.join('\n'), crit };
}

async function main() {
  const result = await runChecks();
  if (JSON_OUT) {
    const crit = result.checks.filter((c) => !c.ok && c.critical).length;
    process.stdout.write(JSON.stringify({ ok: crit === 0, ...result }, null, 2));
    process.exitCode = crit === 0 ? 0 : 1;
    return;
  }
  const { text, crit } = reportText(result);
  process.stdout.write(`${text}\n`);
  process.exitCode = crit === 0 ? 0 : 1;
}

main().catch((err) => {
  process.stdout.write(`CODEX-BOSS doctor: erro inesperado — ${err?.message || err}\n`);
  process.exitCode = 1;
});
