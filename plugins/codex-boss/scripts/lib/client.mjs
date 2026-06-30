/**
 * client.mjs — cliente REST do servidor de memoria (native-java).
 *
 * Os hooks/scripts falam com a API REST (/api/v1/*) do MESMO head que o Codex
 * consome via MCP. Endpoints usados (todos no servidor da equipe):
 *   GET  /health                  -> liveness ({ status, version, checks, ... })
 *   POST /api/v1/context          -> recall formatado ({ context: "<markdown>" })
 *   POST /api/v1/search           -> resultados crus ({ data: [...] })
 *   GET  /api/v1/documents        -> lista/contagem de documentos
 *   GET  /api/v1/server/version   -> versao do servidor
 *   GET  /api/v1/server/stats     -> estatisticas
 *
 * Sem dependencias externas: usa o fetch global do Node (>=18). Toda chamada
 * tem timeout e nunca lanca — retorna um envelope uniforme.
 */

import { loadConfig } from './config.mjs';

/**
 * Faz uma requisicao e retorna { ok, status, json, text, error }.
 * Nunca lanca: erros de rede/timeout viram { ok:false, status:0, error }.
 */
export async function request(pathname, { method = 'GET', body, timeoutMs, cfg } = {}) {
  const c = cfg || loadConfig();
  const base = String(c.serverUrl || '').replace(/\/$/, '');
  const url = base + pathname;
  const ctrl = new AbortController();
  const limit = timeoutMs || c.timeoutMs || 12000;
  const timer = setTimeout(() => ctrl.abort(), limit);
  const headers = { 'content-type': 'application/json', connection: 'close' };
  if (c.bearerToken) headers.authorization = `Bearer ${c.bearerToken}`;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { ok: res.ok, status: res.status, json, text, ms: Date.now() - started };
  } catch (err) {
    const error = err && err.name === 'AbortError'
      ? `timeout apos ${limit}ms`
      : (err && err.message) || 'erro de rede';
    return { ok: false, status: 0, json: null, text: '', error, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

export async function health(cfg) {
  const c = cfg || loadConfig();
  return request('/health', { cfg: c, timeoutMs: (c.health && c.health.timeoutMs) || 5000 });
}

export async function getContext(query, cfg) {
  const c = cfg || loadConfig();
  return request('/api/v1/context', {
    method: 'POST',
    cfg: c,
    body: { query, topK: c.recall.topK },
  });
}

export async function search(query, cfg) {
  const c = cfg || loadConfig();
  return request('/api/v1/search', {
    method: 'POST',
    cfg: c,
    body: { query, topK: c.recall.topK },
  });
}

export async function listDocuments(cfg) {
  const c = cfg || loadConfig();
  return request('/api/v1/documents', { cfg: c });
}

export async function serverVersion(cfg) {
  const c = cfg || loadConfig();
  return request('/api/v1/server/version', { cfg: c });
}

export async function serverStats(cfg) {
  const c = cfg || loadConfig();
  return request('/api/v1/server/stats', { cfg: c });
}
