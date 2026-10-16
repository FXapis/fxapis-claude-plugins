# fxapis for Claude Code

Read and trade your MetaTrader 5 accounts from Claude Code through [fxapis](https://fxapis.com). Every trade is confirmed.

```
/plugin marketplace add FXapis/fxapis-claude-plugins
/plugin install fxapis@fxapis
```

The plugin brings:

- **The fxapis MCP server** (`https://api.fxapis.com/mcp`). The first tool call signs you in to fxapis in your browser. You choose read-only or trading, per account, and you can revoke it in the fxapis console at any time. An API key is optional, for unattended agents.
- **The `trading-mt5-safely` skill:**
  - demo before live;
  - one explicit yes per trade;
  - idempotency keys;
  - never resending an unresolved order;
  - closed markets, sizing, drawdowns.
- **Commands:** `/fxapis:status`, `/fxapis:positions` and `/fxapis:connect-help`.
- **A confirmation hook.** Claude Code asks before every fxapis trade, even in auto-accept mode, showing account, symbol, side and volume. Trades on live accounts are refused until you turn on `allowLiveTrading`.

The skill is also available as a zip for claude.ai, from the [docs](https://docs.fxapis.com/guides/claude-plugin).

## Contributing

Issues and pull requests are welcome. This repository is published from the fxapis monorepo, so accepted changes are applied there and then copied here.

## Development

```
npm test                                   # hook and manifest tests
claude plugin validate . --strict          # the marketplace
claude plugin validate ./plugins/fxapis --strict
claude --plugin-dir ./plugins/fxapis       # try it locally
```
