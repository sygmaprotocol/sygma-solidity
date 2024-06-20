// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract FROSTKeygen is Ownable {

    bool private keygenEnded = false; 

    event StartedFROSTKeygen();
    event EndedFROSTKeygen();

    /**
       @notice Emits {StartedFROSTKeygen} event
     */
    function startFROSTKeygen() public onlyOwner { 
        require (!keygenEnded, "FROST keygen ended");

        emit StartedFROSTKeygen(); 
    }

    /**
       @notice Blocks further calls for starting keygen.
     */
    function endFROSTKeygen() public onlyOwner { 
        keygenEnded = true;

        emit EndedFROSTKeygen();
    }

}