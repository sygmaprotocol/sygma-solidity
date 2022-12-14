// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Wrapper.sol";
import "./handlers/ERCHandlerHelpers.sol";
import "./interfaces/IERC20Plus.sol";

contract NoArgument {
    event NoArgumentCalled();

    function noArgument() external {
        emit NoArgumentCalled();
    }
}

contract OneArgument {
    event OneArgumentCalled(uint256 indexed argumentOne);

    function oneArgument(uint256 argumentOne) external {
        emit OneArgumentCalled(argumentOne);
    }
}

contract TwoArguments {
    event TwoArgumentsCalled(address[] argumentOne, bytes4 argumentTwo);

    function twoArguments(address[] calldata argumentOne, bytes4 argumentTwo) external {
        emit TwoArgumentsCalled(argumentOne, argumentTwo);
    }
}

contract ThreeArguments {
    event ThreeArgumentsCalled(string argumentOne, int8 argumentTwo, bool argumentThree);

    function threeArguments(string calldata argumentOne, int8 argumentTwo, bool argumentThree) external {
        emit ThreeArgumentsCalled(argumentOne, argumentTwo, argumentThree);
    }
}

contract WithDepositor {
    event WithDepositorCalled(address argumentOne, uint256 argumentTwo);

    function withDepositor(address argumentOne, uint256 argumentTwo) external {
        emit WithDepositorCalled(argumentOne, argumentTwo);
    }
}


contract ReturnData {
    function returnData(string memory argument) external pure returns(bytes32 response) {
        assembly {
            response := mload(add(argument, 32))
        }
    }
}

contract HandlerRevert is ERCHandlerHelpers {
    uint private _totalAmount;

    constructor(
        address          bridgeAddress
    ) public ERCHandlerHelpers(bridgeAddress) {
    }

    function executeProposal(bytes32, bytes calldata) external view {
        if (_totalAmount == 0) {
            revert("Something bad happened");
        }
        return;
    }

    function virtualIncreaseBalance(uint amount) external {
        _totalAmount = amount;
    }

    function setResource(bytes32 resourceID, address contractAddress, bytes calldata args) external {
        _setResource(resourceID, contractAddress);
    }
}

contract TestForwarder {
    function execute(bytes memory data, address to, address sender) external {
        bytes memory callData = abi.encodePacked(data, sender);
        (bool success, ) = to.call(callData);
        require(success, "Relay call failed");
    }
}

contract TestTarget {
    uint public calls = 0;
    uint public gasLeft;
    bytes public data;
    bool public burnAllGas;
    fallback() external payable {
        gasLeft = gasleft();
        calls++;
        data = msg.data;
        if (burnAllGas) {
            assert(false);
        }
    }

    function setBurnAllGas() public {
        burnAllGas = true;
    }
}

contract TestStore {
  mapping (bytes32 => bool) public _assetsStored;

  event AssetStored(bytes32 indexed asset);

  /**
    @notice Marks {asset} as stored.
    @param asset Hash of asset deposited.
    @notice {asset} must not have already been stored.
    @notice Emits {AssetStored} event.
   */
  function store(bytes32 asset) external {
      require(!_assetsStored[asset], "asset is already stored");

      _assetsStored[asset] = true;
      emit AssetStored(asset);
  }

  /**
    @notice Marks {asset} as stored.
    @param depositor Depositor address padded to 32 bytes.
    @param asset Hash of asset deposited.
    @param depositorCheck Depositor address (padded to 32 bytes) to check
      on destination chain if depositor passed through metadata is valid.
    @notice {asset} must not have already been stored.
    @notice Emits {AssetStored} event.
   */
  function storeWithDepositor(address depositor, bytes32 asset, address depositorCheck) external {
      require(!_assetsStored[asset], "asset is already stored");

      require(depositor == depositorCheck, "invalid depositor address");

      _assetsStored[asset] = true;
      emit AssetStored(asset);
  }
}
/**
  @dev This contract mocks XC20 assets based on this example:
      https://github.com/AstarNetwork/astar-frame/blob/674356e7b611e561aaf9bf581452cab965cf8e87/examples/assets-erc20/XcBurrito.sol#L12
*/
contract XC20Test is ERC20 {

    constructor() ERC20("XC20Test", "XC20TST") {}

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public {
        _burn(from, amount);
    }
}
