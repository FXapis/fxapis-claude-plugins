---
description: How to connect fxapis to Claude Code, and how to change what it may do
---

Explain, briefly and in this order:

1. **Signing in.** The first fxapis tool call opens the browser on fxapis's sign-in page. Approve **read access**. Turn on **Trading** only for the accounts you want, which needs two-factor. Then return to Claude Code.
2. **Live accounts.** This plugin refuses trades on live accounts until `allowLiveTrading` is on: `/plugin` → fxapis → configure. Every trade is confirmed in Claude Code either way.
3. **An API key instead.** For an agent that runs unattended, create a key at https://fxapis.com/dashboard/keys with only the scopes it needs, and set it as the plugin's `api_key` option.
4. **Revoking.** At https://fxapis.com/dashboard/keys, under Connected apps, Revoke ends access at once.
5. **More.** https://docs.fxapis.com/guides/claude-plugin

Do not call any fxapis tool for this.
