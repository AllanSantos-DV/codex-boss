/**
 * cooldown.mjs — throttle simples baseado em arquivo de stamp.
 *
 * Usado para nao repetir avisos (ex.: "servidor inacessivel") a cada prompt.
 * Best-effort: qualquer erro de I/O e tratado como "fora do cooldown".
 */

import fs from 'node:fs';
import path from 'node:path';

function stampPath(dir, key) {
  return path.join(dir, `.cooldown-${key}`);
}

/** true se a ultima marcacao de `key` ocorreu ha menos de `ms`. */
export function withinCooldown(dir, key, ms) {
  try {
    const f = stampPath(dir, key);
    if (!fs.existsSync(f)) return false;
    const last = parseInt(fs.readFileSync(f, 'utf-8'), 10);
    return Number.isFinite(last) && (Date.now() - last) < ms;
  } catch {
    return false;
  }
}

/** Marca `key` como executado agora. */
export function stampCooldown(dir, key) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(stampPath(dir, key), String(Date.now()));
  } catch {
    // sem acao: throttle e best-effort
  }
}
