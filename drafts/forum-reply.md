<!-- Ready to post as one reply on
     https://community.tari.com/t/november-build-contest-thread-mvp/520
     Repo, live app, payment address, and Bluesky announcement are filled.
     Review once more, then post this yourself. Do not submit on X. -->

# Stake — a private commitment contract

**Code (MIT):** https://github.com/Mzee04/stake
**Running app (no wallet needed):** https://mzee04.github.io/stake/

I built Stake. You pick a goal, lock some TARI against it, and name a referee you already trust. If they say you kept it, the money comes back. If they say you didn’t, it goes to a friend or a cause you chose at the start. If they never answer, a default you picked then runs.

The goal itself never goes on the chain — only a hash of the wording and a salt. A debt, a health goal, or a habit stays private. Anyone with the original text and the salt can check that they match. The amount is public; it sits in a vault. I was honest about that on the page.

The referee can lie. That’s inherent, the same way it is on stickK, and I say so on the page, not only here. The chain cannot see whether you hit your goal. It only holds the money and follows the call.

The template is a small Rust `#[template]`: `open`, `rule_success`, `rule_fail`, `timeout`, and views, including a `verify_goal` check. Engine tests cover success, fail, a timeout that refunds, a timeout that pays the sink, a wrong referee, a double ruling, and an early timeout — all against the real Ootle engine. The web app’s default path is a walletless simulation of those same rules, so you can create a stake, send a referee a link, rule, and try a timeout in the browser. The on-chain path is wired for Sapient / Tari Universe once I publish the template and put its address in the app.

I may build on this after I publish. The idea is December goals and the ones people set at the new year. You can walk through the whole product in the browser today; locking real TARI waits until I publish the template.

**Tari payment address:** `12EzpVBeVVin2bCRxg2rb7UtQJPoKV1VMRYCtYUiKct5GsZTL9dJE27LSLuE1YF7riXWMQTqr9PAckkyyLW5hSK4p4K`
**Announcement:** https://bsky.app/profile/iammzee.bsky.social/post/3n27ulws2gk2i
