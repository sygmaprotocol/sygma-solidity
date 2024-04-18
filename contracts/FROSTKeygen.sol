// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract FROSTKeygen is Ownable {

    bool private functionCalled; 
    event StartedFROSTKeygen(); 

    modifier onlyOnce(){
        require (!functionCalled, "Function can be called only once");
        _; 
        functionCalled = true; 
    }
    
    /**
       @notice Emits {StartedFROSTKeygen} event
     */
    function startFROSTKeygen() public onlyOwner onlyOnce { 
        emit StartedFROSTKeygen(); 
    }

}