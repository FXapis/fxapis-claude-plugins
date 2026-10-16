---
description: Show open positions across your fxapis MT5 accounts
---

Call the fxapis `list_accounts` tool. For each account in state `ready`, call `get_account_overview` with `top: 20`.

Show one section per account, headed by its label, login and environment (LIVE in capitals): balance, equity, the number of open positions and their total P/L. Under it, list the positions: ticket, symbol, side, volume, open price and P/L. Then give the total P/L across accounts, per currency.

Accounts not ready are listed at the end with their state. Call no tool that trades.
