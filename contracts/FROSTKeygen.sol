// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract FROSTKeygen is Ownable {

    constructor (address initialOwner){}

    event StartedFROSTKeygen(bytes32 resourceID); 
    
    /**
        @param resourceID ResourceID for which the keygen is initiated. 
     */
    function startKeygen(bytes32 resourceID) public onlyOwner { 
        emit StartedFROSTKeygen(resourceID); 
    }

}