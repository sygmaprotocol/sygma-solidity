To deploy contracts run `truffle migrate --network NETWORK_NAME --file <path_to_env_config>`.

### Flags

To deploy new handlers for tokens and register them on bridge contract provide: `--redeploy-token-handlers` flag.

### Environment configuration

Each domain is defined with:

- `domainID`: a string representing the domain ID
- `MPCAddress`: a string representing the MPC address. If omitted endKeygen will not be called as part of the migration script.
- `access`: an object containing access control information used for transferring admin access as the final step of the migration. If omitted, this migration step will be skipped.
  - `feeHandlerAdmin`: an address to which admin access for all deployed fee handlers will be renounced
  - `feeRouterAdmin`: an address to which admin access for deployed fee router will be renounced
  - `accessControl`: an object representing an access control map (each property defines specific function and address that will be granted access to this function)
- `erc721`: an array of ERC721 tokens, with the following properties:
  - `name`: a string representing the name of the token
  - `symbol`: a string representing the symbol of the token
  - `uri`: a string representing the URI of the metadata
  - `resourceID`: a string representing Sygma's cross-chain resourceID
  - `feeType`: a string representing the type of fee handler that should be registered for this token for all destination networks (`basic` or `twap`)
- `erc20`: an array of ERC20 tokens, with the following properties:
  - `name`: a string representing the name of the token
  - `symbol`: a string representing the symbol of the token
  - `resourceID`: a string representing Sygma's cross-chain resourceID
  - `feeType`: a string representing the type of fee handler that should be registered for this token for all destination networks (`basic`, `percentage` or `twap`)
  - `strategy`: a string representing the token issuance strategy (`mb` for mint/burn or `lr` for lock/release)
  - `decimals`: a string representing the number of decimals for the token
- `gmp`: general message passing handler deployment definition:
  - `resourceID`: a string representing Sygma's cross-chain resourceID
  - `feeType`: a string representing the type of fee handler that should be registered for this resource for all destination networks (`basic` or `twap`)
