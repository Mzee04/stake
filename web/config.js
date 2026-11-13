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
    // Verified 13 Nov 2026: returns {"network":"mainnet",…} with CORS *.
    // The older host ootle-indexer.tari.com fails TLS (unexpected eof).
    mainnet: "https://indexer-a.ootle.tari.com",
  },
  explorer: {
    // Veil, the Ootle L2 explorer. Verified 13 Nov 2026 against its own
    // network config: testnet-explorer.tari.mw talks to the Esmeralda
    // indexer; explorer.tari.mw talks to mainnet. explore.tari.com is the
    // Minotari L1 explorer, not Ootle, and is not used here.
    esmeralda: "https://testnet-explorer.tari.mw",
    mainnet: "https://explorer.tari.mw",
  },
};
