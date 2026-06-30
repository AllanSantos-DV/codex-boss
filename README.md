# codex-boss

Marketplace **`allansantos-plugins`** para o **Codex CLI** — irmao do
`claude-code-boss`. Hoje publica um plugin:

| Plugin | O que faz |
|---|---|
| [**codex-boss**](./plugins/codex-boss) | Bridge de memoria semantica do time: conecta no servidor MCP da equipe via HTTP, com auto-recall de contexto e ferramentas de diagnostico. Nao sobe jar local. |

## Instalacao rapida

```bash
# registrar o marketplace (git)
codex plugin marketplace add AllanSantos-DV/codex-boss --ref main
# instalar (ou ja vem por INSTALLED_BY_DEFAULT)
codex plugin add codex-boss@allansantos-plugins
```

Detalhes, configuracao, hooks, comandos e diagnostico: veja o
[README do plugin](./plugins/codex-boss/README.md).

## Estrutura

```text
codex-boss/
├── .agents/plugins/
│   └── marketplace.json          # marketplace "allansantos-plugins"
└── plugins/
    └── codex-boss/               # o plugin (manifest, .mcp.json, hooks, scripts, ...)
```

## Auto-update

O marketplace e um repo git; novas versoes chegam ao time com:

```bash
codex plugin marketplace upgrade allansantos-plugins
```

## Licenca

MIT © Allan Santos
