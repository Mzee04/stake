/* Stake: static front end. No build step, no server of our own.
   The simulation is the default path and implements the same rules as the
   Rust template. The on-chain path talks to a published template through
   window.tari (Sapient or Tari Universe) once a template address is set. */
"use strict";

const GOAL_DOMAIN = new TextEncoder().encode("stake/goal/v1");
const KNOWN_VECTOR = {
  goal: "run a 5k before the year ends",
  salt: "11".repeat(32),
  hash: "e812a457194e9f1907c959abd315848f538fb7029c5144fc064b76d23de22975",
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const clean = String(hex || "").trim().toLowerCase().replace(/^0x/, "").replace(/\s+/g, "");
  if (clean.length % 2) throw new Error("hex string has an odd length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const n = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(n)) throw new Error("invalid hex");
    out[i] = n;
  }
  return out;
}
function randomSalt() {
  const s = new Uint8Array(32);
  crypto.getRandomValues(s);
  return s;
}
async function goalCommitment(text, saltBytes) {
  const goal = new TextEncoder().encode(text);
  const buf = new Uint8Array(GOAL_DOMAIN.length + goal.length + saltBytes.length);
  buf.set(GOAL_DOMAIN, 0);
  buf.set(goal, GOAL_DOMAIN.length);
  buf.set(saltBytes, GOAL_DOMAIN.length + goal.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}
function toB64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function encodeStake(stake, { includeGoal } = { includeGoal: true }) {
  const o = { ...stake };
  if (!includeGoal) {
    delete o.goal;
    delete o.salt;
  }
  return toB64url(new TextEncoder().encode(JSON.stringify(o)));
}
function decodeStake(b64) {
  try {
    const json = new TextDecoder().decode(fromB64url(b64));
    const s = JSON.parse(json);
    if (!s || s.v !== 1 || !s.goalHash) throw new Error("not a stake");
    return s;
  } catch {
    throw new Error("This link is not a valid Stake.");
  }
}
function originPath() {
  return `${location.origin}${location.pathname}`.replace(/index\.html$/, "");
}
function stakeUrl(stake, { includeGoal, rule } = { includeGoal: true, rule: false }) {
  const path = rule ? `/rule` : "";
  return `${originPath()}#/s/${encodeStake(stake, { includeGoal })}${path}`;
}

function nowOf(s) {
  return typeof s.simNow === "number" ? s.simNow : Date.now();
}
function timeoutAt(s) {
  return s.deadline + s.graceMs;
}
function isOpen(s) {
  return s.status === "open";
}
function canRule(s, t = nowOf(s)) {
  return isOpen(s) && t < timeoutAt(s);
}
function canTimeout(s, t = nowOf(s)) {
  return isOpen(s) && t >= timeoutAt(s);
}

function fmtWhen(ms) {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(ms).toISOString();
  }
}
function fmtAmount(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  return `${x.toLocaleString(undefined, { maximumFractionDigits: 6 })} TARI`;
}
function remain(from, to) {
  const d = to - from;
  if (d <= 0) return "passed";
  const sec = Math.round(d / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  if (days >= 2) return `${days} days`;
  if (days === 1) return hours ? `1 day ${hours} h` : "1 day";
  if (hours >= 1) return `${hours} h`;
  const min = Math.floor(sec / 60);
  return min >= 1 ? `${min} min` : "less than a minute";
}

const STAMP = {
  open: "Locked",
  succeeded: "Met",
  failed: "Missed",
  timed_out: "Lapsed",
};

function defaultDeadlineValue() {
  const d = new Date(2026, 11, 31, 23, 59);
  if (d.getTime() <= Date.now() + 86400000) {
    d.setTime(Date.now() + 18 * 86400000);
    d.setHours(23, 59, 0, 0);
  }
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ───────────────────────────── routing ───────────────────────────── */

function route() {
  const raw = (location.hash || "#/").replace(/^#/, "");
  const [path] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  $$(".nav a").forEach((a) => {
    const on =
      (a.dataset.nav === "home" && parts.length === 0) ||
      (a.dataset.nav && parts[0] === a.dataset.nav) ||
      (a.dataset.nav === "home" && parts[0] === "s");
    a.setAttribute("aria-current", on && a.dataset.nav !== "home" ? "page" : "false");
    if (a.dataset.nav === "home") a.setAttribute("aria-current", parts.length === 0 ? "page" : "false");
  });

  const show = (id) => {
    $$(".view").forEach((v) => {
      v.hidden = v.id !== id;
    });
  };

  if (parts.length === 0) {
    show("view-home");
    return;
  }
  if (parts[0] === "new") {
    show("view-new");
    prepareForm();
    return;
  }
  if (parts[0] === "how") {
    show("view-how");
    return;
  }
  if (parts[0] === "wallet") {
    show("view-wallet");
    renderWallet();
    return;
  }
  if (parts[0] === "s" && parts[1]) {
    show("view-stake");
    try {
      const stake = decodeStake(parts[1]);
      const asReferee = parts[2] === "rule";
      renderStake(stake, { asReferee, packed: parts[1] });
    } catch (e) {
      const msg = (e && e.message) || "This link is not a valid Stake.";
      $("#stake-root").innerHTML = `<div class="contract">
        <header class="page-head">
          <h1>This link is not a valid Stake.</h1>
          <p>The address looks like a stake link, but the data in it could not be read. It may have been copied only in part, or it is not a Stake URL. Please check the full link, or <a href="#/new">open a new stake</a>.</p>
        </header>
        <p class="form-error">${esc(msg)}</p>
      </div>`;
    }
    return;
  }
  show("view-home");
}

window.addEventListener("hashchange", route);

/* ───────────────────────────── create ───────────────────────────── */

function prepareForm() {
  const dl = $("#deadline");
  if (dl && !dl.value) dl.value = defaultDeadlineValue();
}

$("#fill-sample").addEventListener("click", () => {
  $("#goal").value = KNOWN_VECTOR.goal;
  $("#amount").value = "50";
  $("#referee").value = "Ada, a friend";
  $("#sink").value = "The local food bank";
  $("#grace").value = "7";
  $("#deadline").value = defaultDeadlineValue();
  $('input[name="default"][value="refund"]').checked = true;
});

$("#create-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const err = $("#create-error");
  err.hidden = true;
  try {
    const goal = $("#goal").value.trim();
    if (!goal) throw new Error("Write a goal first. It stays off the chain.");
    if (goal.length > 500) throw new Error("Keep the goal to 500 characters so a share link stays short.");
    const amount = Number($("#amount").value);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("The amount has to be greater than zero.");
    const deadline = new Date($("#deadline").value).getTime();
    if (!Number.isFinite(deadline)) throw new Error("Pick a deadline.");
    if (deadline <= Date.now()) throw new Error("The deadline has to be in the future.");
    const graceDays = Number($("#grace").value);
    if (!Number.isFinite(graceDays) || graceDays < 0) throw new Error("Grace has to be zero or more days.");
    const referee = $("#referee").value.trim();
    const sink = $("#sink").value.trim();
    if (!referee) throw new Error("Name a referee.");
    if (!sink) throw new Error("Name a sink for a miss.");
    const refundOnTimeout = $('input[name="default"]:checked').value === "refund";
    const salt = randomSalt();
    const goalHash = await goalCommitment(goal, salt);
    const stake = {
      v: 1,
      id: toHex(crypto.getRandomValues(new Uint8Array(6))),
      goal,
      salt: toHex(salt),
      goalHash: toHex(goalHash),
      amount,
      stakerName: "You",
      refereeName: referee,
      sinkName: sink,
      deadline,
      graceMs: Math.round(graceDays * 86400000),
      refundOnTimeout,
      status: "open",
      openedAt: Date.now(),
      resolvedAt: null,
      sim: true,
    };
    location.hash = `#/s/${encodeStake(stake, { includeGoal: true })}`;
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message || String(e);
  }
});

/* ───────────────────────────── stake view ───────────────────────────── */

function goTo(stake, opts) {
  location.hash = `#/s/${encodeStake(stake, { includeGoal: opts?.includeGoal !== false })}${opts?.rule ? "/rule" : ""}`;
}

function renderStake(s, { asReferee } = {}) {
  const t = nowOf(s);
  const open = isOpen(s);
  const hashOkPromise =
    s.goal != null && s.salt
      ? goalCommitment(s.goal, fromHex(s.salt)).then((h) => toHex(h) === s.goalHash.toLowerCase())
      : Promise.resolve(null);

  hashOkPromise.then((hashOk) => {
    const stampClass = s.status === "open" ? "locked" : s.status;
    const stampWord = STAMP[s.status] || s.status;
    const timeout = timeoutAt(s);

    const goalBlock =
      s.goal != null
        ? `<div class="goal-reveal">
            <h3>The goal</h3>
            <blockquote>${esc(s.goal)}</blockquote>
            ${
              hashOk === true
                ? `<p class="match ok">This text matches the hash on the contract.</p>`
                : hashOk === false
                  ? `<p class="match bad">This text does not match the hash. The wording or the salt is wrong.</p>`
                  : ``
            }
          </div>`
        : `<div class="goal-reveal">
            <h3>The goal is not in this link</h3>
            <p>The contract only has a hash. If you have the original wording and the salt, you can check them below.</p>
          </div>`;

    const outcome =
      s.status === "succeeded"
        ? `<div class="outcome"><h2>The goal was marked met.</h2><p>${esc(fmtAmount(s.amount))} goes back to ${esc(s.stakerName || "the staker")}.</p></div>`
        : s.status === "failed"
          ? `<div class="outcome failed"><h2>The goal was marked missed.</h2><p>${esc(fmtAmount(s.amount))} goes to ${esc(s.sinkName)}.</p></div>`
          : s.status === "timed_out"
            ? `<div class="outcome timed_out"><h2>The referee did not rule in time.</h2><p>The default ran: ${
                s.refundOnTimeout
                  ? `${esc(fmtAmount(s.amount))} is returned to ${esc(s.stakerName || "the staker")}.`
                  : `${esc(fmtAmount(s.amount))} goes to ${esc(s.sinkName)}.`
              }</p></div>`
            : "";

    const rulePanel = open
      ? `<div class="actions">
          <h2>${asReferee ? "Your ruling" : "Referee’s ruling"}</h2>
          ${
            canRule(s, t)
              ? asReferee
                ? `<p>You are the referee. The chain — and this simulation — will follow your call. You can lie. Please don’t, unless that’s a conversation you’ve already had.</p>
                   <p class="help">Each share link is a snapshot of this stake. A ruling here does not update someone else’s copy. On-chain, only the referee’s key can make this call, and it is final for everyone.</p>
                   <div class="action-row">
                     <button type="button" class="btn success" data-act="success">Mark as met — money returns</button>
                     <button type="button" class="btn danger" data-act="fail">Mark as missed — money to the sink</button>
                   </div>`
                : `<p>On-chain, only the referee’s key can make this call, and only before the grace window ends. In this browser demo, the ruling buttons are only on the referee link — open that if you want to try a call.</p>
                   <p class="help">Each share link is a snapshot. A ruling on one copy does not update the others.</p>`
              : canTimeout(s, t)
                ? `<p>The ruling window has closed. The referee can no longer call. Anyone can apply the default.</p>`
                : `<p>The ruling window is closed.</p>`
          }
        </div>`
      : "";

    const timeoutPanel = open
      ? `<div class="actions">
          <h2>If nobody rules</h2>
          ${
            canTimeout(s, t)
              ? `<p>The grace window has ended. The default chosen at the start is: <b>${
                  s.refundOnTimeout ? "return the money to the staker" : "send it to the sink"
                }</b>.</p>
                <div class="action-row">
                  <button type="button" class="btn warn" data-act="timeout">Apply the default</button>
                </div>`
              : `<p>Available ${esc(fmtWhen(timeout))} (${esc(remain(t, timeout))} from the current sim time). Before then, a timeout is rejected — the same way the template rejects it.</p>
                <div class="action-row">
                  <button type="button" class="btn ghost" data-act="timeout" ${canTimeout(s, t) ? "" : "disabled"}>Apply the default</button>
                </div>`
          }
        </div>`
      : "";

    const clock = open
      ? `<div class="clock">
          <h2>Simulated time</h2>
          <p>Now: <b>${esc(fmtWhen(t))}</b>${s.simNow ? " (advanced)" : " (your clock)"}.</p>
          <p class="help">On-chain, these moments are Ootle epochs. Here you can move the clock to try every path, including a timeout, without waiting.</p>
          <div class="action-row">
            <button type="button" class="btn ghost small" data-act="advance-day">Advance one day</button>
            <button type="button" class="btn ghost small" data-act="to-deadline">Skip to the deadline</button>
            <button type="button" class="btn ghost small" data-act="to-timeout">Skip to the end of grace</button>
            ${s.simNow ? `<button type="button" class="btn ghost small" data-act="reset-clock">Use the real clock</button>` : ""}
          </div>
        </div>`
      : "";

    const fullUrl = stakeUrl(s, { includeGoal: true });
    const refereeUrl = stakeUrl(s, { includeGoal: true, rule: true });
    const publicUrl = stakeUrl(s, { includeGoal: false });

    const shares = `<div class="shares">
        <h2>Share</h2>
        <aside class="honest">
          <h2>The referee link contains the goal text.</h2>
          <p>Treat it like the goal itself. Anyone with that URL can read the wording and the salt. Use the public (hash-only) link if you are posting it.</p>
        </aside>
        ${shareRow("Your copy (goal included)", "link-full", fullUrl)}
        ${shareRow("Referee link", "link-ref", refereeUrl)}
        ${shareRow("Public link (hash only)", "link-pub", publicUrl)}
      </div>`;

    const verify =
      s.goal == null
        ? `<div class="actions">
            <h2>Reveal and verify</h2>
            <p>Paste the original wording and the salt. This page will hash them the same way the template does, and compare.</p>
            <form class="verify-inline" id="stake-verify" novalidate>
              <div class="field"><label for="sv-goal">Goal text</label><textarea id="sv-goal" rows="2"></textarea></div>
              <div class="field"><label for="sv-salt">Salt (64 hex characters)</label><input id="sv-salt" spellcheck="false" /></div>
              <button type="submit" class="btn primary">Verify against this hash</button>
              <p class="verify-out" id="sv-out" hidden></p>
            </form>
          </div>`
        : "";

    $("#stake-root").innerHTML = `
      ${
        asReferee
          ? `<p class="banner">You were sent this as the referee. Read the goal, then make a call — or wait, and the default will run after the grace window.</p>
             <aside class="honest">
               <h2>This URL contains the goal text.</h2>
               <p>Treat it like the goal itself. Anyone with this link can read the wording and the salt. Use the public (hash-only) link if you are posting it.</p>
             </aside>`
          : ""
      }
      <article class="contract">
        <div class="contract-top">
          <div>
            <p class="status-kicker">Commitment contract · ${s.sim ? "simulation" : "on-chain"}</p>
            <h1>Stake</h1>
          </div>
          <div class="stamp ${esc(stampClass)}" aria-label="Status: ${esc(stampWord)}">${esc(stampWord)}</div>
        </div>
        ${goalBlock}
        <dl class="dl">
          <dt>Amount locked</dt><dd>${esc(fmtAmount(s.amount))}</dd>
          <dt>Staker</dt><dd>${esc(s.stakerName || "You")}</dd>
          <dt>Referee</dt><dd>${esc(s.refereeName)}</dd>
          <dt>Sink</dt><dd>${esc(s.sinkName)}</dd>
          <dt>Deadline</dt><dd>${esc(fmtWhen(s.deadline))}</dd>
          <dt>Grace ends</dt><dd>${esc(fmtWhen(timeout))}${
            open
              ? (remain(t, timeout) === "passed" ? " · the window has closed" : ` · ${esc(remain(t, timeout))} left`)
              : ""
          }</dd>
          <dt>If nobody rules</dt><dd>${s.refundOnTimeout ? "The money is returned to the staker" : "The money goes to the sink"}</dd>
          <dt>Goal hash</dt><dd class="hash">${esc(s.goalHash)}</dd>
          ${s.salt ? `<dt>Salt</dt><dd class="hash">${esc(s.salt)}</dd>` : ""}
        </dl>
        <aside class="honest" style="margin:0 0 0.4rem">
          <h2>The referee can lie.</h2>
          <p>This contract will follow the referee’s call, or the default if they stay silent. The hash does not prove that the goal was met. It only proves that a given wording is the one that was locked.</p>
        </aside>
        ${outcome}
        ${rulePanel}
        ${timeoutPanel}
        ${clock}
        ${shares}
        ${verify}
      </article>
    `;

    $("#stake-root").onclick = (ev) => {
      const btn = ev.target.closest("[data-act]");
      if (!btn) return;
      act(s, btn.dataset.act, asReferee);
    };

    const sv = $("#stake-verify");
    if (sv) {
      sv.addEventListener("submit", async (e) => {
        e.preventDefault();
        const out = $("#sv-out");
        out.hidden = false;
        try {
          const text = $("#sv-goal").value.trim();
          const salt = fromHex($("#sv-salt").value);
          if (salt.length !== 32) throw new Error("The salt must be 32 bytes (64 hex characters).");
          const h = toHex(await goalCommitment(text, salt));
          const ok = h === s.goalHash.toLowerCase();
          out.className = `verify-out ${ok ? "ok" : "bad"}`;
          out.textContent = ok
            ? "It matches. This is the goal that was locked."
            : `It does not match. Computed hash: ${h}`;
        } catch (err) {
          out.className = "verify-out bad";
          out.textContent = err.message || String(err);
        }
      });
    }

    $$(".copy-line button", $("#stake-root")).forEach((b) => {
      b.addEventListener("click", () => copyFrom(b.dataset.copy, b));
    });
  });
}

function shareRow(label, id, url) {
  return `<div class="share-row">
    <label for="${id}">${esc(label)}</label>
    <div class="copy-line">
      <input id="${id}" readonly value="${esc(url)}" />
      <button type="button" class="btn ghost small" data-copy="${id}">Copy</button>
    </div>
  </div>`;
}

async function copyFrom(id, btn) {
  const input = document.getElementById(id);
  if (!input) return;
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  const prev = btn.textContent;
  btn.textContent = "Copied";
  setTimeout(() => {
    btn.textContent = prev;
  }, 1400);
}

function act(s, action, asReferee) {
  const next = { ...s };
  const t = nowOf(s);
  try {
    if (action === "success" || action === "fail") {
      if (!asReferee) {
        throw new Error("In this demo, only the referee link can make a ruling. On-chain, only the referee’s key can.");
      }
      if (!canRule(s, t)) throw new Error("The ruling window has closed.");
      next.status = action === "success" ? "succeeded" : "failed";
      next.resolvedAt = t;
    } else if (action === "timeout") {
      if (!isOpen(s)) throw new Error("This stake is already settled.");
      if (!canTimeout(s, t)) throw new Error("Too early to time out.");
      next.status = "timed_out";
      next.resolvedAt = t;
    } else if (action === "advance-day") {
      next.simNow = t + 86400000;
    } else if (action === "to-deadline") {
      next.simNow = s.deadline;
    } else if (action === "to-timeout") {
      next.simNow = timeoutAt(s);
    } else if (action === "reset-clock") {
      delete next.simNow;
    }
    goTo(next, { includeGoal: s.goal != null, rule: asReferee && isOpen(next) ? true : asReferee && false });
  } catch (e) {
    alert(e.message);
  }
}

/* ───────────────────────────── standalone verify ───────────────────────────── */

$("#verify-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const out = $("#verify-out");
  out.hidden = false;
  try {
    const hash = $("#v-hash").value.trim().toLowerCase().replace(/^0x/, "");
    const salt = fromHex($("#v-salt").value);
    if (salt.length !== 32) throw new Error("The salt must be 32 bytes (64 hex characters).");
    if (hash.length !== 64) throw new Error("The hash must be 32 bytes (64 hex characters).");
    const h = toHex(await goalCommitment($("#v-goal").value.trim(), salt));
    const ok = h === hash;
    out.className = `verify-out ${ok ? "ok" : "bad"}`;
    out.textContent = ok
      ? "It matches. This wording and salt produce the hash you pasted."
      : `It does not match. The hash of the text and salt is ${h}.`;
  } catch (e) {
    out.className = "verify-out bad";
    out.textContent = e.message || String(e);
  }
});

const fillVector = $("#fill-vector");
if (fillVector) {
  fillVector.addEventListener("click", () => {
    $("#v-hash").value = KNOWN_VECTOR.hash;
    $("#v-goal").value = KNOWN_VECTOR.goal;
    $("#v-salt").value = KNOWN_VECTOR.salt;
    const out = $("#verify-out");
    if (out) out.hidden = true;
  });
}

/* ───────────────────────────── wallet / on-chain ───────────────────────────── */

function cfg() {
  return window.STAKE_CONFIG || { network: "esmeralda", templateAddress: "", indexer: {}, explorer: {} };
}
function indexerUrl() {
  const c = cfg();
  return (c.indexer && c.indexer[c.network]) || c.indexer?.esmeralda || "https://ootle-indexer-a.tari.com";
}
function explorerUrl() {
  const c = cfg();
  return (c.explorer && c.explorer[c.network]) || c.explorer?.esmeralda || "https://explorer.tari.mw";
}
function templateAddress() {
  return (cfg().templateAddress || "").trim();
}
function hasTemplate() {
  return /^template_[0-9a-fA-F]{64}$/.test(templateAddress()) || /^[0-9a-fA-F]{64}$/.test(templateAddress());
}
function bareTemplate() {
  return templateAddress().replace(/^template_/, "");
}

function isUniverseStubError(e) {
  const msg = e && (e.message || e.note || String(e));
  return /not running inside Tari Universe|Tari wallet unavailable/i.test(String(msg));
}

function walletCandidates() {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (p && (p.request || p.isTariWallet) && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };
  // Prefer wallets that announced themselves (Sapient, etc.) over the
  // Universe page stub that tari-connector.js always installs as window.tari.
  if (Array.isArray(window.tariProviders)) window.tariProviders.forEach(add);
  add(window.tari);
  return out;
}

function noWalletHtml() {
  return `<span class="bad">No Tari wallet is available in this browser. Install the <b>Sapient</b> extension, switch it to ${esc(cfg().network)}, then reload this page — or open the page inside Tari Universe. You can still use the <a href="#/new">simulation</a> and read the indexer without a wallet.</span>`;
}

async function indexerGet(path) {
  const r = await fetch(`${indexerUrl()}${path}`);
  if (!r.ok) throw new Error(`Indexer ${r.status}: ${await r.text()}`);
  return r.json();
}
function cborHex(v) {
  if (v && v["@cbor"] === "bytes") return v.hex;
  if (v && v["@cbor"] === "tag") return cborHex(v.value);
  if (typeof v === "string") return v.replace(/^component_|^resource_|^vault_|^hash_|^template_/, "");
  return v;
}

/* Ootle epochs advance with a fixed number of Minotari (L1) blocks.
   On mainnet, a couple of days after the 11 Nov 2026 launch, the counter
   was already in the tens of thousands, so an epoch is on the order of
   several seconds — not a day. This is a rough label only. */
const APPROX_SECONDS_PER_EPOCH = 6;
const DEFAULT_DEADLINE_DAYS = 30;
const DEFAULT_GRACE_DAYS = 3;

function epochsForDays(days) {
  return Math.max(1, Math.round((days * 86400) / APPROX_SECONDS_PER_EPOCH));
}

function fmtEpochDuration(epochs) {
  const n = Number(epochs);
  if (!Number.isFinite(n) || n < 0) return "";
  const sec = n * APPROX_SECONDS_PER_EPOCH;
  let span;
  if (sec < 90) span = `${Math.max(1, Math.round(sec))} seconds`;
  else if (sec < 90 * 60) span = `${Math.round(sec / 60)} minutes`;
  else if (sec < 48 * 3600) {
    const h = Math.round(sec / 3600);
    span = h === 1 ? "1 hour" : `${h} hours`;
  } else {
    const d = Math.round(sec / 86400);
    span = d === 1 ? "1 day" : `${d} days`;
  }
  return `about ${span}`;
}

function fmtEpochWallClock(current, target) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return "";
  const ms = Date.now() + (target - current) * APPROX_SECONDS_PER_EPOCH * 1000;
  return fmtWhen(ms);
}

function updateEpochEstimates(currentEpoch) {
  const deadlineEl = $("#w-deadline-ep");
  const graceEl = $("#w-grace-ep");
  const dHint = $("#w-deadline-hint");
  const gHint = $("#w-grace-hint");
  const summary = $("#w-epoch-summary");
  const deadline = deadlineEl ? Number(deadlineEl.value) : NaN;
  const grace = graceEl ? Number(graceEl.value) : NaN;
  if (dHint) {
    if (Number.isFinite(deadline) && Number.isFinite(currentEpoch)) {
      const ahead = deadline - currentEpoch;
      dHint.textContent = ahead > 0
        ? `Epoch ${deadline} is ${fmtEpochDuration(ahead)} from now, around ${fmtEpochWallClock(currentEpoch, deadline)} — a rough estimate. Epochs are not days.`
        : `That deadline is not after the current epoch (${currentEpoch}). Epochs are not days.`;
    } else {
      dHint.textContent = `Epochs are not days. An epoch is on the order of several seconds (a rough figure). Forty-eight epochs would only be a few minutes. The default, once the current epoch is read, is about ${DEFAULT_DEADLINE_DAYS} days ahead (${epochsForDays(DEFAULT_DEADLINE_DAYS).toLocaleString()} epochs).`;
    }
  }
  if (gHint) {
    if (Number.isFinite(grace)) {
      gHint.textContent = `Grace of ${grace.toLocaleString()} epochs is ${fmtEpochDuration(grace)} (rough). Epochs are not days.`;
    } else {
      gHint.textContent = `Time for the referee to rule after the deadline, in epochs — not days. The default is about ${DEFAULT_GRACE_DAYS} days (${epochsForDays(DEFAULT_GRACE_DAYS).toLocaleString()} epochs).`;
    }
  }
  if (summary && Number.isFinite(currentEpoch) && Number.isFinite(deadline) && Number.isFinite(grace)) {
    const timeoutAt = deadline + grace;
    summary.innerHTML = `Current epoch is <b>${currentEpoch.toLocaleString()}</b>. Ruling window ends at epoch <b>${timeoutAt.toLocaleString()}</b>, around <b>${esc(fmtEpochWallClock(currentEpoch, timeoutAt))}</b> — rough, epochs are not days.`;
    summary.hidden = false;
  } else if (summary) {
    summary.hidden = true;
  }
}

async function prefetchEpochDefaults() {
  try {
    const net = await indexerGet("/network");
    const ep = Number(net.epoch ?? net.current_epoch);
    if (!Number.isFinite(ep)) return null;
    window.__stakeEpoch = ep;
    const deadlineEl = $("#w-deadline-ep");
    const graceEl = $("#w-grace-ep");
    if (deadlineEl && !deadlineEl.dataset.touched) {
      deadlineEl.value = String(ep + epochsForDays(DEFAULT_DEADLINE_DAYS));
    }
    if (graceEl && !graceEl.dataset.touched) {
      graceEl.value = String(epochsForDays(DEFAULT_GRACE_DAYS));
    }
    updateEpochEstimates(ep);
    return ep;
  } catch {
    updateEpochEstimates(window.__stakeEpoch);
    return null;
  }
}

function bindEpochFields() {
  const mark = (el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      el.dataset.touched = "1";
      updateEpochEstimates(window.__stakeEpoch);
    });
  };
  mark($("#w-deadline-ep"));
  mark($("#w-grace-ep"));
}

function renderWallet() {
  const root = $("#wallet-root");
  const ready = hasTemplate();
  root.innerHTML = `
    <div class="banner">${
      ready
        ? `Talking to <code>${esc(templateAddress())}</code> on <b>${esc(cfg().network)}</b>. You will be asked to sign in your wallet. This page never sees your keys.`
        : `No published template address is set yet. You can still connect a wallet, read the current epoch, and look up a stake component. To lock funds on-chain, publish the template yourself (see the <a href="https://github.com/Mzee04/stake/blob/main/drafts/publish-checklist.md">publish checklist</a>) and paste the address into <a href="https://github.com/Mzee04/stake/blob/main/web/config.js"><code>config.js</code></a>. Until then, <a href="#/new">use the simulation</a>.`
    }</div>

    <div class="wallet-card">
      <h2>Wallet</h2>
      <p>Works with the Sapient extension or inside Tari Universe. Switch the wallet to the same network as the config (<b>${esc(cfg().network)}</b>).</p>
      <div class="action-row">
        <button type="button" class="btn primary" id="w-connect">Connect wallet</button>
      </div>
      <div id="w-status" class="help" style="margin-top:0.8rem"></div>
    </div>

    <div class="wallet-card">
      <h2>Network</h2>
      <p class="help">Read from the public indexer. No wallet needed.</p>
      <div class="action-row">
        <button type="button" class="btn ghost" id="w-epoch">Read current epoch</button>
      </div>
      <dl class="kv" id="w-net" hidden></dl>
    </div>

    <form class="wallet-card wallet-form" id="w-open" novalidate>
      <h2>Open a stake on-chain</h2>
      <p>This withdraws TARI from your wallet as a stealth bucket and calls <code>Stake.open</code> in the same transaction. The goal text stays here; only the hash is sent. You will confirm in the wallet popup.</p>
      <div class="field">
        <label for="w-goal">Goal <span class="hint-inline">— not sent on-chain</span></label>
        <textarea id="w-goal" rows="2" ${ready ? "" : "disabled"}></textarea>
      </div>
      <div class="row">
        <div class="field">
          <label for="w-amount">Amount (TARI)</label>
          <input id="w-amount" type="number" min="0.000001" step="any" value="1" ${ready ? "" : "disabled"} />
        </div>
        <div class="field">
          <label for="w-deadline-ep">Deadline epoch <span class="hint-inline">— not days</span></label>
          <input id="w-deadline-ep" type="number" min="1" step="1" ${ready ? "" : "disabled"} placeholder="read the current epoch first" />
          <p class="help" id="w-deadline-hint">Epochs are not days. An epoch is on the order of several seconds (a rough figure). Forty-eight epochs would only be a few minutes. The default, once the current epoch is read, is about 30 days ahead.</p>
        </div>
      </div>
      <div class="row">
        <div class="field">
          <label for="w-grace-ep">Grace (epochs, not days)</label>
          <input id="w-grace-ep" type="number" min="0" step="1" ${ready ? "" : "disabled"} />
          <p class="help" id="w-grace-hint">Time for the referee to rule after the deadline, in epochs — not days. The default is about three days of epochs, not twelve days.</p>
        </div>
        <fieldset class="field">
          <legend>If the referee never answers</legend>
          <label class="choice"><input type="radio" name="w-default" value="refund" checked ${ready ? "" : "disabled"} /> Return the money to me</label>
          <label class="choice"><input type="radio" name="w-default" value="sink" ${ready ? "" : "disabled"} /> Send it to the sink</label>
        </fieldset>
      </div>
      <p class="help" id="w-epoch-summary" hidden></p>
      <div class="field">
        <label for="w-referee">Referee public key <span class="hint-inline">— 64 hex characters</span></label>
        <input id="w-referee" spellcheck="false" ${ready ? "" : "disabled"} />
        <p class="help">The only key that can rule. If you paste your own key, this is just a delayed refund button.</p>
      </div>
      <div class="field">
        <label for="w-staker-acct">Your account <span class="hint-inline">— filled on connect, for a refund</span></label>
        <input id="w-staker-acct" spellcheck="false" ${ready ? "" : "disabled"} placeholder="component_…" />
        <p class="help">This is the refund destination, not necessarily checked against the signer. Confirm it is your account before you sign.</p>
      </div>
      <div class="field">
        <label for="w-sink">Sink account <span class="hint-inline">— component_…</span></label>
        <input id="w-sink" spellcheck="false" ${ready ? "" : "disabled"} />
      </div>
      <aside class="honest" style="margin:0.6rem 0 1rem">
        <h2>Both accounts must already exist.</h2>
        <p>The template checks, when you open, that the refund account and the sink can receive a deposit. If they don’t, the transaction is rejected and your funds stay in your wallet. A mistyped address that will never be an account would otherwise make the money unrecoverable — these addresses cannot be changed later.</p>
      </aside>
      <div class="form-actions">
        <button type="submit" class="btn primary" ${ready ? "" : "disabled"}>Lock on-chain</button>
      </div>
      <p class="help">A dry-run is offered by the wallet where it can. Fees come from your revealed TARI balance. After a successful open, save the goal, the salt (shown after you submit), and the new component address.</p>
      <p class="verify-out" id="w-open-out" hidden></p>
    </form>

    <form class="wallet-card wallet-form" id="w-lookup" novalidate>
      <h2>Look up a stake</h2>
      <p>Read a component from the indexer, verify a goal against its hash, and — if you are the referee — rule, or trigger a timeout.</p>
      <div class="field">
        <label for="w-comp">Component address</label>
        <input id="w-comp" spellcheck="false" placeholder="component_…" />
      </div>
      <div class="action-row">
        <button type="submit" class="btn ghost">Read</button>
      </div>
      <div id="w-comp-out"></div>
    </form>
  `;

  $("#w-connect").onclick = connectWallet;
  $("#w-epoch").onclick = readEpoch;
  $("#w-open").addEventListener("submit", openOnChain);
  $("#w-lookup").addEventListener("submit", lookupStake);
  bindEpochFields();
  updateEpochEstimates(window.__stakeEpoch);
  prefetchEpochDefaults();
}

let wallet = null;
let walletAccount = null;

async function connectWallet() {
  const box = $("#w-status");
  wallet = null;
  walletAccount = null;
  const candidates = walletCandidates();
  if (!candidates.length) {
    box.innerHTML = noWalletHtml();
    return;
  }
  let stubOnlyFailure = true;
  for (const p of candidates) {
    try {
      const accts = await p.request({ method: "tari_requestAccounts" });
      if (!accts || !accts[0]) {
        // A provider that returns no accounts is not a connected wallet.
        continue;
      }
      wallet = p;
      walletAccount = accts[0];
      let net = "";
      try {
        net = JSON.stringify(await wallet.request({ method: "tari_getNetwork" }));
      } catch {}
      let bal = "";
      try {
        const balances = await wallet.request({ method: "tari_getBalances" });
        bal = esc(JSON.stringify(balances).slice(0, 400));
      } catch {}
      box.innerHTML = `<span class="ok" style="display:inline-block;padding:0.2rem 0.45rem">Connected</span>
        <dl class="kv">
          <dt>Account</dt><dd>${esc(String(walletAccount || ""))}</dd>
          <dt>Network</dt><dd>${esc(net)}</dd>
          ${bal ? `<dt>Balances</dt><dd>${bal}</dd>` : ""}
        </dl>`;
      if (walletAccount && $("#w-staker-acct")) {
        $("#w-staker-acct").value = String(walletAccount);
      }
      return;
    } catch (e) {
      if (isUniverseStubError(e)) {
        continue;
      }
      stubOnlyFailure = false;
      box.innerHTML = `<span class="bad">${esc(e.message || e)}</span>`;
      return;
    }
  }
  box.innerHTML = stubOnlyFailure
    ? noWalletHtml()
    : `<span class="bad">The wallet did not return an account. Check it is unlocked and set to ${esc(cfg().network)}, then try again.</span>`;
}

async function readEpoch() {
  const dl = $("#w-net");
  dl.hidden = false;
  dl.innerHTML = `<dt>Status</dt><dd>Loading…</dd>`;
  try {
    const net = await indexerGet("/network");
    const shown = net.epoch ?? net.current_epoch ?? JSON.stringify(net);
    dl.innerHTML = `<dt>Epoch</dt><dd>${esc(shown)}</dd>
      <dt>What an epoch is</dt><dd>Not a day. Roughly ${APPROX_SECONDS_PER_EPOCH} seconds, from how fast the counter has been moving — a label, not a promise.</dd>
      <dt>Indexer</dt><dd>${esc(indexerUrl())}</dd>
      <dt>Configured network</dt><dd>${esc(cfg().network)}</dd>`;
    const ep = Number(net.epoch ?? net.current_epoch);
    if (Number.isFinite(ep)) {
      window.__stakeEpoch = ep;
      const deadlineEl = $("#w-deadline-ep");
      const graceEl = $("#w-grace-ep");
      if (deadlineEl && !deadlineEl.dataset.touched) {
        deadlineEl.value = String(ep + epochsForDays(DEFAULT_DEADLINE_DAYS));
      }
      if (graceEl && !graceEl.dataset.touched) {
        graceEl.value = String(epochsForDays(DEFAULT_GRACE_DAYS));
      }
      updateEpochEstimates(ep);
    }
  } catch (e) {
    dl.innerHTML = `<dt>Error</dt><dd>${esc(e.message || e)}</dd>`;
  }
}

/* Minimal CBOR literals for instruction args. Matches tari_bor / minicbor:
   unsigned ints, byte strings, bools, and Tag(128, bytes(32)) component addresses.
   Hash32 and Ristretto public keys are untagged 32-byte strings. */
function cborHead(major, n) {
  const out = [];
  n = BigInt(n);
  if (n < 24n) out.push(major | Number(n));
  else if (n < 256n) out.push(major | 24, Number(n));
  else if (n < 65536n) out.push(major | 25, Number((n >> 8n) & 0xffn), Number(n & 0xffn));
  else if (n < 1n << 32n)
    out.push(major | 26, Number((n >> 24n) & 0xffn), Number((n >> 16n) & 0xffn), Number((n >> 8n) & 0xffn), Number(n & 0xffn));
  else
    out.push(
      major | 27,
      Number((n >> 56n) & 0xffn),
      Number((n >> 48n) & 0xffn),
      Number((n >> 40n) & 0xffn),
      Number((n >> 32n) & 0xffn),
      Number((n >> 24n) & 0xffn),
      Number((n >> 16n) & 0xffn),
      Number((n >> 8n) & 0xffn),
      Number(n & 0xffn),
    );
  return out;
}
function lit(bytes) {
  return { Literal: toHex(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)) };
}
function uintLit(n) {
  return lit(cborHead(0x00, n));
}
function bytesLit(u8) {
  return lit([...cborHead(0x40, u8.length), ...u8]);
}
function boolLit(b) {
  return { Literal: b ? "f5" : "f4" };
}
function componentLit(addr) {
  const hex = String(addr).trim().replace(/^component_/, "");
  const bytes = fromHex(hex);
  if (bytes.length !== 32) throw new Error("A component address must be 32 bytes (64 hex characters, optionally with a component_ prefix).");
  return lit([...cborHead(0xc0, 128), ...cborHead(0x40, 32), ...bytes]);
}
function workspaceArg(id = 0) {
  return { Workspace: { id, offset: null } };
}

/** Convert a TARI decimal string to µT (1 TARI = 1,000,000 µT) without IEEE rounding. */
function tariToMicro(input) {
  const raw = String(input).trim();
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error("The amount has to be a positive number.");
  }
  const [whole, frac = ""] = raw.split(".");
  if (frac.length > 6 && !/^0+$/.test(frac.slice(6))) {
    throw new Error("The smallest unit is 0.000001 TARI (one microTari).");
  }
  const micro = BigInt(whole || "0") * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
  if (micro <= 0n) throw new Error("The amount has to be greater than zero.");
  return micro;
}

async function openOnChain(ev) {
  ev.preventDefault();
  const out = $("#w-open-out");
  out.hidden = false;
  out.className = "verify-out";
  try {
    if (!hasTemplate()) throw new Error("Set a template address in config.js first (see the publish checklist in the repository).");
    if (!wallet) throw new Error("Connect a wallet first.");
    const goal = $("#w-goal").value.trim();
    if (!goal) throw new Error("Write a goal first. It is not sent on-chain.");
    const micro = tariToMicro($("#w-amount").value);
    const deadline = Number($("#w-deadline-ep").value);
    const grace = Number($("#w-grace-ep").value);
    if (!Number.isFinite(deadline) || deadline <= 0) throw new Error("Enter a deadline epoch (read the current epoch first).");
    if (!Number.isFinite(grace) || grace < 0) throw new Error("Grace must be zero or more epochs.");
    const refereeHex = $("#w-referee").value.trim().replace(/^0x/, "");
    const referee = fromHex(refereeHex);
    if (referee.length !== 32) throw new Error("The referee public key must be 32 bytes (64 hex characters).");
    const stakerAcct = $("#w-staker-acct").value.trim();
    const sink = $("#w-sink").value.trim();
    if (!stakerAcct || !sink) throw new Error("Both your account and the sink account are needed so the template can deposit funds to the right place.");
    const refund = document.querySelector('input[name="w-default"]:checked').value === "refund";
    const salt = randomSalt();
    const hash = await goalCommitment(goal, salt);

    const followUp = [
      {
        CallFunction: {
          address: bareTemplate(),
          function: "open",
          args: [
            workspaceArg(0),
            bytesLit(hash),
            bytesLit(referee),
            componentLit(stakerAcct),
            componentLit(sink),
            uintLit(deadline),
            uintLit(grace),
            boolLit(refund),
          ],
        },
      },
    ];

    out.textContent = "Asking the wallet to sign… keep this tab open, and save the salt when it returns.";
    const params = {
      kind: "withdrawStealthAndExecute",
      amount: micro.toString(),
      followUpInstructions: followUp,
      relatedComponents: [stakerAcct, sink].filter(Boolean),
    };
    const result = await sendWalletTx(params);
    const saltHex = toHex(salt);
    const hashHex = toHex(hash);
    out.className = "verify-out ok";
    out.innerHTML = `<b>Save these now. The goal and salt are not on the chain.</b>
      <dl class="kv">
        <dt>Goal</dt><dd>${esc(goal)}</dd>
        <dt>Salt</dt><dd>${esc(saltHex)}</dd>
        <dt>Hash</dt><dd>${esc(hashHex)}</dd>
        <dt>Wallet result</dt><dd>${esc(JSON.stringify(result, null, 0).slice(0, 800))}</dd>
      </dl>
      <p>If the result includes a new component address, paste it into “Look up a stake” below. Keep the referee link yourself: the wording, the salt, and that address.</p>`;
  } catch (e) {
    out.className = "verify-out bad";
    out.textContent = e.message || String(e);
  }
}

async function sendWalletTx(params) {
  // Prefer the transaction-request flow (popup, then poll). Fall back to sign-and-submit.
  if (wallet.request) {
    if (params.kind) {
      try {
        const created = await wallet.request({ method: "tari_createTransactionRequest", params });
        const requestId = created && (created.requestId || created.request_id || created.id);
        if (requestId) {
          // Poll until the user finishes in the popup, up to ~3 minutes.
          for (let i = 0; i < 90; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const st = await wallet.request({ method: "tari_getTransactionRequest", params: { requestId } });
            const status = (st && (st.status || st.state)) || "";
            if (status && /pend/i.test(status)) continue;
            if (st && st.error) throw new Error(typeof st.error === "string" ? st.error : JSON.stringify(st.error));
            if (status && /reject|cancel|fail|denied/i.test(status)) throw new Error(st.note || status);
            if (status && /submit|complete|done|success|signed/i.test(status) && !st.result) {
              try {
                const sub = await wallet.request({ method: "tari_submitTransactionRequest", params: { requestId } });
                return sub;
              } catch {
                return st;
              }
            }
            return st.result || st;
          }
          throw new Error("The wallet request is still pending. Check the popup, then try again.");
        }
        return created;
      } catch (e) {
        // Some wallets want sign-and-submit with instructions instead.
        const msg = e && e.message ? e.message : String(e);
        if (!/unknown method|not found|not implemented|unsupported/i.test(msg)) throw e;
      }
    }
    return wallet.request({
      method: "tari_signAndSubmitTransaction",
      params: params.instructions ? params : { instructions: params.followUpInstructions, dryRun: false },
    });
  }
  throw new Error("This wallet does not expose request().");
}

function parseStakeState(st) {
  const at = (i, ...names) => {
    if (Array.isArray(st) || (st && typeof st === "object" && String(i) in st && st[i] !== undefined && st[i] !== null)) {
      if (st[i] !== undefined && st[i] !== null) return st[i];
    }
    if (st && typeof st === "object") {
      for (const n of names) {
        if (st[n] !== undefined && st[n] !== null) return st[n];
      }
    }
    return undefined;
  };
  return {
    staker: cborHex(at(0, "staker")),
    stakerAccount: cborHex(at(1, "staker_account", "stakerAccount")),
    referee: cborHex(at(2, "referee")),
    sink: cborHex(at(3, "sink")),
    goalHash: cborHex(at(4, "goal_hash", "goalHash")),
    deadline: at(5, "deadline_epoch", "deadlineEpoch", "deadline"),
    grace: at(6, "grace_epochs", "graceEpochs", "grace"),
    refundOnTimeout: at(7, "refund_on_timeout", "refundOnTimeout"),
    amount: at(8, "amount"),
    pot: cborHex(at(9, "pot")),
    status: at(10, "status"),
  };
}

async function lookupStake(ev) {
  ev.preventDefault();
  const box = $("#w-comp-out");
  const id = $("#w-comp").value.trim();
  box.innerHTML = "<p>Reading…</p>";
  try {
    if (!id) throw new Error("Paste a component address.");
    const [net, raw] = await Promise.all([indexerGet("/network"), indexerGet(`/substates/${id}`)]);
    const st =
      raw?.state?.up?.substate?.Component?.body?.state ??
      raw?.substate?.Component?.body?.state ??
      raw?.Component?.body?.state ??
      raw?.state;
    if (st == null || typeof st !== "object") {
      throw new Error("That substate is not a component, or the indexer shape was unexpected: " + JSON.stringify(raw).slice(0, 400));
    }
    const view = parseStakeState(st);
    if (view.status == null || view.goalHash == null) {
      throw new Error("That component does not look like a Stake: " + JSON.stringify(st).slice(0, 400));
    }
    const epoch = Number(net.epoch ?? net.current_epoch);
    const timeout = Number(view.deadline) + Number(view.grace);
    const isOpenStatus = String(view.status) === "open";
    const canRuleNow = isOpenStatus && Number.isFinite(epoch) && epoch < timeout;
    const canTimeoutNow = isOpenStatus && Number.isFinite(epoch) && epoch >= timeout;
    box.innerHTML = `
      <dl class="kv">
        <dt>Status</dt><dd>${esc(view.status)}</dd>
        <dt>Goal hash</dt><dd>${esc(view.goalHash)}</dd>
        <dt>Amount</dt><dd>${esc(view.amount)} µT (if TARI)</dd>
        <dt>Staker</dt><dd>${esc(view.staker)}</dd>
        <dt>Referee</dt><dd>${esc(view.referee)}</dd>
        <dt>Sink</dt><dd>${esc(view.sink)}</dd>
        <dt>Staker account</dt><dd>${esc(view.stakerAccount)}</dd>
        <dt>Deadline epoch</dt><dd>${esc(view.deadline)}</dd>
        <dt>Timeout at</dt><dd>${esc(timeout)} (current ${esc(epoch)})</dd>
        <dt>On timeout</dt><dd>${view.refundOnTimeout ? "refund the staker" : "pay the sink"}</dd>
      </dl>
      <form id="w-verify-onchain" class="verify-form" style="box-shadow:none;border:1px solid var(--line);margin:0.6rem 0" novalidate>
        <h2 style="font-size:1.15rem">Verify a goal against this hash</h2>
        <div class="field"><label for="wv-goal">Goal text</label><textarea id="wv-goal" rows="2"></textarea></div>
        <div class="field"><label for="wv-salt">Salt (64 hex characters)</label><input id="wv-salt" spellcheck="false" /></div>
        <button type="submit" class="btn ghost">Verify</button>
        <p class="verify-out" id="wv-out" hidden></p>
      </form>
      <div class="action-row" style="margin-top:0.8rem">
        <button type="button" class="btn success" data-rule="rule_success" ${canRuleNow ? "" : "disabled"}>Rule: success</button>
        <button type="button" class="btn danger" data-rule="rule_fail" ${canRuleNow ? "" : "disabled"}>Rule: fail</button>
        <button type="button" class="btn warn" data-rule="timeout" ${canTimeoutNow ? "" : "disabled"}>Timeout</button>
      </div>
      <p class="help">${
        !isOpenStatus
          ? "This stake is already settled."
          : canTimeoutNow
            ? "The ruling window has closed. Anyone can apply the default. The referee can no longer rule."
            : canRuleNow
              ? `The referee can still rule (until epoch ${timeout}; current ${epoch}). Timeout is offered only once that epoch is reached — the same way the simulation disables it. The template remains the real authority and will reject a wrong signer or an early timeout.`
              : "Could not compare the current epoch to the timeout. The template will still reject a wrong signer or an early timeout."
      }</p>
      <p class="verify-out" id="w-rule-out" hidden></p>
    `;
    $("#w-verify-onchain").addEventListener("submit", async (e) => {
      e.preventDefault();
      const o = $("#wv-out");
      o.hidden = false;
      try {
        const salt = fromHex($("#wv-salt").value);
        if (salt.length !== 32) throw new Error("The salt must be 32 bytes.");
        const h = toHex(await goalCommitment($("#wv-goal").value.trim(), salt));
        const expect = String(view.goalHash).toLowerCase().replace(/^0x/, "");
        const ok = h === expect;
        o.className = `verify-out ${ok ? "ok" : "bad"}`;
        o.textContent = ok ? "It matches the on-chain hash." : `It does not match. Computed ${h}, on-chain ${expect}.`;
      } catch (err) {
        o.className = "verify-out bad";
        o.textContent = err.message || String(err);
      }
    });
    box.querySelectorAll("[data-rule]").forEach((b) => {
      b.addEventListener("click", () => ruleOnChain(id, b.dataset.rule));
    });
  } catch (e) {
    box.innerHTML = `<p class="form-error">${esc(e.message || e)}</p>`;
  }
}

async function ruleOnChain(component, method) {
  const out = $("#w-rule-out");
  out.hidden = false;
  out.className = "verify-out";
  try {
    if (!wallet) throw new Error("Connect a wallet first. The referee must be the signer for a ruling.");
    out.textContent = "Asking the wallet to sign…";
    const instructions = [
      {
        CallMethod: {
          call: { Address: component },
          method,
          args: [],
        },
      },
    ];
    const result = await sendWalletTx({ instructions });
    const txid = result && (result.transactionId || result.transaction_id || result.id || result.hash);
    out.className = "verify-out ok";
    out.innerHTML = `Submitted.${
      txid ? ` Transaction: <a href="${esc(explorerUrl())}/tx/${esc(txid)}" target="_blank" rel="noopener">${esc(txid)}</a>.` : ""
    } <span class="help">${esc(JSON.stringify(result).slice(0, 500))}</span>`;
  } catch (e) {
    out.className = "verify-out bad";
    out.textContent = e.message || String(e);
  }
}

/* ───────────────────────────── boot ───────────────────────────── */

route();

// Self-check the documented hash vector. Failures are logged, never shown as a crash.
goalCommitment(KNOWN_VECTOR.goal, fromHex(KNOWN_VECTOR.salt)).then((h) => {
  if (toHex(h) !== KNOWN_VECTOR.hash) {
    console.warn("Stake: goal-hash test vector did not match. Got", toHex(h));
  }
});
