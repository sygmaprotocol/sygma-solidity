/**
 * Copyright 2020 ChainSafe Systems
 * SPDX-License-Identifier: LGPL-3.0-only
 */
require("dotenv").config();

/**
 * Use this file to configure your truffle project. It's seeded with some
 * common settings for different networks and features like migrations,
 * compilation and testing. Uncomment the ones you need or modify
 * them to suit your project as necessary.
 *
 * More information about configuration can be found at:
 *
 * truffleframework.com/docs/advanced/configuration
 *
 * To deploy via Infura you'll need a wallet provider (like truffle-hdwallet-provider)
 * to sign your transactions before they're sent to a remote public node. Infura accounts
 * are available for free at: infura.io/register.
 *
 * You'll also need a mnemonic - the twelve word phrase the wallet uses to generate
 * public/private key pairs. If you're publishing your code to GitHub make sure you load this
 * phrase from a file you've .gitignored so it doesn't accidentally become public.
 *
 */

const HDWalletProvider = require("@truffle/hdwallet-provider");
// const infuraKey = "fj4jll3k.....";
//
// const fs = require('fs');
// const mnemonic = fs.readFileSync(".secret").toString().trim();

module.exports = {
  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a development blockchain for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  plugins: ["solidity-coverage", "truffle-plugin-verify"],
  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache-cli, geth or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.
    networkCheckTimeout: 10000,
    geth: {
     host: "127.0.0.1",     // Localhost (default: none)
     port: 8545,            // Standard Ethereum port (default: none)
     network_id: "5",       // Any network (default: none)
    },
    test: {
      host: "127.0.0.1",     // Localhost (default: none)
      port: 8545,            // Standard Ethereum port (default: none)
      network_id: "*",       // Any network (default: none)
      disableConfirmationListener: true,
    },
    test2: {
      host: "127.0.0.1",     // Localhost (default: none)
      port: 8547,            // Standard Ethereum port (default: none)
      network_id: "*",       // Any network (default: none)
      disableConfirmationListener: true,
    },
    goerli: {
      provider: () => {
        return new HDWalletProvider({
          mnemonic: process.env.GOERLI_MNEMONIC,
          providerOrUrl: process.env.GOERLI_PROVIDER_URL
        })
      },
      networkCheckTimeout: 10000,
      timeoutBlocks: 200,
      network_id: "5",
      gasPrice: 30000000000,  // 30 gwei
    },
    mumbai: {
      provider: () => {
        return new HDWalletProvider({
          mnemonic: process.env.MUMBAI_MNEMONIC,
          providerOrUrl: process.env.MUMBAI_PROVIDER_URL
        })
      },
      networkCheckTimeout: 10000,
      timeoutBlocks: 200,
      network_id: "80001",
      gasPrice: 30000000000,  // 30 gwei
    },
    moonbase: {
      provider: () => {
        return new HDWalletProvider({
          mnemonic: process.env.MOONBASE_MNEMONIC,
          providerOrUrl: process.env.MOONBASE_PROVIDER_URL
        })
      },
      networkCheckTimeout: 10000,
      timeoutBlocks: 200,
      network_id: "1287",
      gasPrice: 30000000000,  // 30 gwei
    },
    gnosis: {
      provider: () => {
        return new HDWalletProvider({
          mnemonic: process.env.GNOSIS_MNEMONIC,
          providerOrUrl: process.env.GNOSIS_PROVIDER_URL
        })
      },
      networkCheckTimeout: 10000,
      timeoutBlocks: 200,
      network_id: "100",
      gasPrice: 2000000000,  // 2 gwei
    },
    base:{
      provider: () => {
        return new HDWalletProvider({
          mnemonic: process.env.BASE_MNEMONIC,
          providerOrUrl: process.env.BASE_PROVIDER_URL
        })
      },
      networkCheckTimeout: 100000,
      timeoutBlocks: 200,
      network_id: "84531",
      gasPrice: 150000000,  // 0.15 gwei
    },
    cronos: {
      provider: () => {
        return new HDWalletProvider({
          mnemonic: process.env.CRONOS_MNEMONIC,
          providerOrUrl: process.env.CRONOS_PROVIDER
        })
      },
      networkCheckTimeout: 10000,
      timeoutBlocks: 200,
      network_id: "338",
      gasPrice: 2000000000000,  // 2000 gwei
    },
    mainnet: {
      provider: () => {
        return new HDWalletProvider({
          mnemonic: process.env.MAINNET_MNEMONIC,
          providerOrUrl: process.env.MAINNET_PROVIDER
        })
      },
      networkCheckTimeout: 100000,
      timeoutBlocks: 200,
      network_id: "1",
      gasPrice: 17000000000,  // 17 gwei
    }
    // Another network with more advanced options...
    // advanced: {
      // port: 8777,             // Custom port
      // network_id: 1342,       // Custom network
      // gas: 8500000,           // Gas sent with each transaction (default: ~6700000)
      // gasPrice: 20000000000,  // 20 gwei (in wei) (default: 100 gwei)
      // from: <address>,        // Account to send txs from (default: accounts[0])
      // websockets: true        // Enable EventEmitter interface for web3 (default: false)
    // },

    // Useful for deploying to a public network.
    // NB: It's important to wrap the provider as a function.
    // ropsten: {
      // provider: () => new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/YOUR-PROJECT-ID`),
      // network_id: 3,       // Ropsten's id
      // gas: 5500000,        // Ropsten has a lower block limit than mainnet
      // confirmations: 2,    // # of confs to wait between deployments. (default: 0)
      // timeoutBlocks: 200,  // # of blocks before a deployment times out  (minimum/default: 50)
      // skipDryRun: true     // Skip dry run before migrations? (default: false for public nets )
    // },

    // Useful for private networks
    // private: {
      // provider: () => new HDWalletProvider(mnemonic, `https://network.io`),
      // network_id: 2111,   // This network is yours, in the cloud.
      // production: true    // Treats this network as if it was a public net. (default: false)
    // }
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    // timeout: 100000
  },
  // Explorer api keys for verifying contracts
  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
    moonscan: process.env.MOONSCAN_API_KEY,
    polygonscan: process.env.POLYGONSCAN_API_KEY,
    gnosisscan: process.env.GNOSISSCAN_API_KEY,
    cronoscan: process.env.CRONOSSCAN_API_KEY
  },
  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.11",       // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {          // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 200
        },
        evmVersion: "london"
      }
    }
  }
}
