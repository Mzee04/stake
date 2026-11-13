<!-- Optional. The contest accepts Bluesky, Reddit, Medium, or YouTube — not X.
     A Bluesky post is enough. This is a short outline if you want a Medium
     piece as well. Draft only; you publish it yourself. -->

# Why I put a commitment contract on Tari (and left the goal off the chain)

**Suggested length:** 600–900 words. First person, plain. No hero intro.

1. **The thing itself.** I built Stake. You lock some TARI against a goal and name a friend as referee. They say you made it, or you didn’t. If they never answer, a default you chose at the start runs. Link the live app and the code.

2. **Why the goal is a hash.** People will put money on a goal. They will not always put the goal itself on a public chain, or in a company’s database. A debt, a weight, a promise to quit something — that’s private. Stake stores `sha256("stake/goal/v1" || text || salt)`. The amount is public. I say that.

3. **The referee can lie.** Same as stickK. I put this on the page, not in a footnote. The chain cannot see whether you hit the goal. That’s the product, not a bug I discovered later.

4. **How a call works.** Four methods: open, rule success, rule fail, timeout. Only the referee can rule, and only before the deadline plus a grace window. After that, anyone can trigger the default. A second ruling is rejected. I tested those paths against the real Ootle engine.

5. **Try it without a wallet.** The site is a simulation of those same rules. Create a stake, send a referee a link, rule, skip the clock, try a timeout. The on-chain path is there once the template is published.

6. **What I am not claiming.** No automatic evidence. No guarantee the referee is honest, or that they will answer. If you name yourself, it’s a delayed refund button. A share link that includes the goal is as private as you keep it.

Close with the two links, and that it was built for the Tari November MVP contest. No call to “join the revolution.”
