# fxapis error codes

Generated from the MCP server's next steps by `pnpm skill:error-codes`. Do not edit by hand.

Every fxapis tool error starts with its code, for example `ORDER_UNRESOLVED (HTTP 409): …`. Do what the next step says.

| Code | Next step |
|---|---|
| `ACCOUNT_EXECUTING` | An order is in flight on this account. Wait for it to settle, then try again. |
| `ACCOUNT_LEASED_ELSEWHERE` | The account is busy being brought online or taken offline. Retry in a few seconds. |
| `ACCOUNT_NOT_FOUND` | No such account in this workspace. Call list_accounts to find the right id. |
| `ACCOUNT_NOT_READY` | The account is not online. Call bring_accounts_online, poll get_account_status until `ready`, then retry with the same idempotency_key. |
| `CAPABILITY_UNAVAILABLE` | This account's terminal does not support this yet; it will after its next update. Do not retry now. For figures, call get_account_figures without fresh; for a price, list_positions shows each open position's currentPrice. |
| `CREDIT_LIMIT` | The workspace's unbilled usage (extra accounts, always-on) would pass what its payments cover; it grows as renewals and usage charges are paid. Do not retry; tell the user. |
| `FEATURE_NOT_IN_PLAN` | The workspace's plan does not include this. Tell the user. |
| `IDEMPOTENCY_IN_FLIGHT` | The first request with this idempotency_key is still running. Wait a moment and retry with the SAME key. |
| `IDEMPOTENCY_KEY_REUSED` | That idempotency_key was already used for a different request. Use a new key only if this really is a new, separate order. |
| `INSTRUMENT_NOT_MAPPED` | Call list_account_instruments with query to see this broker's candidate symbols, and ask the user which one to use. |
| `INTERNAL_ERROR` | Something failed on the fxapis side. Try again shortly; quote the requestId if it persists. |
| `INVALID_REQUEST` | The request was not valid. Read the message and details, fix the arguments, and try again. |
| `KEY_LIMIT_EXCEEDED` | This connection's limits refuse it: details name the limit (account, symbol, volume or orders per day). Tell the user; do not split the order to get around it. A connection made by signing in may change only the accounts picked when it was connected; for another account, the user reconnects fxapis and picks it. |
| `MISSING_SCOPE` | This connection is not allowed to do this. Do not look for a workaround: tell the user which scope is missing — for a key, they create one with it in the fxapis dashboard; for a sign-in, they reconnect fxapis and allow it. |
| `MT5_UNAVAILABLE` | The account's terminal did not answer. Try again shortly. |
| `NEEDS_OPERATOR` | The account needs a human first (wrong password, 2FA, certificate). Retrying will not help and repeated failed logins can lock the broker account. Tell the user. |
| `NO_PRICE` | The broker has no current price for this symbol on this account, so nothing was sent. Do not retry now: check the symbol's trading hours with list_account_instruments, or whether this broker offers it, and tell the user. |
| `NO_RUNTIME` | The account is offline. Call bring_accounts_online and poll get_account_status until `ready`. |
| `ORDER_NOT_FOUND` | No such order in this workspace. Call list_orders to find the right id. |
| `ORDER_REJECTED` | The broker refused the order; nothing was opened. `retryable` in details says whether the reason was transient. Tell the user the reason before trying again. |
| `ORDER_UNRESOLVED` | Do NOT resend this order. Its outcome is unknown and it may be live at the broker. Poll get_order with the orderId in details until it leaves `unknown`, and tell the user. |
| `PAYMENT_OVERDUE` | A usage charge for this workspace could not be collected, so opening trades is paused until the owner pays it on Billing. Do not retry; tell the user. Closing positions is always allowed. |
| `POSITION_NOT_FOUND` | No such open position. Call list_positions for the account; position ids are the broker's ticket (`brokerPositionId`). |
| `QUOTA_EXCEEDED` | The workspace's plan does not allow this right now. Tell the user; closing positions is always allowed. |
| `RATE_LIMITED` | Too many requests of this kind. Wait for retryAfterSeconds, then retry once. |
| `SEND_FAILED` | Nothing reached the broker. It is safe to retry with the SAME idempotency_key; a retry with the same key can never place a second order. |
| `TRADING_DISABLED` | Trading is switched off for this workspace or account. Do not retry; tell the user. |
| `UNAUTHENTICATED` | The credential was refused. If fxapis was connected by signing in, ask the user to reconnect it in this app; if it uses an API key, ask them to check the key. |
| `WAVE_ALREADY_RELEASING` | Orders have already gone out, so this multi-account order can no longer be cancelled. Follow it with get_multi_account_order. |
| `WAVE_NOT_FOUND` | No such multi-account order. Call list_multi_account_orders to find the right id. |
