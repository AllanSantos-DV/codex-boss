#!/usr/bin/env node
/**
 * selftest-scope.mjs — teste unitario do escopo de projeto no recall.
 *
 * Mocka o `fetch` global para capturar o corpo enviado por getContext/search e
 * verifica que `metadata.project_id` e incluido SO quando ha projectId nao-vazio
 * (guard contra filtro vazio). Nao toca a rede.
 */

import { getContext, search } from './lib/client.mjs';

function makeCfg(projectId) {
  return {
    serverUrl: 'http://127.0.0.1:59999',
    mcpPath: '/mcp',
    projectId,
    recall: { topK: 6 },
    timeoutMs: 1000,
    bearerToken: '',
  };
}

let captured = null;
globalThis.fetch = async (url, opts) => {
  captured = { url, body: opts && opts.body ? JSON.parse(opts.body) : null };
  return { ok: true, status: 200, text: async () => JSON.stringify({ context: '' }) };
};

let fail = 0;
function check(name, cond, extra) {
  const tag = cond ? 'OK  ' : 'FAIL';
  if (!cond) fail++;
  process.stdout.write(`${tag} ${name}${extra ? ' | ' + extra : ''}\n`);
}

// 1. projectId setado -> body.metadata.project_id presente
await getContext('q', makeCfg('la-positiva'));
check(
  'getContext com projectId envia metadata.project_id=la-positiva',
  captured && captured.body && captured.body.metadata && captured.body.metadata.project_id === 'la-positiva',
  JSON.stringify(captured && captured.body && captured.body.metadata),
);

// 2. projectId vazio -> SEM metadata (recall abrangente)
await getContext('q', makeCfg(''));
check(
  'getContext projectId="" NAO envia metadata',
  captured && captured.body && captured.body.metadata === undefined,
  JSON.stringify(captured && captured.body),
);

// 3. projectId so-espacos -> SEM metadata (guard trim)
await getContext('q', makeCfg('   '));
check(
  'getContext projectId="   " NAO envia metadata',
  captured && captured.body && captured.body.metadata === undefined,
  JSON.stringify(captured && captured.body),
);

// 4. projectId null/ausente -> SEM metadata
await getContext('q', makeCfg(null));
check(
  'getContext projectId=null NAO envia metadata',
  captured && captured.body && captured.body.metadata === undefined,
  JSON.stringify(captured && captured.body),
);

// 4b. valor real com espacos ao redor -> trim: envia so o valor limpo
await getContext('q', makeCfg('  la-positiva  '));
check(
  'getContext projectId="  la-positiva  " envia trimmed "la-positiva"',
  captured && captured.body && captured.body.metadata && captured.body.metadata.project_id === 'la-positiva',
  JSON.stringify(captured && captured.body && captured.body.metadata),
);

// 5. search() espelha getContext
await search('q', makeCfg('la-positiva'));
check(
  'search com projectId envia metadata.project_id',
  captured && captured.body && captured.body.metadata && captured.body.metadata.project_id === 'la-positiva',
  JSON.stringify(captured && captured.body && captured.body.metadata),
);

// 6. query e topK preservados
await getContext('minha busca', makeCfg('p1'));
check(
  'query e topK preservados no body',
  captured && captured.body && captured.body.query === 'minha busca' && captured.body.topK === 6,
);

process.stdout.write(fail === 0 ? '\nselftest-scope: todos passaram\n' : `\nselftest-scope: ${fail} falha(s)\n`);
process.exit(fail === 0 ? 0 : 1);
