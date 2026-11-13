# Publish checklist

You sign, you publish, you post. Nothing in this repository, and no agent working on it, should ever use or ask for your keys, seed, or payment address. Fill the placeholders yourself.

All times below are for the contest deadline: **Tuesday 1 December 2026, 1:00 AM Africa/Lagos** (00:00 UTC).

## 1. Run the tests

From the repo root, with a recent stable Rust (1.96+) and the WASM target:

```bash
rustup target add wasm32-unknown-unknown
cargo test
```

Every test in `tests/stake.rs` should pass.

## 2. Build the template WASM

```bash
cd templates/stake
cargo build --release --target wasm32-unknown-unknown
ls -la target/wasm32-unknown-unknown/release/stake.wasm
```

The file you will upload is:

```
templates/stake/target/wasm32-unknown-unknown/release/stake.wasm
```

Optional, to check a minified size (the wallet UI runs `wasm-opt` for you on publish):

```bash
wasm-opt -Oz --enable-bulk-memory \
  --strip-debug --strip-producers --strip-target-features \
  target/wasm32-unknown-unknown/release/stake.wasm \
  -o target/wasm32-unknown-unknown/release/stake.min.wasm
ls -la target/wasm32-unknown-unknown/release/stake.min.wasm
```

Keep the binary near or under 96 KiB if you can; publish fees rise sharply after that. Do not publish a file over 1 MiB — the network will reject it.

## 3. Publish the template (you sign)

Prefer the **wallet web UI**. This is the official path and the one that runs `wasm-opt` for you.

### Esmeralda (testnet) first

1. Open Sapient, or Tari Universe’s Ootle wallet, on the **Esmeralda** network.
2. Make sure the fee account has enough testnet TARI. If it doesn’t: use “Claim Testnet Funds” in the wallet, or burn and claim Minotari, or a community tap — the same way you funded Cursed Pumpkin.
3. On the Home page, click **Publish Template**.
4. Select the fee account.
5. Upload `stake.wasm` (or the `.min.wasm` if you made one and are publishing outside the UI; the UI prefers the raw `cargo` output and minifies it itself).
6. Click **Estimate Fee**. Do not type a fee from memory. Publishing is priced on binary size.
7. Click **Publish Template** and confirm in the wallet. You are the signer.
8. When it confirms, open **Templates** in the sidebar and copy the new address (`template_` followed by 64 hex characters). Save the transaction id. The Esmeralda explorer is `https://explorer.tari.mw/tx/<id>`.

### Mainnet, if you want a live mainnet contract

Same steps, with the wallet switched to **mainnet**. Fees are real TARI. Estimate first. Use a small fee-account balance you are comfortable spending, not an account you don’t want to touch. Save the mainnet template address and the transaction id separately from the Esmeralda ones.

If you still prefer the Python client you used for Cursed Pumpkin, the shape is: pay a fee from your account, then `publish_template` with the WASM bytes, after a dry run for the fee. That path also requires your key. Do it yourself, locally, the same way you did then. Do not paste a key into a chat, a ticket, or this repo.

## 4. Point the web app at the template

In `web/config.js`:

```js
window.STAKE_CONFIG = {
  network: "esmeralda",          // or "mainnet"
  templateAddress: "template_…", // the address you just copied
  // indexer and explorer URLs are already filled for Esmeralda.
  // For mainnet, confirm the current indexer and explorer URLs
  // against ootle.tari.com before you rely on them.
};
```

Commit that change after the address is real. Leave it empty until then; the simulation does not need it.

## 5. Put the site on GitHub Pages

Create the GitHub repository yourself (this work does not). Suggested name: `stake`. Public, MIT, no secrets.

GitHub Pages serves the repo root or `/docs`, not `/web`. Either:

```bash
cp -R web docs
git add docs
# then: Settings → Pages → Deploy from a branch → main → /docs
```

or put the contents of `web/` at the root of a `gh-pages` branch.

Open the Pages URL and walk through the simulation once (create, referee link, success, and — with the clock — a timeout). Try “On-chain” only after step 4, and only with a wallet you control, on the network you published to.

The live URL will look like `https://<your-github-username>.github.io/stake/`.

## 6. Fill the drafts and post them yourself

In `drafts/forum-reply.md` and `drafts/bluesky.md`, replace:

- `[REPO_URL]` with the public GitHub URL
- `[LIVE_URL]` with the GitHub Pages URL
- `` `<TARI_ADDRESS>` `` with your Tari payment address (the same one you have used before is fine; do not commit the filled file if you don’t want the address in git — paste it into the forum compose box)
- `[ANNOUNCEMENT_URL]` with the Bluesky (or Medium) post, once it is live

Post the Bluesky post first (300-character limit; count again in the compose box; **not X** — the contest does not count X). Then reply **once** on:

https://community.tari.com/t/november-build-contest-thread-mvp/520

with the five required items: public code, running app, description, payment address, announcement link.

## 7. What not to do

- Do not put a key, a seed phrase, or a wallet backup in this repo, in `web/config.js`, or in a draft that you commit.
- Do not let anyone else sign, publish, or post for you.
- Do not submit on X.
- Do not rename this product “Recall”.
- If a publish or a transaction fails, read the wallet’s reason, fix it, and retry yourself. A failed publish does not spend the template, but it may spend a fee.
