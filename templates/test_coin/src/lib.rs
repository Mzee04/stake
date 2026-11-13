//! Test-only helper: hands out a public fungible coin so engine tests can lock a stake without TARI.
use tari_template_lib::prelude::*;

#[template]
mod test_coin {
    use super::*;

    pub struct TestCoin {
        coins: Vault,
    }

    impl TestCoin {
        pub fn new(supply: Amount) -> Component<Self> {
            let coins = ResourceBuilder::public_fungible()
                .with_token_symbol("COIN")
                .initial_supply(supply);
            Component::new(Self {
                coins: Vault::from_bucket(coins),
            })
            .with_access_rules(AccessRules::allow_all())
            .create()
        }

        pub fn resource(&self) -> ResourceAddress {
            self.coins.resource_address()
        }

        pub fn take(&mut self, amount: Amount) -> Bucket {
            self.coins.withdraw(amount)
        }

        /// A zero-amount bucket of a fresh public resource, so tests can
        /// exercise `Stake.open`'s "must be positive" check. `Vault::withdraw(0)`
        /// is rejected by the engine, which would otherwise mask that check.
        pub fn zero_bucket(&self) -> Bucket {
            ResourceBuilder::public_fungible()
                .with_token_symbol("ZERO")
                .initial_supply(Amount::from(0u64))
        }
    }
}
