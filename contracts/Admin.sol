// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Admin is Ownable {

    event StartedFROSTKeygen();
    event StartedFROSTRefresh(string publicKey);
    event TransferLiquidity(uint8 domainID, bytes32 resourceID, uint256 amount, bytes32 destinationAddress);

    /**
       @notice Emits {StartedFROSTKeygen} event
     */
    function startFROSTKeygen() public onlyOwner { 
        emit StartedFROSTKeygen(); 
    }

    /**
       @notice Emits {StartedFROSTRefresh} event
       @param publicKey hex encoded public key of the subset to be refreshed
     */
    function startFROSTRefresh(string calldata publicKey) public onlyOwner { 
        emit StartedFROSTRefresh(publicKey); 
    }

    /**
        @notice Emits {TransferLiqudity} event that is used on relayer to move liquidity with the MPC address.
        @notice Primarily used when switching MPC addresses and liquidity needs to be moved to the new address
            on networks without smart contracts.
        @param domainID domain ID of the network where the transfer should happen
        @param resourceID resourceID of the token to be moved
        @param amount amount of tokens to be moved
        @param destinationAddress destination address where the tokens should end up
     */
    function transferLiquidity(uint8 domainID, bytes32 resourceID, uint256 amount, bytes32 destinationAddress) public onlyOwner { 
        emit TransferLiquidity(domainID, resourceID, amount, destinationAddress); 
    }
}