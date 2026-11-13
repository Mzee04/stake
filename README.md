# Stake

**A commitment contract on Tari Ootle.** You lock some TARI against a private goal, and a person you already trust decides if you kept it. Only a hash of the goal goes on the chain — so a debt, a health goal, or a habit never sits on a public ledger, or on someone else’s server.

Built for the Tari November 2026 MVP contest. MIT licensed. Copyright (c) 2026 Toyyib Muhammed.

- `templates/stake`: the Ootle template (Rust → WASM)
- `tests/stake.rs`: engine tests that run the real Ootle engine in-process
- `web/`: a static web app — a walletless simulation as the default path, and an on-chain path for a published template
- `drafts/`: a forum reply, a Bluesky post, a short Medium outline, and a publish checklist (you post and you sign; this repo does not)

## How it works

You write a goal and lock an amount. You name a referee (a Tari public key), a sink (a friend or a cause’s account), a deadline epoch, a grace window after that deadline, and a default if the referee never answers (refund, or pay the sink).

The goal text itself never goes on the chain. What is stored is:

```
sha256( "stake/goal/v1" || goal text as UTF-8 || 32-byte salt )
```

Anyone with the wording and the salt can check that they match the hash. A share link can carry those off-chain; a public link carries only the hash.

Then:

| Call | Who | When | What happens |
|---|---|---|---|
| `open` | the staker (the transaction signer) | deadline must be in the future; amount must be positive | funds go into a vault; the contract is live |
| `rule_success` | the referee only | before `deadline + grace` | funds are deposited back to the staker’s account |
| `rule_fail` | the referee only | before `deadline + grace` | funds are deposited to the sink |
| `timeout` | anyone | at or after `deadline + grace`, if nobody has ruled | the default chosen at `open` runs |

A second ruling is rejected. A timeout before the window closes is rejected. A ruling from anyone but the referee is rejected. The template checks all of this.

The referee may still rule during the grace window. After it ends, only `timeout` is left.

## Why Tari

People will put money on a goal. They will not always put the goal itself on a public chain. That is the product. The amount is public — it sits in a component vault, the same way many Ootle apps hold funds. The privacy claim is the goal text, not the number.

## Honest limits

**The referee can lie.** Stake is only as honest as the person you name, the same way [stickK](https://www.stickk.com/) is. The chain cannot see whether you hit your goal. It only holds the money and follows the call. This is said on the page, not only here.

Other limits:

- There is no automatic evidence (no Strava, no photo the chain will accept). Pick someone who will actually answer.
- If you name yourself as referee, this is just a delayed refund button. That’s allowed, and not much of a commitment.
- The sink account has to exist by the time funds are sent to it. If a deposit fails, the whole transaction fails and can be retried once the account is created — the stake stays open.
- A share link that includes your goal is secret only as long as you keep it. Treat it like the goal itself.

## The web app

The simulation is the full product in a browser: create a stake, send a referee a link, rule, advance the clock, and trigger a timeout. No wallet, no network. This is the path for a judge who wants to try it in a minute.

The on-chain path is in the same app, under “On-chain”. It talks to a published template through `window.tari` (Sapient or Tari Universe): connect, read the current epoch, open a stake with a stealth withdrawal, look up a component, verify a goal against the on-chain hash, and rule or time out. Until you publish a template and paste its address into `web/config.js`, that path will not send a transaction.

```bash
cd web && python3 -m http.server 8000
# open http://localhost:8000
```

For GitHub Pages: this folder is static and has no build step. GitHub Pages serves either the repository root or `/docs` from a branch, not `/web`. Copy `web/` to `docs/` on `main`, or put these files at the root of a `gh-pages` branch, then turn Pages on.

## Tests

```bash
rustup target add wasm32-unknown-unknown
cargo test
```

The tests cover success, fail, timeout-refund, timeout-sink, a wrong referee, a double ruling, an early timeout, a referee still ruling during grace, a ruling after the window, a past deadline, a zero stake, and the documented goal-hash vector:

```
goal  = "run a 5k before the year ends"
salt  = 0x11 repeated 32 times
hash  = e812a457194e9f1907c959abd315848f538fb7029c5144fc064b76d23de22975
```

They use a test-only public coin (`templates/test_coin`) in place of TARI, the same pattern as other Ootle engine tests. The template itself accepts any fungible resource in the stake bucket; the web app’s on-chain path sends TARI.

You will want a recent stable Rust (1.96 or newer). `tari_template_test_tooling` 0.47 needs `tari_crypto` 0.24.0 — the lockfile pins this.

## Build the WASM

```bash
cd templates/stake && cargo build --release --target wasm32-unknown-unknown
# binary: templates/stake/target/wasm32-unknown-unknown/release/stake.wasm
```

## Publish (you sign; this repo does not)

See [drafts/publish-checklist.md](drafts/publish-checklist.md) for the exact steps. In short: build the WASM, then publish it yourself from the Tari wallet web UI (Sapient or Universe) on Esmeralda and, if you want, mainnet. Paste the resulting `template_…` address into `web/config.js`. Never put a key, a seed, or a payment address in this repository.

## License

MIT. See [LICENSE](LICENSE).
