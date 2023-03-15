# Fees

The [`Bridge.sol`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/Bridge.sol) contract collects fees on every new deposit made. To achieve this, it calls a fee handler specified using the [`adminChangeFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/Bridge.sol#L202) method. Different fee handler implementations can be used as long as they follow the [`IFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/interfaces/IFeeHandler.sol) interface.

> In all Sygma environments, the [`FeeHandlerRouter`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/FeeHandlerRouter.sol) implementation is used as this root `IFeeHandler`. This particular implementation allows for more granular control of handling fees based on the resourceID and destination domainID.

## IFeeHandler interface

The [`IFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/interfaces/IFeeHandler.sol interface outlines the events and function signatures required by any fee handler implementation. The following function signatures are mandatory:

- [`collectFee(...)`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/interfaces/IFeeHandler.sol#L50) - This function collects the fee based on the parameters provided and is called internally on every deposit request.
- [`calculateFee(...)`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/interfaces/IFeeHandler.sol#L63) - This function calculates the final fee amount based on the given parameters. It returns the final fee amount as a `uint256` and the address of the token in which the fee is being paid as an `address`.

### FeeCollected event

The fee handler implementation should emit the `FeeCollected` event every time the fee is successfully collected on the source chain. The `tokenAddress` parameter represents the token address in which the fee was collected, with `0` representing the base currency.

With the current handler implementations, fees can be collected in base currency (`tokenAddress == 0`) with: `DynamicGenericFeeHandlerEVM` and `BasicFeeHandler`.

```solidity
event FeeCollected(
    address sender,
    uint8 fromDomainID,
    uint8 destinationDomainID,
    bytes32 resourceID,
    uint256 fee,
    address tokenAddress
);
```

### FeeDistributed event

Fee handlers may implement the logic for distributing the collected fees. This logic should emit the `FeeDistributed` event for each address that receives a share of the fees.

```solidity
event FeeDistributed(
    address tokenAddress,
    address recipient,
    uint256 amount
);
```

## FeeHandlerRouter

The [`FeeHandlerRouter`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/FeeHandlerRouter.sol) implementation of the [`IFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/interfaces/IFeeHandler.sol) interface allows for the registration of different fee strategies per resource ID and domain ID, which facilitates Sygma's concept of [granular fee handling](https://github.com/sygmaprotocol/sygma-relayer/blob/main/docs/general/Fees.md#fees).

To configure a router, the [`adminSetResourceHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/FeeHandlerRouter.sol#L54) function is provided. By calling this method, the admin can define a specific fee strategy for bridging a resource (defined by the `resourceID` argument) to a specific destination domain (defined by the `destinationDomainID` argument).

## Fee Handler implementations

### BasicFeeHandler

_Implementation of [Sygma static fee strategy.](https://github.com/sygmaprotocol/sygma-relayer/blob/main/docs/general/Fees.md#static-fee-strategy)_

This handler implementation allows for the collection of a predefined static amount of fee (in the native token) on each deposit request. This amount is defined as a contract property [`_fee`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/BasicFeeHandler.sol#L17).

When initially deployed, `BasicFeeHandler` has a default fee amount of 0. The admin can change the fee amount at any moment by invoking [`changeFee`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/BasicFeeHandler.sol#L95) function.

It is important to note that for each new static fee amount, a new `BasicFeeHandler` contract needs to be deployed.

### DynamicFeeHandler

_Implementations of [Sygma dynamic fee strategy.](https://github.com/sygmaprotocol/sygma-relayer/blob/main/docs/general/Fees.md#dynamic-fee-strategy)_

The [`DynamicFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicFeeHandler.sol) implementation of the [`IFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/interfaces/IFeeHandler.sol) interface allows for the usage of fee estimates provided by the [Sygma Fee Oracle service](https://github.com/sygmaprotocol/sygma-fee-oracle/blob/main/docs/Home.md). It has multiple concrete implementations that are all based on the [`DynamicFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicFeeHandler.sol), which is implementing shared logic.

#### On-chain setup

After a concrete handler is deployed, the admin needs to set up the address of the fee oracle service by invoking the [`setFeeOracle`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicFeeHandler.sol#L91) function. This address (_public key_) is used to verify the signature of each fee estimate provided on deposit. In addition to this, the admin needs to configure fee properties by invoking [`setFeeProperties`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicFeeHandler.sol#L101) function and provide properties:

- **gasUsed** - a static amount of units of gas that can be used for calculating the final fee. Only used by some conrete implementations.
- **feePercent** - the percent of the deposited amount taken as a fee.

#### Implementations

Each concrete implementation needs to implement [custom logic for calculating fees](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicFeeHandler.sol#L137) based on the provided arguments.

##### [DynamicERC20FeeHandlerEVM](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicERC20FeeHandlerEVM.sol)

*Used when destination network (domain) is an EVM based chain*

###### Final fee calculation:

`final_fee = feeOracleMsg.dstGasPrice * _gasUsed * feeOracleMsg.ter`

##### [DynamicERC20FeeHandlerSubstrate](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicERC20FeeHandlerSubstrate.sol)

*Used when destination network (domain) is an Substrate based chain*

###### Final fee calculation:

`final_fee = feeOracleMsg.inclusionFee * feeOracleMsg.ter`

##### [DynamicGenericFeeHandlerEVM](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicGenericFeeHandlerEVM.sol)

*Used when destination network (domain) is an EVM based chain and generic message is being bridged*

###### Final fee calculation:

`final_fee = feeOracleMsg.dstGasPrice * feeOracleMsg.msgGasLimit * feeOracleMsg.ber`

##### DynamicGenericFeeHandlerSubstrate (NOT IMPLEMENTED)

*Used when destination network (domain) is an EVM based chain and generic message is being bridged*

###### Final fee calculation:

`final_fee = feeOracleMsg.inclusionFee * feeOracleMsg.ber`
