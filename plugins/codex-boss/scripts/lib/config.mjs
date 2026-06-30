/**
 * config.mjs — resolucao de configuracao do bridge de memoria.
 *
 * Precedencia (maior primeiro):
 *   1. Variaveis de ambiente (MEMORY_SERVER_URL, MEMORY_PROJECT_ID, MEMORY_TOP_K,
 *      MEMORY_RECALL, e o token nomeado por `bearerTokenEnvVar`).
 *   2. config/memory.config.json (ao lado do plugin).
 *   3. Defaults internos (este arquivo).
 *
 * A URL do MCP em si (transporte streamable HTTP que o Codex consome) vive em
 * ../.mcp.json e e estatica. Aqui ficam os parametros que os hooks/scripts usam
 * para falar com a API REST do mesmo servidor.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Raiz do plugin. Preferimos a env var injetada pelo runtime (compat com o
 * ecossistema Claude/Codex); senao, resolvemos a partir deste arquivo
 * (scripts/lib -> raiz do plugin = ../../). Isso torna os scripts robustos
 * independente do cwd com que o hook for disparado.
 */
export const PLUGIN_ROOT = (() => {
  const env = process.env.CLAUDE_PLUGIN_ROOT || process.env.CODEX_PLUGIN_ROOT;
  if (env && !env.includes('${')) return env;
  return path.resolve(HERE, '..', '..');
})();

/** Diretorio duravel para stamps/estado (cooldowns, etc.). */
export const DATA_DIR = (() => {
  const env = process.env.CLAUDE_PLUGIN_DATA || process.env.CODEX_PLUGIN_DATA;
  if (env && !env.includes('${')) return env;
  return path.join(PLUGIN_ROOT, '.runtime');
})();

const DEFAULTS = {
  serverUrl: 'http://192.168.18.13:38080',
  mcpPath: '/mcp',
  projectId: 'la-positiva',
  recall: {
    enabled: true,
    topK: 6,
    maxChars: 1800,
    minQueryChars: 8,
    downWarnCooldownMs: 120000,
  },
  health: {
    timeoutMs: 5000,
  },
  timeoutMs: 12000,
  bearerTokenEnvVar: 'MEMORY_BEARER_TOKEN',
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, over) {
  if (!isObject(over)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (k.startsWith('$')) continue; // ignora chaves de comentario ($comment)
    if (isObject(v) && isObject(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

/**
 * Carrega a configuracao efetiva.
 * @returns {object} cfg com { serverUrl, mcpPath, projectId, recall, health,
 *                             timeoutMs, bearerToken, pluginRoot, dataDir }
 */
export function loadConfig() {
  let fileCfg = {};
  try {
    const p = path.join(PLUGIN_ROOT, 'config', 'memory.config.json');
    fileCfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    // sem arquivo / invalido -> usa defaults
  }

  const cfg = deepMerge(DEFAULTS, fileCfg);

  // overrides por ambiente
  if (process.env.MEMORY_SERVER_URL) cfg.serverUrl = process.env.MEMORY_SERVER_URL;
  if (process.env.MEMORY_PROJECT_ID) cfg.projectId = process.env.MEMORY_PROJECT_ID;
  if (process.env.MEMORY_TOP_K) {
    const n = Number(process.env.MEMORY_TOP_K);
    if (Number.isFinite(n) && n > 0) cfg.recall.topK = n;
  }
  const recallFlag = (process.env.MEMORY_RECALL || '').toLowerCase();
  if (recallFlag === '0' || recallFlag === 'off' || recallFlag === 'false') {
    cfg.recall.enabled = false;
  }

  // token bearer (opcional; rede fechada hoje nao usa auth)
  const tokenVar = cfg.bearerTokenEnvVar || 'MEMORY_BEARER_TOKEN';
  cfg.bearerToken = process.env[tokenVar] || '';

  cfg.pluginRoot = PLUGIN_ROOT;
  cfg.dataDir = DATA_DIR;
  return cfg;
}

/** Monta a URL completa do endpoint MCP (para diagnostico/exibicao). */
export function mcpUrl(cfg) {
  const base = String(cfg.serverUrl || '').replace(/\/$/, '');
  const p = cfg.mcpPath || '/mcp';
  return base + (p.startsWith('/') ? p : `/${p}`);
}
