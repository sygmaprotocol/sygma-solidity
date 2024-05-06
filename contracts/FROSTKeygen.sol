// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract FROSTKeygen is Ownable {

    bool private keygenStarted; 
    event StartedFROSTKeygen(); 

    modifier onlyOnce(){
        require (!keygenStarted, "FROST keygen can be called only once");
        _; 
        keygenStarted = true; 
    }
    
    /**
       @notice Emits {StartedFROSTKeygen} event
     */
    function startFROSTKeygen() public onlyOwner onlyOnce { 
        emit StartedFROSTKeygen(); 
    }

}