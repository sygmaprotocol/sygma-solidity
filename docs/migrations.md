To deploy contracts run `truffle migrate --network NETWORK_NAME --file <path_to_env_config>`.

### Flags

To deploy new handlers for tokens and register them on bridge contract provide: `--redeploy-token-handlers` flag.

### Environment configuration

Each domain is defined with:

- `domainID`: a string representing the domain ID
- `MPCAddress`: a string representing the MPC address. If omitted endKeygen will not be called as part of the migration script.
- `fee`: an object containing a definition of the fee handlers that will be deployed.The current limitation is that only one `BasicFeeHandler` and one `DynamicERC20FeeHandlerEVM` can be deployed using the migration script.
  - `basic`: _fee handler properties that will be configured after deployment_
    - `fee`: a string representing a fee amount
  - `oracle`: _fee handler properties that will be configured after deployment_
    - `gasUsed`: a string representing a amount of units of gas that should be used for calculating transaction cost
    - `feePercentage`: a number representing the percentage of the total deposited amount that will be taken as a fee (this is only applicable if the calculated transaction cost is smaller than the fee calculated as a percentage of the deposited amount)
- `access`: an object containing access control information used for transferring admin access as the final step of the migration. If omitted, this migration step will be skipped.
  - `feeHandlerAdmin`: an address to which admin access for all deployed fee handlers will be renounced
  - `feeRouterAdmin`: an address to which admin access for deployed fee router will be renounced
  - `accessControl`: an object representing an access control map (each property defines specific function and address that will be granted access to this function)
- `erc721`: an array of ERC721 tokens, with the following properties:
  - `name`: a string representing the name of the token
  - `symbol`: a string representing the symbol of the token
  - `uri`: a string representing the URI of the metadata
  - `resourceID`: a string representing Sygma's cross-chain resourceID
  - `feeType`: a string representing the type of fee handler that should be registered for this token for all destination networks (`oracle` or `basic`)
- `erc20`: an array of ERC20 tokens, with the following properties:
  - `name`: a string representing the name of the token
  - `symbol`: a string representing the symbol of the token
  - `resourceID`: a string representing Sygma's cross-chain resourceID
  - `feeType`: a string representing the type of fee handler that should be registered for this token for all destination networks (`oracle` or `basic`)
  - `strategy`: a string representing the token issuance strategy (`mb` for mint/burn or `lr` for lock/release)
  - `decimals`: a string representing the number of decimals for the token
- `permissionedGeneric`: an array of permissioned generic resources, with the following properties:
  - `resourceID`: a string representing Sygma's cross-chain resourceID
  - `feeType`: a string representing the type of fee handler that should be registered for this resource for all destination networks (`oracle` or `basic`)
  - `depositFunctionSig`: a string representing the deposit function signature
  - `depositorOffset`: a number representing the depositor offset
  - `executeFunctionSig`: a string representing the function signature of the function that should be called on execution
- `permissionlessGeneric`: permissionless generic handler deployment definition:
  - `resourceID`: a string representing Sygma's cross-chain resourceID
  - `feeType`: a string representing the type of fee handler that should be registered for this resource for all destination networks (`oracle` or `basic`)
