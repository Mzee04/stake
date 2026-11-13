/* Network and template settings for the on-chain path.
   Leave templateAddress empty until you have published the template yourself.
   The simulation does not use this file. */
window.STAKE_CONFIG = {
  // "esmeralda" (testnet) or "mainnet"
  network: "esmeralda",
  // Paste the published address, e.g. "template_abc123…". Empty = simulation only.
  templateAddress: "",
  indexer: {
    esmeralda: "https://ootle-indexer-a.tari.com",
    // Confirm this against current docs before a mainnet publish; it is a starting point.
    mainnet: "https://ootle-indexer.tari.com",
  },
  explorer: {
    esmeralda: "https://explorer.tari.mw",
    mainnet: "https://explore.tari.com",
  },
};
