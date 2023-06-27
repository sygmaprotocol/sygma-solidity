// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "./DynamicFeeHandler.sol";

/**
    @title Handles deposit fees on Substrate based on Effective rates provided by Fee oracle.
    @author ChainSafe Systems.
    @notice This contract is intended to be used with the Bridge contract.
 */
contract DynamicERC20FeeHandlerEVM is DynamicFeeHandler {

    /**
        @param bridgeAddress Contract address of previously deployed Bridge.
        @param feeHandlerRouterAddress Contract address of previously deployed FeeHandlerRouter.
     */
    constructor(address bridgeAddress, address feeHandlerRouterAddress) DynamicFeeHandler(bridgeAddress, feeHandlerRouterAddress) {
    }

     /**
        @notice Calculates fee for deposit for Substrate.
        This function is almost identical to the _calculateFee function in the base contract.
        The differences are: unpacking of the oracle message and the txCost calculation formula.
        Oracle will do the calculation of the tx cost and provide the resulting fee to the contract.
        The resulting calculation is:
        txCost = inclusionFee * oracleMessage.ter / 1e18
        @param sender Sender of the deposit.
        @param fromDomainID ID of the source chain.
        @param destinationDomainID ID of chain deposit will be bridged to.
        @param resourceID ResourceID to be used when making deposits.
        @param depositData Additional data about the deposit.
        @param feeData Additional data to be passed to the fee handler.
        @return fee Returns the fee amount.
        @return tokenAddress Returns the address of the token to be used for fee.
     */
    function _calculateFee(address sender, uint8 fromDomainID, uint8 destinationDomainID, bytes32 resourceID, bytes calldata depositData, bytes calldata feeData) internal view override returns(uint256 fee, address tokenAddress) {
        /**
            Message:
            ber * 10^18:  uint256 (not used)
            ter * 10^18:  uint256
            dstGasPrice:  uint256
            expiresAt:    uint256
            fromDomainID: uint8 encoded as uint256
            toDomainID:   uint8 encoded as uint256
            resourceID:   bytes32
            msgGasLimit:  uint256 (not used)
            sig:          bytes(65 bytes)

            total in bytes:
            message:
            32 * 8  = 256
            message + sig:
            256 + 65 = 321

            amount: uint256 (not used)
            total: 353
        */

        if (feeData.length != 353) revert IncorrectFeeDataLength(feeData.length);

        FeeDataType memory feeDataDecoded;
        uint256 txCost;

        feeDataDecoded.message = bytes(feeData[: 256]);
        feeDataDecoded.sig = bytes(feeData[256: 321]);

        OracleMessageType memory oracleMessage = abi.decode(feeDataDecoded.message, (OracleMessageType));
        if (block.timestamp > oracleMessage.expiresAt) revert ObsoleteOracleData();
        if ((oracleMessage.fromDomainID != fromDomainID) ||
            (oracleMessage.toDomainID != destinationDomainID) ||
            (oracleMessage.resourceID != resourceID)
        ) {
            revert IncorrectDepositParams(
                oracleMessage.fromDomainID,
                oracleMessage.toDomainID,
                oracleMessage.resourceID
            );
        }


        bytes32 messageHash = keccak256(feeDataDecoded.message);

        verifySig(messageHash, feeDataDecoded.sig, _oracleAddress);

        address tokenHandler = IBridge(_bridgeAddress)._resourceIDToHandlerAddress(resourceID);
        tokenAddress = IERCHandler(tokenHandler)._resourceIDToTokenContractAddress(resourceID);

        // txCost = dstGasPrice * _gasUsed * Token Effective Rate (rate of dest base currency to token)
        txCost = oracleMessage.dstGasPrice * _gasUsed * oracleMessage.ter / 1e18;

        uint256 depositAmount;
        (depositAmount) = abi.decode(depositData, (uint256));

        fee = depositAmount * _feePercent / 1e4; // 100 for percent and 100 to avoid precision loss

        if (fee < txCost) {
            fee = txCost;
        }
        return (fee, tokenAddress);
    }
}
