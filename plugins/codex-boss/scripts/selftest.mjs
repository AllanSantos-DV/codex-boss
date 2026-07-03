#!/usr/bin/env node
/**
 * selftest.mjs — smoke test local dos hooks, SEM depender do servidor.
 *
 * Aponta os scripts para uma porta morta (servidor "down") e verifica que cada
 * hook:
 *   - termina (nao trava) dentro do timeout;
 *   - emite SEMPRE JSON valido no stdout (envelope de hook ou `{}`).
 *
 * Nao valida o caminho "servidor no ar" (isso e papel do `doctor.mjs` contra o
 * head real). Exit code 0 se todos passarem.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runHook(script, payload) {
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts', script)], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    timeout: 20000,
    env: {
      ...process.env,
      // porta morta -> conexao recusada rapido = caminho "servidor down"
      MEMORY_SERVER_URL: 'http://127.0.0.1:1',
      // dataDir isolado para nao colidir com cooldown real
      CLAUDE_PLUGIN_DATA: path.join(ROOT, '.runtime', 'selftest'),
    },
  });
}

const cases = [
  ['session-start.mjs', { hook_event_name: 'SessionStart' }, 'SessionStart (down -> aviso JSON)'],
  ['recall.mjs', { hook_event_name: 'UserPromptSubmit', prompt: 'contexto sobre InsureMO La Positiva' }, 'UserPromptSubmit (down -> aviso/empty JSON)'],
  ['recall.mjs', { hook_event_name: 'UserPromptSubmit', prompt: 'oi' }, 'UserPromptSubmit (prompt curto -> {})'],
  ['ingest-session.mjs', { hook_event_name: 'Stop', session_id: 's1' }, 'Stop (sem transcript_path -> {})'],
  ['ingest-session.mjs', { hook_event_name: 'Stop', session_id: 's1', transcript_path: 'Z:\\nao\\existe.jsonl' }, 'Stop (transcript inexistente -> {})'],
];

let fail = 0;
for (const [script, payload, name] of cases) {
  const r = runHook(script, payload);
  const out = (r.stdout || '').trim();
  let validJson = false;
  try { JSON.parse(out); validJson = true; } catch { /* invalido */ }
  const exited = r.status === 0 || r.status === null;
  const pass = validJson && exited && !r.error;
  if (!pass) fail++;
  const tag = pass ? 'OK  ' : 'FAIL';
  const detail = r.error ? `erro=${r.error.message || r.error}` : `exit=${r.status} json=${validJson} out=${out.slice(0, 70)}`;
  process.stdout.write(`${tag} ${name} | ${detail}\n`);
}

process.stdout.write(fail === 0 ? '\nselftest: todos passaram\n' : `\nselftest: ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
