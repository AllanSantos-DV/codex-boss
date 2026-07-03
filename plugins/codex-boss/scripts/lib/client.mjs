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

/**
 * Extrai o objeto JSON-RPC de uma resposta que pode vir como JSON puro OU como
 * SSE (`event: message\ndata: {...}`). O /mcp streamable HTTP usa SSE.
 */
function parseMcpBody(text) {
  if (!text) return null;
  const t = text.trim();
  try { return JSON.parse(t); } catch { /* tenta SSE */ }
  const m = t.match(/data:\s*(\{[\s\S]*\})\s*$/m);
  if (m) {
    try { return JSON.parse(m[1]); } catch { return null; }
  }
  return null;
}

/**
 * Chama uma tool MCP no /mcp (streamable HTTP): faz `initialize` para obter o
 * `Mcp-Session-Id` e em seguida `tools/call`. Nunca lanca.
 *
 * @returns {Promise<{ok:boolean, result?:object, textContent?:string, status:number, error?:string, ms:number}>}
 *   `textContent` e o texto do primeiro bloco `content[].text` do resultado da tool (comum em tools MCP).
 */
export async function mcpCall(toolName, args = {}, cfg) {
  const c = cfg || loadConfig();
  const base = String(c.serverUrl || '').replace(/\/$/, '');
  const path = c.mcpPath && c.mcpPath.startsWith('/') ? c.mcpPath : `/${c.mcpPath || 'mcp'}`;
  const url = base + path;
  const limit = timeoutForMcp(c);
  const started = Date.now();
  const baseHeaders = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    connection: 'close',
  };
  if (c.bearerToken) baseHeaders.authorization = `Bearer ${c.bearerToken}`;

  async function post(bodyObj, sessionId) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limit);
    try {
      const headers = { ...baseHeaders };
      if (sessionId) headers['mcp-session-id'] = sessionId;
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
        signal: ctrl.signal,
      });
      const text = await res.text();
      return { res, text };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    // 1. initialize -> Mcp-Session-Id
    const init = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'codex-boss', version: '0.2.0' },
      },
    });
    const sessionId = init.res.headers.get('mcp-session-id') || init.res.headers.get('Mcp-Session-Id');

    // 2. tools/call
    const call = await post({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: toolName, arguments: args },
    }, sessionId);

    const rpc = parseMcpBody(call.text);
    if (!rpc) {
      return { ok: false, status: call.res.status, error: 'resposta MCP nao parseavel', ms: Date.now() - started };
    }
    if (rpc.error) {
      return { ok: false, status: call.res.status, error: rpc.error.message || 'erro MCP', ms: Date.now() - started };
    }
    const result = rpc.result || {};
    let textContent = null;
    if (result.content && Array.isArray(result.content)) {
      const first = result.content.find((b) => b && b.type === 'text' && typeof b.text === 'string');
      if (first) textContent = first.text;
    }
    return { ok: true, status: call.res.status, result, textContent, ms: Date.now() - started };
  } catch (err) {
    const error = err && err.name === 'AbortError'
      ? `timeout apos ${limit}ms`
      : (err && err.message) || 'erro de rede';
    return { ok: false, status: 0, error, ms: Date.now() - started };
  }
}

function timeoutForMcp(c) {
  return (c.ingest && c.ingest.timeoutMs) || c.timeoutMs || 15000;
}

/** Lista as tools MCP expostas pelo servidor (para diagnostico). */
export async function mcpToolsList(cfg) {
  const c = cfg || loadConfig();
  const base = String(c.serverUrl || '').replace(/\/$/, '');
  const path = c.mcpPath && c.mcpPath.startsWith('/') ? c.mcpPath : `/${c.mcpPath || 'mcp'}`;
  const url = base + path;
  const limit = c.timeoutMs || 12000;
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    connection: 'close',
  };
  if (c.bearerToken) headers.authorization = `Bearer ${c.bearerToken}`;
  const started = Date.now();
  async function post(bodyObj, sessionId) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), limit);
    try {
      const h = { ...headers };
      if (sessionId) h['mcp-session-id'] = sessionId;
      const res = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(bodyObj), signal: ctrl.signal });
      const text = await res.text();
      return { res, text };
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    const init = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'codex-boss', version: '0.2.0' } } });
    const sid = init.res.headers.get('mcp-session-id');
    const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sid);
    const rpc = parseMcpBody(list.text);
    const names = (rpc && rpc.result && Array.isArray(rpc.result.tools))
      ? rpc.result.tools.map((t) => t.name)
      : [];
    return { ok: names.length > 0, names, status: list.res.status, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, names: [], status: 0, error: (err && err.message) || 'erro', ms: Date.now() - started };
  }
}
