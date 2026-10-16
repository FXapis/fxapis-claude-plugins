# Order lifecycle

An fxapis order moves through these states (`state` on every order):

| State | Means | What to do |
|---|---|---|
| `accepted` | fxapis took it; the idempotency key is claimed; nothing sent yet | Wait |
| `validating` | Checked against the broker's margin and symbol rules | Wait |
| `sending` | On its way to the broker — the one moment the outcome is in doubt | Wait; never resend |
| `working` | A pending (limit or stop) order is waiting at the broker | It may still fill; `cancel_order` to withdraw it |
| `filled` | Filled; `brokerPositionId` names the position | Report fill volume and price |
| `partially_filled` | Part filled | Report what filled; the rest may still fill or expire |
| `completed` | Done with no position of its own (a close, a modify, a cancel) | Report it |
| `rejected` | The broker refused; nothing opened | Tell the user the broker's reason (`retcodeText`) |
| `failed` | Never reached the broker | Safe to retry with the same idempotency key |
| `unknown` | The broker did not answer in time; it may be live | **Never resend.** Poll `get_order` until it leaves `unknown` |
| `cancelled` | Withdrawn before it triggered | Nothing to do |
| `expired` | A pending order reached its expiry | Nothing to do |

`needsReconciliation: true` means fxapis is still confirming the result with the broker. Treat it like `unknown`.

## Following an order

1. The trading tool answers with the order. Read `state`.
2. On `ORDER_UNRESOLVED`, take the order id from the error details and call `get_order` every few seconds until the state leaves `unknown`. It usually takes seconds, and rarely more than a minute.
3. `get_order` with `include_deals: true` shows the broker deals the order produced, with the realised profit of a close.

## Positions

- `list_positions` shows open positions. `brokerPositionId` is what `close_position` and `modify_position` take as `position_id`.
- On a **netting** account there is one position per symbol, and a new order in the opposite direction reduces it.
- On a **hedging** account every order is its own position. To reduce exposure there, close the position: an opposite order opens a second position.
