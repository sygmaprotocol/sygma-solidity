// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity 0.8.11;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";
import "../../contracts/interfaces/IBridge.sol";
import "../../contracts/interfaces/IFeeHandler.sol";
import "../XERC20/interfaces/IXERC20.sol";
import "./interfaces/IGmpTransferAdapter.sol";

/**
        .__   __.   ______   .___________. __    ______  _______
        |  \ |  |  /  __  \  |           ||  |  /      ||   ____|
        |   \|  | |  |  |  | `---|  |----`|  | |  ,----'|  |__
        |  . `  | |  |  |  |     |  |     |  | |  |     |   __|
        |  |\   | |  `--'  |     |  |     |  | |  `----.|  |____
        |__| \__|  \______/      |__|     |__|  \______||_______|

    Be careful when interacting with this contact as it enables
    permissionless token addition and transfers via Sygma brige.
    Always double check contract addresses and code you are interacting with
    since a malicious actor could deploy a fake contract on a route
    that is isn't set up by the Sygma team or a trusted 3rd party.
    This can result in loss of all your funds.
*/
contract GmpTransferAdapter is IGmpTransferAdapter, AccessControl {
    using ERC165Checker for address;

    IBridge public immutable _bridge;
    bytes32 public immutable _resourceID;
    address immutable _gmpAddress;
    // source token address => destination domainID => destination token address
    mapping(address => mapping(uint256 => address)) public crossChainTokenPairs;

    event Withdrawal(address recipient, uint amount);

    error InsufficientMsgValueAmount(uint256 amount);
    error InvalidHandler(address handler);
    error InvalidOriginAdapter(address adapter);
    error FailedRefund();
    error CallerNotAdmin();
    error FailedFundsTransfer();

    /**
        @notice This contract requires for transfer that the origin adapter address is the same across all networks.
        Because of that it should be deployed using multichain deployer or create2.
     */
    constructor(IBridge bridge, address newGmpAddress, bytes32 resourceID) {
        _bridge = bridge;
        _gmpAddress = newGmpAddress;
        _resourceID = resourceID;
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    modifier onlyAdmin() {
        if (!hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert CallerNotAdmin();
        _;
    }

    function deposit(uint8 destinationDomainID, address recipientAddress, address XERC20Address, uint256 tokenAmount) external payable {
        address feeHandlerRouter = _bridge._feeHandler();
        (uint256 fee, ) = IFeeHandler(feeHandlerRouter).calculateFee(
            address(this),
            _bridge._domainID(),
            destinationDomainID,
            _resourceID,
            "", // depositData - not parsed
            ""  // feeData - not parsed
        );

        if (msg.value < fee) {
            revert InsufficientMsgValueAmount(msg.value);
        // refund excess msg.value
        } else if (msg.value > fee) {
            (bool success, ) = msg.sender.call{value: msg.value - fee}("");
            if (!success) revert FailedRefund();
        }

        address destinationToken;
        address assignedDestinationToken = crossChainTokenPairs[XERC20Address][destinationDomainID];
        if (assignedDestinationToken != address(0)) {
            destinationToken = assignedDestinationToken;
        } else {
            destinationToken = XERC20Address;
        }

        bytes memory depositData = abi.encodePacked(
            // uint256 maxFee
            uint256(950000),
            // uint16 len(executeFuncSignature)
            uint16(4),
            // bytes executeFuncSignature
            IGmpTransferAdapter(address(this)).executeProposal.selector,
            // uint8 len(executeContractAddress)
            uint8(20),
            // bytes executeContractAddress
            address(this),
            // uint8 len(executionDataDepositor)
            uint8(20),
            // bytes executionDataDepositor
            address(this),
            // bytes executionDataDepositor + executionData
            prepareDepositData(recipientAddress, destinationToken, tokenAmount)
        );

        IXERC20(XERC20Address).burn(msg.sender, tokenAmount);

        _bridge.deposit{value: fee}(destinationDomainID, _resourceID, depositData, "");
    }

    function executeProposal(address gmpAdapter, address recipient, address XERC20Address, uint256 amount) external {
        if (gmpAdapter != address(this)) revert InvalidOriginAdapter(gmpAdapter);
        if (msg.sender != _gmpAddress) revert InvalidHandler(msg.sender);

        IXERC20(XERC20Address).mint(recipient, amount);
    }

    /**
        @notice Used to manually transfer native tokens from Adapter.
        @param recipient Address that should recieve the native tokens.
        recipient   address
     */
    function withdraw(address recipient, uint256 amount) external onlyAdmin {
        (bool success, ) = address(recipient).call{value: amount}("");
        if(!success) revert FailedFundsTransfer();
        emit Withdrawal(recipient, amount);
    }

    function setTokenPairAddress(address sourceTokenAddress, uint8 destinationDomainID, address destinationTokenAddress) external onlyAdmin {
        crossChainTokenPairs[sourceTokenAddress][destinationDomainID] = destinationTokenAddress;
    }

    function slice(bytes calldata input, uint256 position) public pure returns (bytes memory) {
        return input[position:];
    }

    function prepareDepositData(
        address recipientAddress,
        address XERC20Address,
        uint256 bridgingAmount
    ) public view returns (bytes memory) {
        return abi.encode(recipientAddress, XERC20Address, bridgingAmount);
    }

    receive() external payable {}
}
