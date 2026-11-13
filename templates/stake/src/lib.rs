//! # Stake
//!
//! A commitment contract on Tari Ootle.
//!
//! You lock funds against a private goal and name a referee you already trust. Only a
//! hash of the goal text and a salt goes on-chain, so a debt, a health goal, or a habit
//! stays off the public record. If the referee marks the goal met, the funds return to
//! your account. If they mark it missed, the funds go to a sink you chose up front (a
//! friend, or a cause). If they say nothing by the deadline plus a grace window, a
//! default you picked at the start runs: refund, or pay the sink. Anyone can trigger
//! that timeout once the window has closed.
//!
//! The referee can lie. That is inherent — the same way it is on stickK — and must be
//! said plainly. The chain cannot see whether you hit your goal. It only holds the
//! money and follows the call.
//!
//! Amounts sit in a component vault and are public. The privacy claim is the goal text,
//! not the amount.
//!
//! Built for the Tari November 2026 MVP contest. MIT licensed.

use tari_template_lib::prelude::*;

/// Domain tag for a goal commitment: `sha256(GOAL_DOMAIN || goal_text || salt)`.
/// Off-chain tools and tests must use exactly this formula.
pub const GOAL_DOMAIN: &[u8] = b"stake/goal/v1";

/// Hash a goal and a salt (32 bytes). The text never goes on-chain; only this hash does.
pub fn goal_commitment(goal_text: &[u8], salt: &[u8]) -> Hash32 {
    intrinsics::hash_sha256_parts(&[GOAL_DOMAIN, goal_text, salt])
}

#[template]
mod stake {
    use super::*;

    pub struct Stake {
        staker: RistrettoPublicKeyBytes,
        /// Account that receives a refund (success, or a refund-on-timeout).
        staker_account: ComponentAddress,
        referee: RistrettoPublicKeyBytes,
        /// Account that receives the funds on a fail, or on a sink-on-timeout.
        sink: ComponentAddress,
        goal_hash: Hash32,
        deadline_epoch: u64,
        grace_epochs: u64,
        /// If true, a timeout returns funds to the staker. If false, they go to the sink.
        refund_on_timeout: bool,
        /// Original locked amount. Kept after payout so a settled stake can still be read.
        amount: Amount,
        pot: Vault,
        /// `"open"`, `"succeeded"`, `"failed"`, or `"timed_out"`.
        status: String,
    }

    /// A single public snapshot of a stake. Used by `get`.
    pub struct StakeView {
        pub staker: RistrettoPublicKeyBytes,
        pub staker_account: ComponentAddress,
        pub referee: RistrettoPublicKeyBytes,
        pub sink: ComponentAddress,
        pub goal_hash: Hash32,
        pub deadline_epoch: u64,
        pub grace_epochs: u64,
        pub timeout_at: u64,
        pub refund_on_timeout: bool,
        pub amount: Amount,
        pub pot_balance: Amount,
        pub resource: ResourceAddress,
        pub status: String,
    }

    impl Stake {
        /// Lock `stake` against `goal_hash`. The transaction signer is the staker.
        ///
        /// * `referee` — the only key that may call `rule_success` or `rule_fail`.
        /// * `staker_account` — where a refund is deposited. Must already exist
        ///   as an account that can receive a deposit; this is checked here.
        /// * `sink` — where funds go on a fail, or on a sink-on-timeout.
        ///   Same existence check as `staker_account`. A mistyped address that
        ///   is never an account would otherwise make the funds unrecoverable.
        /// * `deadline_epoch` — must be strictly in the future. This is the goal deadline.
        /// * `grace_epochs` — extra epochs after the deadline for the referee to rule.
        ///   Timeout becomes available at `deadline_epoch + grace_epochs`.
        /// * `refund_on_timeout` — the default if the referee never rules.
        pub fn open(
            stake: Bucket,
            goal_hash: Hash32,
            referee: RistrettoPublicKeyBytes,
            staker_account: ComponentAddress,
            sink: ComponentAddress,
            deadline_epoch: u64,
            grace_epochs: u64,
            refund_on_timeout: bool,
        ) -> Component<Self> {
            let now = Consensus::current_epoch();
            assert!(deadline_epoch > now, "Deadline must be in the future");
            assert!(stake.amount().is_positive(), "The stake must be positive");
            let timeout_at = deadline_epoch
                .checked_add(grace_epochs)
                .expect("Deadline plus grace overflows");
            assert!(timeout_at > now, "The ruling window must end in the future");

            // Both payout destinations must already be accounts that can take a
            // deposit. If we only found out at `pay`, a mistyped address that
            // will never be creatable would trap the funds: the template cannot
            // change these addresses after `open`, and every payout would fail.
            Self::assert_payout_account(staker_account, "The staker refund account");
            Self::assert_payout_account(sink, "The sink payout account");

            let staker = CallerContext::transaction_signer_public_key();
            let amount = stake.amount();
            let pot = Vault::from_bucket(stake);

            emit_event(
                "opened",
                metadata![
                    "staker" => staker.to_string(),
                    "referee" => referee.to_string(),
                    "amount" => amount.to_string(),
                    "deadline" => deadline_epoch.to_string(),
                ],
            );

            Component::new(Self {
                staker,
                staker_account,
                referee,
                sink,
                goal_hash,
                deadline_epoch,
                grace_epochs,
                refund_on_timeout,
                amount,
                pot,
                status: String::from("open"),
            })
            .with_access_rules(AccessRules::allow_all())
            .create()
        }

        /// Referee only, before the timeout epoch: the goal was met. Funds return to the staker.
        pub fn rule_success(&mut self) {
            self.assert_referee();
            self.assert_open();
            self.assert_before_timeout();
            self.status = String::from("succeeded");
            self.pay(self.staker_account);
            emit_event("ruled", metadata!["outcome" => "succeeded"]);
        }

        /// Referee only, before the timeout epoch: the goal was missed. Funds go to the sink.
        pub fn rule_fail(&mut self) {
            self.assert_referee();
            self.assert_open();
            self.assert_before_timeout();
            self.status = String::from("failed");
            self.pay(self.sink);
            emit_event("ruled", metadata!["outcome" => "failed"]);
        }

        /// Anyone, at or after `deadline + grace`: apply the default chosen at `open`.
        pub fn timeout(&mut self) {
            self.assert_open();
            self.assert_after_timeout();
            self.status = String::from("timed_out");
            if self.refund_on_timeout {
                self.pay(self.staker_account);
            } else {
                self.pay(self.sink);
            }
            emit_event(
                "timed_out",
                metadata![
                    "refunded" => self.refund_on_timeout.to_string(),
                ],
            );
        }

        // ── views ──────────────────────────────────────────────────────────

        pub fn get(&self) -> StakeView {
            StakeView {
                staker: self.staker,
                staker_account: self.staker_account,
                referee: self.referee,
                sink: self.sink,
                goal_hash: self.goal_hash,
                deadline_epoch: self.deadline_epoch,
                grace_epochs: self.grace_epochs,
                timeout_at: self.timeout_epoch(),
                refund_on_timeout: self.refund_on_timeout,
                amount: self.amount,
                pot_balance: self.pot.balance(),
                resource: self.pot.resource_address(),
                status: self.status.clone(),
            }
        }

        pub fn staker(&self) -> RistrettoPublicKeyBytes {
            self.staker
        }

        pub fn staker_account(&self) -> ComponentAddress {
            self.staker_account
        }

        pub fn referee(&self) -> RistrettoPublicKeyBytes {
            self.referee
        }

        pub fn sink(&self) -> ComponentAddress {
            self.sink
        }

        pub fn goal_hash(&self) -> Hash32 {
            self.goal_hash
        }

        pub fn deadline_epoch(&self) -> u64 {
            self.deadline_epoch
        }

        pub fn grace_epochs(&self) -> u64 {
            self.grace_epochs
        }

        pub fn timeout_at(&self) -> u64 {
            self.timeout_epoch()
        }

        pub fn refund_on_timeout(&self) -> bool {
            self.refund_on_timeout
        }

        pub fn amount(&self) -> Amount {
            self.amount
        }

        pub fn pot_balance(&self) -> Amount {
            self.pot.balance()
        }

        pub fn resource(&self) -> ResourceAddress {
            self.pot.resource_address()
        }

        pub fn status(&self) -> String {
            self.status.clone()
        }

        /// True if a reveal of `goal_text` with `salt` matches the on-chain hash.
        /// `salt` is a Hash32 (32 bytes), the same width as the salt used to open.
        pub fn verify_goal(&self, goal_text: Vec<u8>, salt: Hash32) -> bool {
            goal_commitment(&goal_text, salt.as_ref()) == self.goal_hash
        }

        // ── internals ──────────────────────────────────────────────────────

        fn assert_payout_account(address: ComponentAddress, role: &str) {
            // `get_state_value` panics if the component does not exist, which
            // rejects `open` and returns the stake bucket to the caller.
            let state = ComponentManager::get(address).get_state_value();
            assert!(
                Account::from_value(&state).is_ok(),
                "{role} must be an existing account that can receive a deposit"
            );
        }

        fn pay(&mut self, to: ComponentAddress) {
            let amt = self.pot.balance();
            // A zero pot should never happen on a successful path, but withdrawing zero is safer
            // than panicking after status has already been written (the whole call is atomic
            // anyway). A positive pot is the normal case.
            if amt.is_positive() {
                let bucket = self.pot.withdraw(amt);
                ComponentManager::get(to).invoke("deposit", args![bucket]);
            }
        }

        fn timeout_epoch(&self) -> u64 {
            self.deadline_epoch
                .checked_add(self.grace_epochs)
                .expect("Deadline plus grace overflows")
        }

        fn assert_referee(&self) {
            assert_eq!(
                CallerContext::transaction_signer_public_key(),
                self.referee,
                "Only the referee can rule"
            );
        }

        fn assert_open(&self) {
            assert_eq!(self.status, "open", "This stake is already settled");
        }

        fn assert_before_timeout(&self) {
            assert!(
                Consensus::current_epoch() < self.timeout_epoch(),
                "The ruling window has closed"
            );
        }

        fn assert_after_timeout(&self) {
            assert!(
                Consensus::current_epoch() >= self.timeout_epoch(),
                "Too early to time out"
            );
        }
    }
}
