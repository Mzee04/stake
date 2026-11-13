<!-- DRAFT. Post this yourself in r/tari. Title goes in Reddit's title field.
     Paste the body from the "PASTE FROM HERE" marker. Do not include this note.
     Do not post this for the user. -->

Title: I built Stake, a private commitment contract on Tari Ootle

===== PASTE FROM HERE =====

I built Stake for the Tari November MVP Contest. You lock some TARI against a private goal and name a referee you already trust. If they say you kept it, the money comes back. If they say you didn't, it goes to a friend or a cause you chose at the start. If they never answer, a default you picked then runs: refund, or pay the sink.

The goal itself never goes on the chain. What is stored is `sha256("stake/goal/v1" || the goal as UTF-8 || a 32-byte salt)`. Anyone with the wording and the salt can check that they match. A share link can carry those to your referee; a public link carries only the hash.

The amount is public. It sits in a component vault, the same way many Ootle apps hold funds. The privacy claim is the goal text, not the number.

The referee can lie. I put that on every page of the app, not only here. The chain cannot see whether you hit your goal. It only holds the money and follows the call. There is no automatic evidence (no Strava, no photo the chain will accept). If you name yourself as referee, this is just a delayed refund button. On-chain, both the refund account and the sink must already exist when you open; the template checks this so funds cannot get stuck.

The template is a small Rust `#[template]`: `open`, `rule_success`, `rule_fail`, `timeout`, and views, including a `verify_goal` check. Only the referee can rule, and only before `deadline + grace`. After that, anyone can trigger the default. A second ruling, a wrong referee, and an early timeout are rejected. I tested those paths against the real Ootle engine.

The live site is a walletless simulation of the same rules, so you can create a stake, send a referee a link, rule, move a simulated clock, and try a timeout in the browser. No wallet, no network. The on-chain path is wired for Sapient or Tari Universe, but I have not published the template yet, so that path will not send a transaction today. Esmeralda first, once I do.

I'd welcome technical feedback before I publish. In particular: is a hash-only goal the right trade-off, given that the amount is still public? And if you were going to lock funds against a private goal, would you actually name a friend as referee, or would you want something the contract still cannot provide, like automatic evidence?

Live app (no wallet needed): https://mzee04.github.io/stake/

Source (MIT): https://github.com/Mzee04/stake

Contest thread: https://community.tari.com/t/november-build-contest-thread-mvp/520
