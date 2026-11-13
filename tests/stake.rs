//! Engine tests for Stake, run in-process against the real Ootle engine.
//!
//! Covers the required paths: success, fail, timeout-refund, timeout-sink,
//! wrong referee rejected, double-ruling rejected, early timeout rejected.
//! Also: past deadline rejected, a deadline equal to now, zero stake rejected,
//! goal verification (wrong goal and wrong salt), a referee still ruling
//! during the grace window, grace of zero, deadline-plus-grace overflow,
//! and payout accounts that are missing or not accounts.

use sha2::{Digest, Sha256};
use tari_template_lib::types::{
    Amount, ComponentAddress, Hash32, ResourceAddress,
    crypto::RistrettoPublicKeyBytes,
};
use tari_template_test_tooling::{
    TemplateTest,
    byte_type::ToByteType,
    crypto::{PublicKey as _, RistrettoPublicKey, RistrettoSecretKey},
    engine_types::virtual_substate::{VirtualSubstate, VirtualSubstateId},
    transaction::{Transaction, args},
};

const STAKE: u64 = 1_000;
const START: u64 = 10;
const DEADLINE: u64 = 20;
const GRACE: u64 = 5; // timeout at epoch 25
const GOAL: &str = "run a 5k before the year ends";

struct Party {
    sk: RistrettoSecretKey,
    pk: RistrettoPublicKeyBytes,
    account: ComponentAddress,
}

struct World {
    test: TemplateTest,
    _coin: ComponentAddress,
    coin_res: ResourceAddress,
    stake: ComponentAddress,
    staker: Party,
    referee: Party,
    sink: Party,
    stranger: Party,
    goal_hash: Hash32,
    salt: [u8; 32],
    refund_on_timeout: bool,
}

fn set_epoch(test: &mut TemplateTest, epoch: u64) {
    test.set_virtual_substate(VirtualSubstateId::CurrentEpoch, VirtualSubstate::CurrentEpoch(epoch));
}

fn salt() -> [u8; 32] {
    [0x11; 32]
}

/// Must match `stake::goal_commitment`: sha256(b"stake/goal/v1" || text || salt).
fn goal_commitment(text: &str, s: &[u8; 32]) -> Hash32 {
    let mut h = Sha256::new();
    h.update(b"stake/goal/v1");
    h.update(text.as_bytes());
    h.update(s);
    Hash32::from_array(h.finalize().into())
}

fn party(test: &mut TemplateTest) -> Party {
    let (account, _proof, sk) = test.create_empty_account();
    let pk = RistrettoPublicKey::from_secret_key(&sk).to_byte_type();
    Party { sk, pk, account }
}

fn world(refund_on_timeout: bool) -> World {
    world_at(refund_on_timeout, START, DEADLINE, GRACE, STAKE, GOAL)
}

fn world_at(
    refund_on_timeout: bool,
    start: u64,
    deadline: u64,
    grace: u64,
    amount: u64,
    goal: &str,
) -> World {
    let mut test = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["templates/stake", "templates/test_coin"]);
    test.enable_auto_add_proofs_from_signers();
    set_epoch(&mut test, start);

    let coin: ComponentAddress = test.call_function("TestCoin", "new", args![Amount::from(1_000_000u64)], vec![]);
    let coin_res: ResourceAddress = test.call_method(coin, "resource", args![], vec![]);

    let staker = party(&mut test);
    let referee = party(&mut test);
    let sink = party(&mut test);
    let stranger = party(&mut test);

    let s = salt();
    let goal_hash = goal_commitment(goal, &s);

    let open = test
        .transaction()
        .call_method(coin, "take", args![Amount::from(amount)])
        .put_last_instruction_output_on_workspace("stake")
        .call_function(
            test.get_template_address("Stake"),
            "open",
            args![
                Workspace("stake"),
                goal_hash,
                referee.pk,
                staker.account,
                sink.account,
                deadline,
                grace,
                refund_on_timeout
            ],
        )
        .finish()
        .seal(&staker.sk);
    let result = test.execute_expect_success(open, vec![]);
    let reserved = [coin, staker.account, referee.account, sink.account, stranger.account];
    let stake = result
        .finalize
        .result
        .accept()
        .unwrap()
        .up_iter()
        .find_map(|(id, _)| {
            id.as_component_address()
                .filter(|a| !reserved.contains(a))
        })
        .expect("stake component");

    World {
        test,
        _coin: coin,
        coin_res,
        stake,
        staker,
        referee,
        sink,
        stranger,
        goal_hash,
        salt: s,
        refund_on_timeout,
    }
}

fn run(w: &mut World, t: Transaction) -> Result<(), String> {
    let r = w.test.execute_and_commit_on_success(t, vec![]);
    match r.finalize.result.any_reject() {
        Some(reason) => Err(reason.to_string()),
        None => Ok(()),
    }
}

#[derive(Clone, Copy)]
enum Who {
    Staker,
    Referee,
    Sink,
    Stranger,
}

fn key(w: &World, who: Who) -> RistrettoSecretKey {
    match who {
        Who::Staker => w.staker.sk.clone(),
        Who::Referee => w.referee.sk.clone(),
        Who::Sink => w.sink.sk.clone(),
        Who::Stranger => w.stranger.sk.clone(),
    }
}

fn account(w: &World, who: Who) -> ComponentAddress {
    match who {
        Who::Staker => w.staker.account,
        Who::Referee => w.referee.account,
        Who::Sink => w.sink.account,
        Who::Stranger => w.stranger.account,
    }
}

fn call(w: &mut World, method: &str, who: Who) -> Result<(), String> {
    let signer = key(w, who);
    let t = w
        .test
        .transaction()
        .call_method(w.stake, method, args![])
        .finish()
        .seal(&signer);
    run(w, t)
}

fn balance(w: &mut World, who: Who) -> Amount {
    let account = account(w, who);
    let res = w.coin_res;
    w.test.call_method(account, "balance", args![res], vec![])
}

fn status(w: &mut World) -> String {
    w.test.call_method(w.stake, "status", args![], vec![])
}

fn pot(w: &mut World) -> Amount {
    w.test.call_method(w.stake, "pot_balance", args![], vec![])
}

fn expect_err(r: Result<(), String>, needle: &str) {
    match r {
        Ok(()) => panic!("expected failure containing {needle:?}, got success"),
        Err(e) => assert!(e.contains(needle), "expected {needle:?} in {e:?}"),
    }
}

/// Known test vector, also used by the web app: goal "run a 5k before the year ends", salt 0x11×32.
#[test]
fn goal_hash_matches_the_documented_vector() {
    let hash = goal_commitment(GOAL, &salt());
    let expected = Hash32::from_array(hex_array(
        "e812a457194e9f1907c959abd315848f538fb7029c5144fc064b76d23de22975",
    ));
    assert_eq!(hash, expected);
}

fn hex_array(s: &str) -> [u8; 32] {
    let mut out = [0u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
    }
    out
}

#[test]
fn success_returns_funds_to_the_staker() {
    let mut w = world(true);
    assert_eq!(status(&mut w), "open");
    assert_eq!(pot(&mut w), Amount::from(STAKE));
    assert_eq!(balance(&mut w, Who::Staker), Amount::zero());

    let hash: Hash32 = w.test.call_method(w.stake, "goal_hash", args![], vec![]);
    assert_eq!(hash, w.goal_hash);
    let referee: RistrettoPublicKeyBytes = w.test.call_method(w.stake, "referee", args![], vec![]);
    assert_eq!(referee, w.referee.pk);
    let timeout_at: u64 = w.test.call_method(w.stake, "timeout_at", args![], vec![]);
    assert_eq!(timeout_at, DEADLINE + GRACE);

    let ok: bool = w.test.call_method(
        w.stake,
        "verify_goal",
        args![GOAL.as_bytes().to_vec(), Hash32::from_array(w.salt)],
        vec![],
    );
    assert!(ok, "the real goal should verify");
    let bad: bool = w.test.call_method(
        w.stake,
        "verify_goal",
        args![b"a different goal".to_vec(), Hash32::from_array(w.salt)],
        vec![],
    );
    assert!(!bad, "a different goal must not verify");
    let bad_salt: bool = w.test.call_method(
        w.stake,
        "verify_goal",
        args![GOAL.as_bytes().to_vec(), Hash32::from_array([0x22; 32])],
        vec![],
    );
    assert!(!bad_salt, "the right goal with a wrong salt must not verify");

    call(&mut w, "rule_success", Who::Referee).expect("rule_success");
    assert_eq!(status(&mut w), "succeeded");
    assert_eq!(pot(&mut w), Amount::zero());
    assert_eq!(balance(&mut w, Who::Staker), Amount::from(STAKE));
    assert_eq!(balance(&mut w, Who::Sink), Amount::zero());
}

#[test]
fn fail_sends_funds_to_the_sink() {
    let mut w = world(true);
    call(&mut w, "rule_fail", Who::Referee).expect("rule_fail");
    assert_eq!(status(&mut w), "failed");
    assert_eq!(pot(&mut w), Amount::zero());
    assert_eq!(balance(&mut w, Who::Staker), Amount::zero());
    assert_eq!(balance(&mut w, Who::Sink), Amount::from(STAKE));
}

#[test]
fn timeout_refund_returns_funds_to_the_staker() {
    let mut w = world(true);
    assert!(w.refund_on_timeout);
    set_epoch(&mut w.test, DEADLINE + GRACE);
    // Anyone may call timeout — use a stranger.
    call(&mut w, "timeout", Who::Stranger).expect("timeout");
    assert_eq!(status(&mut w), "timed_out");
    assert_eq!(pot(&mut w), Amount::zero());
    assert_eq!(balance(&mut w, Who::Staker), Amount::from(STAKE));
    assert_eq!(balance(&mut w, Who::Sink), Amount::zero());
}

#[test]
fn timeout_sink_sends_funds_to_the_sink() {
    let mut w = world(false);
    assert!(!w.refund_on_timeout);
    set_epoch(&mut w.test, DEADLINE + GRACE + 3);
    call(&mut w, "timeout", Who::Staker).expect("timeout");
    assert_eq!(status(&mut w), "timed_out");
    assert_eq!(pot(&mut w), Amount::zero());
    assert_eq!(balance(&mut w, Who::Staker), Amount::zero());
    assert_eq!(balance(&mut w, Who::Sink), Amount::from(STAKE));
}

#[test]
fn wrong_referee_is_rejected() {
    let mut w = world(true);
    expect_err(
        call(&mut w, "rule_success", Who::Stranger),
        "Only the referee can rule",
    );
    expect_err(
        call(&mut w, "rule_fail", Who::Staker),
        "Only the referee can rule",
    );
    assert_eq!(status(&mut w), "open");
    assert_eq!(pot(&mut w), Amount::from(STAKE));
}

#[test]
fn double_ruling_is_rejected() {
    let mut w = world(true);
    call(&mut w, "rule_success", Who::Referee).expect("first ruling");
    expect_err(
        call(&mut w, "rule_success", Who::Referee),
        "This stake is already settled",
    );
    expect_err(
        call(&mut w, "rule_fail", Who::Referee),
        "This stake is already settled",
    );
    expect_err(
        call(&mut w, "timeout", Who::Stranger),
        "This stake is already settled",
    );
    // Funds moved only once.
    assert_eq!(balance(&mut w, Who::Staker), Amount::from(STAKE));
    assert_eq!(balance(&mut w, Who::Sink), Amount::zero());
}

#[test]
fn early_timeout_is_rejected() {
    let mut w = world(true);
    // At the starting epoch.
    expect_err(
        call(&mut w, "timeout", Who::Stranger),
        "Too early to time out",
    );
    // At the goal deadline, grace has not finished.
    set_epoch(&mut w.test, DEADLINE);
    expect_err(
        call(&mut w, "timeout", Who::Stranger),
        "Too early to time out",
    );
    // The last epoch of the grace window is still too early (`timeout_at` is exclusive of "before").
    set_epoch(&mut w.test, DEADLINE + GRACE - 1);
    expect_err(
        call(&mut w, "timeout", Who::Stranger),
        "Too early to time out",
    );
    assert_eq!(status(&mut w), "open");
    assert_eq!(pot(&mut w), Amount::from(STAKE));
}

#[test]
fn referee_may_still_rule_during_grace() {
    let mut w = world(true);
    set_epoch(&mut w.test, DEADLINE + GRACE - 1);
    call(&mut w, "rule_fail", Who::Referee).expect("rule during grace");
    assert_eq!(status(&mut w), "failed");
    assert_eq!(balance(&mut w, Who::Sink), Amount::from(STAKE));
}

#[test]
fn referee_cannot_rule_after_the_window() {
    let mut w = world(true);
    set_epoch(&mut w.test, DEADLINE + GRACE);
    expect_err(
        call(&mut w, "rule_success", Who::Referee),
        "The ruling window has closed",
    );
    // Timeout is the remaining path.
    call(&mut w, "timeout", Who::Stranger).expect("timeout");
    assert_eq!(status(&mut w), "timed_out");
}

#[test]
fn timeout_then_ruling_is_rejected() {
    let mut w = world(false);
    set_epoch(&mut w.test, DEADLINE + GRACE);
    call(&mut w, "timeout", Who::Stranger).expect("timeout");
    expect_err(
        call(&mut w, "rule_success", Who::Referee),
        "This stake is already settled",
    );
    assert_eq!(balance(&mut w, Who::Sink), Amount::from(STAKE));
}

#[test]
fn a_past_deadline_is_rejected() {
    let mut test = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["templates/stake", "templates/test_coin"]);
    test.enable_auto_add_proofs_from_signers();
    set_epoch(&mut test, 50);
    let coin: ComponentAddress = test.call_function("TestCoin", "new", args![Amount::from(1_000_000u64)], vec![]);
    let staker = party(&mut test);
    let referee = party(&mut test);
    let sink = party(&mut test);
    let t = test
        .transaction()
        .call_method(coin, "take", args![Amount::from(STAKE)])
        .put_last_instruction_output_on_workspace("stake")
        .call_function(
            test.get_template_address("Stake"),
            "open",
            args![
                Workspace("stake"),
                goal_commitment(GOAL, &salt()),
                referee.pk,
                staker.account,
                sink.account,
                40u64, // before current epoch 50
                GRACE,
                true
            ],
        )
        .finish()
        .seal(&staker.sk);
    let r = test.execute_and_commit_on_success(t, vec![]);
    let reason = r.finalize.result.any_reject().expect("should reject").to_string();
    assert!(
        reason.contains("Deadline must be in the future"),
        "unexpected reject: {reason}"
    );
}

/// Shared helper: try to open a stake and return the reject reason, or panic on success.
fn open_reject(
    test: &mut TemplateTest,
    coin: ComponentAddress,
    staker: &Party,
    referee: &Party,
    staker_account: ComponentAddress,
    sink_account: ComponentAddress,
    deadline: u64,
    grace: u64,
    amount: Option<u64>,
) -> String {
    let mut tx = test.transaction();
    tx = if let Some(amount) = amount {
        tx.call_method(coin, "take", args![Amount::from(amount)])
    } else {
        tx.call_method(coin, "zero_bucket", args![])
    };
    let t = tx
        .put_last_instruction_output_on_workspace("stake")
        .call_function(
            test.get_template_address("Stake"),
            "open",
            args![
                Workspace("stake"),
                goal_commitment(GOAL, &salt()),
                referee.pk,
                staker_account,
                sink_account,
                deadline,
                grace,
                true
            ],
        )
        .finish()
        .seal(&staker.sk);
    let r = test.execute_and_commit_on_success(t, vec![]);
    r.finalize
        .result
        .any_reject()
        .expect("open should have been rejected")
        .to_string()
}

fn fresh() -> (TemplateTest, ComponentAddress, Party, Party, Party) {
    let mut test = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["templates/stake", "templates/test_coin"]);
    test.enable_auto_add_proofs_from_signers();
    set_epoch(&mut test, START);
    let coin: ComponentAddress = test.call_function("TestCoin", "new", args![Amount::from(1_000_000u64)], vec![]);
    let staker = party(&mut test);
    let referee = party(&mut test);
    let sink = party(&mut test);
    (test, coin, staker, referee, sink)
}

#[test]
fn a_zero_stake_is_rejected() {
    let (mut test, coin, staker, referee, sink) = fresh();
    // `zero_bucket` builds an empty bucket of a fresh resource, because
    // `Vault::withdraw(0)` is rejected by the engine and would never reach
    // the template's "must be positive" check.
    let reason = open_reject(
        &mut test,
        coin,
        &staker,
        &referee,
        staker.account,
        sink.account,
        DEADLINE,
        GRACE,
        None,
    );
    assert!(
        reason.contains("The stake must be positive"),
        "unexpected reject: {reason}"
    );
}

#[test]
fn a_deadline_equal_to_the_current_epoch_is_rejected() {
    let (mut test, coin, staker, referee, sink) = fresh();
    let reason = open_reject(
        &mut test,
        coin,
        &staker,
        &referee,
        staker.account,
        sink.account,
        START, // equal to the current epoch, not strictly in the future
        GRACE,
        Some(STAKE),
    );
    assert!(
        reason.contains("Deadline must be in the future"),
        "unexpected reject: {reason}"
    );
}

#[test]
fn deadline_plus_grace_overflow_is_rejected() {
    let (mut test, coin, staker, referee, sink) = fresh();
    let reason = open_reject(
        &mut test,
        coin,
        &staker,
        &referee,
        staker.account,
        sink.account,
        u64::MAX,
        1,
        Some(STAKE),
    );
    assert!(
        reason.contains("Deadline plus grace overflows"),
        "unexpected reject: {reason}"
    );
}

#[test]
fn a_missing_staker_account_is_rejected() {
    let (mut test, coin, staker, referee, sink) = fresh();
    let missing = ComponentAddress::from_array([0xAB; 32]);
    let reason = open_reject(
        &mut test,
        coin,
        &staker,
        &referee,
        missing,
        sink.account,
        DEADLINE,
        GRACE,
        Some(STAKE),
    );
    // A missing component panics inside `get_state_value` with an engine
    // error; a present non-account hits our own assert (tested below).
    assert!(
        reason.contains("The staker refund account must be an existing account")
            || reason.to_lowercase().contains("not found")
            || reason.to_lowercase().contains("does not exist")
            || reason.to_lowercase().contains("substate"),
        "unexpected reject: {reason}"
    );
}

#[test]
fn a_missing_sink_account_is_rejected() {
    let (mut test, coin, staker, referee, _sink) = fresh();
    let missing = ComponentAddress::from_array([0xCD; 32]);
    let reason = open_reject(
        &mut test,
        coin,
        &staker,
        &referee,
        staker.account,
        missing,
        DEADLINE,
        GRACE,
        Some(STAKE),
    );
    assert!(
        reason.contains("The sink payout account must be an existing account")
            || reason.to_lowercase().contains("not found")
            || reason.to_lowercase().contains("does not exist")
            || reason.to_lowercase().contains("substate"),
        "unexpected reject: {reason}"
    );
}

#[test]
fn a_non_account_sink_is_rejected() {
    let (mut test, coin, staker, referee, _sink) = fresh();
    // The TestCoin component exists, but it is not an Account and cannot
    // receive a deposit. This is the "typo that will never be creatable" case.
    let reason = open_reject(
        &mut test,
        coin,
        &staker,
        &referee,
        staker.account,
        coin,
        DEADLINE,
        GRACE,
        Some(STAKE),
    );
    assert!(
        reason.contains("The sink payout account must be an existing account that can receive a deposit"),
        "unexpected reject: {reason}"
    );
}

#[test]
fn a_non_account_staker_refund_is_rejected() {
    let (mut test, coin, staker, referee, sink) = fresh();
    let reason = open_reject(
        &mut test,
        coin,
        &staker,
        &referee,
        coin,
        sink.account,
        DEADLINE,
        GRACE,
        Some(STAKE),
    );
    assert!(
        reason.contains("The staker refund account must be an existing account that can receive a deposit"),
        "unexpected reject: {reason}"
    );
}

#[test]
fn grace_of_zero_times_out_at_the_deadline() {
    // timeout_at == deadline; the referee may rule only before that epoch.
    let mut w = world_at(true, START, DEADLINE, 0, STAKE, GOAL);
    let timeout_at: u64 = w.test.call_method(w.stake, "timeout_at", args![], vec![]);
    assert_eq!(timeout_at, DEADLINE);

    set_epoch(&mut w.test, DEADLINE - 1);
    call(&mut w, "rule_success", Who::Referee).expect("referee may rule before the deadline");
    // Reset with a fresh stake to test the timeout side.
    let mut w = world_at(true, START, DEADLINE, 0, STAKE, GOAL);
    set_epoch(&mut w.test, DEADLINE);
    expect_err(
        call(&mut w, "rule_success", Who::Referee),
        "The ruling window has closed",
    );
    call(&mut w, "timeout", Who::Stranger).expect("timeout at the deadline");
    assert_eq!(status(&mut w), "timed_out");
    assert_eq!(balance(&mut w, Who::Staker), Amount::from(STAKE));
    assert_eq!(pot(&mut w), Amount::zero());
}
