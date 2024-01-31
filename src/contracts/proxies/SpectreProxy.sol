// The Licensed Work is (c) 2023 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

pragma solidity 0.8.11;

import "../interfaces/ISpectre.sol";
import "../utils/AccessControl.sol";

/**
    @title Proxies calls to Spectre https://github.com/ChainSafe/Spectre/blob/main/contracts/src/Spectre.sol
    to enable multiple domain support
    @author ChainSafe Systems.
 */
contract SpectreProxy is AccessControl {

    uint8 public constant STATE_ROOT_INDEX = 18;

    // source domainID => slot => state root
    mapping(uint8 => mapping(uint256 => bytes32)) public stateRoots;

    // source domainID => spectre contract address
    mapping(uint8 => address) public spectreContracts;

    event CommitteeRotated(uint8 sourceDomainID, uint256 slot);
    event StateRootSubmitted(uint8 sourceDomainID, uint256 slot, bytes32 stateRoot);

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    function _onlyAdmin() private view {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "sender doesn't have admin role");
    }

    /**
        @notice Initializes spectre proxy and sets initial
        spectre addresses.
        @param domainIDS List of to be domain IDs.
        @param spectreAddresses List of spectre addresses.
    */
    constructor(uint8[] memory domainIDS, address[] memory spectreAddresses) {
        require(domainIDS.length == spectreAddresses.length, "array length should be equal");
        for (uint8 i = 0; i < domainIDS.length; i++) {
            spectreContracts[domainIDS[i]] = spectreAddresses[i];
        }

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
        @notice Admin function that sets the spectre address for a domain
        @param sourceDomainID Domain ID of the source chain
        @param spectreAddress Address of the contract
     */
    function adminSetSpectreAddress(uint8 sourceDomainID, address spectreAddress) external onlyAdmin {
        spectreContracts[sourceDomainID] = spectreAddress;
    }

    /**
        @notice Proxy for the Spectre rotate function that supports multiple domains
        @param sourceDomainID DomainID of the network for which the proof is submitted
        @param rotateInput The input to the sync step
        @param rotateProof The proof for the rotation
        @param stepInput The input to the sync step
        @param stepProof The proof for the sync step
    */
    function rotate(
        uint8 sourceDomainID, 
        ISpectre.RotateInput calldata rotateInput, 
        bytes calldata rotateProof, 
        ISpectre.SyncStepInput calldata stepInput, 
        bytes calldata stepProof
    ) external {
        address spectreAddress = spectreContracts[sourceDomainID];
        require(spectreAddress != address(0), "no spectre address found");

        ISpectre spectre = ISpectre(spectreAddress);
        spectre.rotate(rotateInput, rotateProof, stepInput, stepProof);

        emit CommitteeRotated(sourceDomainID, stepInput.attestedSlot);
    }

    /**
        @notice Proxy for the Spectre step function that proves and stores the execution state root
        @param input The input to the sync step. Defines the slot and attestation to verify
        @param stepProof The proof for the sync step
        @param stateRoot The execution state root for the step slot
        @param stateRootProof Indexed merkle proof for the state root
    */
    function step(
        uint8 sourceDomainID,
        ISpectre.SyncStepInput calldata input,
        bytes calldata stepProof,
        bytes32 stateRoot,
        bytes[] calldata stateRootProof
    ) external {
        address spectreAddress = spectreContracts[sourceDomainID];
        require(spectreAddress != address(0), "no spectre address found");

        ISpectre spectre = ISpectre(spectreAddress);
        spectre.step(input, stepProof);

        bytes32 executionRoot = spectre.executionPayloadRoots(input.finalizedSlot);
        require(
            verifyMerkleBranch(stateRoot, executionRoot, stateRootProof, STATE_ROOT_INDEX), 
            "invalid merkle proof"
        );

        stateRoots[sourceDomainID][input.finalizedSlot] = stateRoot;
        emit StateRootSubmitted(sourceDomainID, input.finalizedSlot, stateRoot);

    }

    /**
        @notice Returns a state root.
        @param sourceDomainID ID of chain state root originated from.
        @param slot slot number of the state root.
        @return State root for the given domain ID and slot.
     */
    function getStateRoot(uint8 sourceDomainID, uint256 slot)  public view returns (bytes32) {
        return stateRoots[sourceDomainID][slot];
    }
    

    function verifyMerkleBranch(
        bytes32 leaf, 
        bytes32 root, 
        bytes[] calldata proof, 
        uint8 index
    ) internal pure returns (bool) {
        bytes32 value = leaf;

        for (uint256 i = 0; i < proof.length; i++) {
            if ((index / (2**i)) % 2 == 1) {
                value = sha256(abi.encodePacked(proof[i], value));
            } else {
                value = sha256(abi.encodePacked(value, proof[i]));
            }
        }
        
        return value == root;
    }

}
