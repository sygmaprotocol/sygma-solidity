# Fees

The **Bridge.sol** contract is responsible for collecting fees on every new deposit made. To achieve this, it calls a fee handler that can be specified using the [`adminChangeFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/92e2d4d52754cbbf510f247cacf09ad3f71aa469/contracts/Bridge.sol#L202) method. As long as the fee handler follows the [`IFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/interfaces/IFeeHandler.sol) interface, different implementations can be utilized.

> In all Sygma environments, the `IFeeHandler` implementation used is the [`FeeHandlerRouter`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/FeeHandlerRouter.sol). This particular implementation allows for more granular control of handling fees based on the resourceID and destination domainID.


#### IFeeHandler
The IFeeHandler interface outlines the events and function signatures required by any fee handler implementation. The following are the mandatory function signatures:

- `collectFee(...)` - This function collects the fee based on the parameters provided and is called on every deposit request.
- `calculateFee(...)` - This function calculates the final fee amount based on the given parameters. It returns the final fee amount as a uint256 and the address of the token in which the fee is being paid as an address.

##### FeeCollected event

The fee handler implementation should emit the `FeeCollected` event every time the fee is successfully collected on the source chain. The `tokenAddress` parameter represents the token address in which the fee was collected, with `0` representing the base currency.

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

##### FeeDistributed event

Fee handlers may implement the logic for distributing the collected fees. This logic should emit the `FeeDistributed` event for each address that receives a share of the fees.

```solidity
event FeeDistributed(
    address tokenAddress,
    address recipient,
    uint256 amount
);
```

#### FeeHandlerRouter

This implementation of the [`IFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/interfaces/IFeeHandler.sol) interface allows for the registration of different fee strategies per resource ID and domain ID, which facilitates Sygma's concept of [granular fee handling](https://github.com/sygmaprotocol/sygma-relayer/wiki/General#fees).

To configure a router, the [`adminSetResourceHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/8acbcf051959da21180cf8b9ea708860b0f2fb8e/contracts/handlers/FeeHandlerRouter.sol#L54) function is provided. By calling this method, the admin can define a specific fee strategy for bridging a resource (defined by the `resourceID` argument) to a specific destination domain (defined by the `destinationDomainID` argument).

#### BasicFeeHandler
_Implementation of [Sygma static fee strategy.](https://github.com/sygmaprotocol/sygma-relayer/wiki/General#static-fee-strategy)_

This handler implementation allows for the collection of a predefined static amount of fee (in the native token) on each deposit request. The amount is defined as a contract property [`_fee`](https://github.com/sygmaprotocol/sygma-solidity/blob/8acbcf051959da21180cf8b9ea708860b0f2fb8e/contracts/handlers/fee/BasicFeeHandler.sol#L17).

When initially deployed, `BasicFeeHandler` has a default fee amount of 0. The admin can change the fee amount at any moment by invoking [`changeFee`](https://github.com/sygmaprotocol/sygma-solidity/blob/8acbcf051959da21180cf8b9ea708860b0f2fb8e/contracts/handlers/fee/BasicFeeHandler.sol#L95) function.

It is important to note that for each new static fee amount, a new `BasicFeeHandler` contract needs to be deployed.

#### DynamicFeeHandler
_Implementations of [Sygma dynamic fee strategy.](https://github.com/sygmaprotocol/sygma-relayer/wiki/General#dynamic-fee-strategy)_

This handler implementation allows for the usage of **FeeEstimates** provided by the [Sygma Fee Oracle service](https://github.com/sygmaprotocol/sygma-fee-oracle/wiki). It has multiple concrete implementations that are all based on the [`DynamicFeeHandler`](https://github.com/sygmaprotocol/sygma-solidity/blob/master/contracts/handlers/fee/DynamicFeeHandler.sol), which is implementing shared logic.

After a concrete handler is deployed, the admin needs to set up the address of the fee oracle service by invoking the [`setFeeOracle`](https://github.com/sygmaprotocol/sygma-solidity/blob/8acbcf051959da21180cf8b9ea708860b0f2fb8e/contracts/handlers/fee/DynamicFeeHandler.sol#L91) function. This address (*public key*) is used to verify the signature of each fee estimate provided on deposit.

In addition to this, the admin needs to configure two properties by invoking [`setFeeProperties`](https://github.com/sygmaprotocol/sygma-solidity/blob/8acbcf051959da21180cf8b9ea708860b0f2fb8e/contracts/handlers/fee/DynamicFeeHandler.sol#L101) function:
- **gasUsed** - a static amount of units of gas that can be used for calculating the final fee.
- **feePercent** - the percent of the deposited amount taken as a fee.

Each concrete implementation needs to implement [custom logic for calculating fees](https://github.com/sygmaprotocol/sygma-solidity/blob/8acbcf051959da21180cf8b9ea708860b0f2fb8e/contracts/handlers/fee/DynamicFeeHandler.sol#L137) based on the provided arguments. 

*Based on resource type and different destination chains, we have multiple concrete implementations of `DynamicFeeHandler`.*

##### DynamicERC20FeeHandlerEVM (WIP)


##### DynamicERC20FeeHandlerSubstrate (WIP)


##### DynamicGenericFeeHandlerEVM (WIP)