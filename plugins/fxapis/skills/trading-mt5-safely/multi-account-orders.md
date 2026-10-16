# Multi-account orders

`place_multi_account_order` places the same market order on many accounts — for example a signal copied to every account a user manages.

## How it runs

`planned` → `preparing` (terminals brought online) → `armed` → `releasing` (orders sent together) → `settled`. It ends as `cancelled` or `abandoned` when nothing was sent.

- Without `execute_at`, the orders go out as soon as every account is online. With it, they go out at that time.
- `barrier_policy`:
  - `release-ready` (the default) trades on the accounts that are online in time;
  - `all-or-nothing` trades on none unless all are online;
  - `wait` keeps waiting until `expires_at`.
- **Not all-or-nothing once sent**: each account fills at its own price or is rejected on its own.

## Safely

1. Confirm the full account list, with each one's environment, and the symbol or instrument, the side and the volume. Use `weights` for per-account sizes. Get one explicit yes.
2. Prefer `instrument` (for example `XAUUSD`) over `symbol`: each account then trades its own broker's symbol. The whole order is refused if any broker does not offer it.
3. Use one fresh `idempotency_key` for the whole order.
4. It returns at once. Follow it with `get_multi_account_order` until `settled`.
5. An account whose result is `unresolved` must not be resent. Poll its order with `get_order`.
6. `cancel_multi_account_order` works only before release. After that, close the resulting positions one by one, with confirmation.
