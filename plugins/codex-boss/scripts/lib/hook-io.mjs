/**
 * hook-io.mjs — helpers de stdin/stdout para hooks do Codex.
 *
 * Invariante de I/O dos hooks: ler um payload JSON do stdin e escrever JSON
 * (ou `{}` vazio) no stdout. Para INJETAR contexto de volta no agente, emitimos
 * `{ hookSpecificOutput: { hookEventName, additionalContext } }` — o mesmo
 * envelope usado pelo Claude Code / Copilot Chat e aceito pelo runtime do Codex.
 *
 * [VALIDAR no Codex] o nome do campo de saida que injeta contexto. Se o Codex
 * usar um shape diferente, ajuste apenas `emitContext` aqui (ponto unico).
 */

/**
 * Le todo o stdin como texto. Resolve cedo se nao houver pipe (TTY) e tem um
 * timeout de seguranca para nunca travar o turno do agente.
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
export function readStdin(timeoutMs = 2500) {
  return new Promise((resolve) => {
    let data = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(data);
    };
    try {
      if (process.stdin.isTTY) {
        finish();
        return;
      }
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
      setTimeout(finish, timeoutMs);
    } catch {
      finish();
    }
  });
}

/**
 * Faz o parse do payload do stdin; retorna null se vazio/invalido.
 * @param {string} raw
 * @returns {object|null}
 */
export function parsePayload(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Saida silenciosa (sem contexto, sem ruido). */
export function emitEmpty() {
  process.stdout.write('{}');
}

/**
 * Injeta `additionalContext` de volta no agente para o evento dado.
 * @param {string} eventName  ex.: "UserPromptSubmit", "SessionStart"
 * @param {string} additionalContext
 */
export function emitContext(eventName, additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext,
    },
  }));
}

/**
 * Resolve o nome do evento a partir do payload, tolerando variacoes de chave
 * entre runtimes (snake_case / camelCase).
 * @param {object} evt
 * @param {string} fallback
 * @returns {string}
 */
export function eventName(evt, fallback) {
  if (!evt) return fallback;
  return evt.hook_event_name || evt.hookEventName || evt.event || fallback;
}
