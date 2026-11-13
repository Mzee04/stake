<!-- DRAFT. Post this yourself on Medium as @allahumuhyy767.
     Do not include this note, the tags line, or the screenshot plan in the published article.
     Title and subtitle go in Medium's title and subtitle fields. Paste the body from
     the "PASTE FROM HERE" marker. Do not post this for the user. -->

Title: I built a commitment contract on Tari, and left the goal off the chain

Subtitle: Stake locks some TARI against a private goal. A person you trust decides if you kept it. The referee can lie, and I say that on the page.

Suggested tags (5): Tari, Ootle, blockchain, privacy, Rust

Screenshot plan (upload from /workspace/tari-mvp/stake/shots/, or capture fresh from the live site if the pages have changed):
1. After the opening section, just before "Why the goal is a hash": live-01-home.png (the home page, including the "The referee can lie" box)
2. In "Try it without a wallet", after the paragraph about creating a stake: live-02-new-sample.png (the sample form: 50 TARI, a 5k goal, Ada as referee, the local food bank as the sink)
3. After the paragraph about share links and the simulated clock: live-03-stake-open.png (an open stake from the staker's copy: the hash, the clock, the three share links, and the warning that the referee link contains the goal text. Ruling buttons are only on the referee link.)
4. Right after the paragraph that starts "If the referee marks the goal met": live-04-ruled-success.png (the same stake marked met, 50 TARI returned)

===== PASTE FROM HERE =====

People will put money on a goal. They will not always put the goal itself on a public chain, or in a company's database. A debt, a health target, a promise to quit something: that is private.

I built Stake. You write a goal, lock some TARI against it, and name a referee you already trust. If they say you kept it, the money comes back. If they say you didn't, it goes to a friend or a cause you chose at the start. If they never answer, a default you picked then runs: refund, or pay the sink.

The goal itself never goes on the chain. Only a hash of the wording and a salt does. The amount is public; it sits in a vault, and I say so on the page. This is my entry for the Tari November MVP Contest.

## Why the goal is a hash

I wanted a product people could hand to a friend without publishing the wording. The kind of goal you might actually lock money against is often not the kind you want on a public ledger, or on someone else's server.

What Stake stores is:

`sha256("stake/goal/v1" || the goal as UTF-8 || a 32-byte salt)`

Anyone with the original text and the salt can check that they match. Nobody else can read the goal from the chain. The template has a `verify_goal` method for that check, and the site has a form that uses the same formula, even if you never open a stake.

A share link can carry the wording and the salt to your referee. A public link carries only the hash. The referee link is secret only as long as you keep it. Treat it like the goal itself.

The amount is a different matter. It sits in a component vault, the same way many Ootle apps hold funds. Anyone can see how much was locked. The privacy claim is the goal text, not the number.

## The referee can lie

This is inherent, the same way it is on stickK, and I put it on every page of the app, not only here.

The chain cannot see whether you hit your goal. It only holds the money and follows the call. There is no automatic evidence. No Strava, no photo the chain will accept. Pick someone you already trust, and who will actually answer.

A few other limits are worth stating plainly. If you name yourself as referee, this is just a delayed refund button. That is allowed, and not much of a commitment. Both the refund account and the sink must already exist when you open the stake, and must be able to receive a deposit. The template checks this and will reject the transaction if they don't, so funds cannot get stuck against an address that will never accept one.

The hash does not prove that the goal was met. It only proves that a given wording is the one that was locked.

## How the template works

The contract is a small Rust `#[template]`. You open a stake by signing a transaction that locks a positive amount, a goal hash, a referee's public key, your refund account, a sink account, a deadline epoch, a grace window, and a timeout default. The deadline must be in the future. You, the transaction signer, are the staker. Funds go into a vault, and the contract is live.

From there the calls are few.

`open` is the start, as above.

`rule_success` can be called only by the referee, and only before the timeout epoch (`deadline + grace`). The funds are deposited back to your account, and the status becomes `succeeded`.

`rule_fail` is the same signer and the same window. The funds are deposited to the sink, and the status becomes `failed`.

`timeout` can be called by anyone, at or after that timeout epoch, if nobody has ruled. The default you chose at `open` runs, and the status becomes `timed_out`.

`verify_goal` takes the original text and the 32-byte salt and returns whether they match the hash stored on the component. There are also read-only getters, including a `get` view of the whole stake.

A second ruling is rejected. A timeout before the window closes is rejected. A ruling from anyone but the referee is rejected. The referee may still rule during the grace window. After it ends, only `timeout` is left.

I tested those paths against the real Ootle engine, in-process, with `tari_template_test_tooling`. The tests cover a success that returns the funds, a fail that pays the sink, a timeout that refunds, a timeout that pays the sink, a wrong referee, a double ruling, an early timeout, a referee still ruling during grace, a ruling after the window, a past deadline, a deadline equal to now, a zero stake, grace of zero, deadline-plus-grace overflow, payout accounts that are missing or not accounts, and a documented goal-hash vector:

- goal: `run a 5k before the year ends`
- salt: `0x11` repeated 32 times
- hash: `e812a457194e9f1907c959abd315848f538fb7029c5144fc064b76d23de22975`

The tests use a test-only public coin in place of TARI, the same pattern as other Ootle engine tests. The template itself accepts any fungible resource in the stake bucket. The web app's on-chain path, once a template is published, sends TARI.

## Try it without a wallet

The live app is a walletless simulation of those same rules. Nothing is sent to a server. You can create a stake in the browser, send a referee a link, make a ruling, and see where the money goes.

The form is the same shape as the contract: a goal, an amount, a deadline, a referee, a sink, a grace period, and a default if nobody rules. Leading and trailing spaces on the goal are trimmed before it is hashed, so what you see is what is hashed. In the simulation a name is enough for the referee and the sink. On-chain those are a Tari public key and a Tari account. If you name yourself as referee, this is just a delayed refund button.

Once a stake is open, you get three links: your copy (the goal included), a referee link (the goal included; this URL contains the goal text; treat it like the goal itself), and a public link (the hash only). In the browser demo, ruling buttons are only on the referee link. Each link is a snapshot: a ruling on one copy does not update the others. On-chain, only the referee's key can rule, and it is final for everyone. You also get a simulated clock, because on-chain these moments are Ootle epochs, not days, and I did not want anyone to wait to try a timeout. You can advance one day, skip to the deadline, or skip to the end of grace, then apply the default. An early timeout is rejected here, the same way the template rejects it.

If the referee marks the goal met, the money comes back and the stake shows as settled. If they mark it missed, it goes to the sink. The sample on the site uses 50 TARI, a 5k goal, a friend as referee, and a local food bank as the sink, so you can walk those paths in a minute.

That path is the running product today. I want someone to be able to try it in a minute, with no wallet and no network.

The on-chain path is in the same app, under "On-chain". It is wired for the Sapient extension or Tari Universe: connect, read the current epoch, open a stake, look up a component, verify a goal against the on-chain hash, and rule or time out. I have not published the template yet. Until I do that, and paste its address into the app, that path will not send a transaction.

## What is next

I will publish the template on Esmeralda first, then put the address in the app, and try an `open` myself from a wallet. If that holds up, I may put it on mainnet later. I am not claiming a live on-chain deployment today.

I may build on this after I publish. The idea is December goals, and the ones people set at the new year. You can walk through the whole product in the browser today; locking real TARI waits until I publish the template.

The code is MIT licensed. The running app needs no wallet.

[The live app](https://mzee04.github.io/stake/)

[The source code](https://github.com/Mzee04/stake)

This was built for the [Tari November MVP Contest](https://community.tari.com/t/november-build-contest-thread-mvp/520). I also posted a short note [on Bluesky](https://bsky.app/profile/iammzee.bsky.social/post/3n27ulws2gk2i).
