<p align="center"><a href="https://buildwithsygma.com"><img width="250" title="Sygma solidity" src='assets/full-logo.png'/></a></p>

# sygma-solidity

Sygma uses Solidity smart contracts to enable transfers to and from EVM compatible chains. These contracts consist of a core bridge contract (Bridge.sol) and a set of handler contracts (ERC20Handler.sol, ERC721Handler.sol, PermissionedGenericHandler.sol, PermissionlessGenericHandler.sol). The bridge contract is responsible for initiating and executing proposed transfers. The handlers are used by the bridge contract to interact with other existing contracts.

## Deployments

To deploy contracts run `truffle migrate --network NETWORK_NAME --file <path_to_env_config>`.

For more details on specific flags that can be used and format of environemnt configuration check out [migrations documentation page](/docs/migrations.md).

To add another network do the following:
 * update `truffle-config.js` with the desired configuration
 * add the required params to config file for the desired environment (local,dev,testnet,mainnet)
 * create a deploy script in `migrations` directory

## Dependencies

Requires `nodejs` and `npm`.

## Commands

`make install-deps`: Installs truffle and ganache globally, fetches local dependencies. Also installs `abigen` from `go-ethereum`.

`make bindings`: Creates go bindings in `./build/bindings/go`

`PORT=<port> SILENT=<bool> make start-ganache`: Starts a ganache instance, default `PORT=8545 SILENT=false`

`QUIET=<bool> make start-geth`: Starts a geth instance with test keys

`PORT=<port> make deploy`: Deploys all contract instances, default `PORT=8545`

`make test`: Runs truffle tests.

`make compile`: Compile contracts.

# Sygma Security Policy

## Reporting a Security Bug

We take all security issues seriously, if you believe you have found a security issue within a Sygma
project please notify us immediately. If an issue is confirmed, we will take all necessary precautions
to ensure a statement and patch release is made in a timely manner.

Please email us a description of the flaw and any related information (e.g. reproduction steps, version) to
[dev@buildwithsygma.com](mailto:dev@buildwithsygma.com).
