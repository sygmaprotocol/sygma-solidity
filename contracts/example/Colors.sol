// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.11;

contract Colors {
    bytes32[] public colorsArray;

    uint256 public colorCounter = 0;

    event setColorEvent(bytes32 color);
    event metadataDepositorEvent(address depositorAddress);

    function setColorOnDeploy(bytes32 color) public {
      colorsArray.push(color);
    }

    function setColor(bytes32 metadataDepositor, bytes32 color) public {
        colorsArray.push(color);
        colorCounter++;

        address depositorAddress = address(uint160(uint256(metadataDepositor)));

        emit setColorEvent(color);
        emit metadataDepositorEvent(depositorAddress);
    }

    function popColor() public {
      colorsArray.pop();
    }

    function getColorsArrayLenght() public view returns (uint256 l) {
      return colorsArray.length;
    }

    function getCurrentColors(uint256 index)
        public
        view
        returns (bytes32 colorReturned)
    {
        colorReturned = colorsArray[index];
        return colorReturned;
    }

    function insertColorToColorsArray(bytes32 newColor) public {
        colorsArray.push(newColor);
        emit setColorEvent(newColor);
    }

    function findColor(bytes32 color)
        public
        view
        returns (bytes32 colorFound)
    {
        for (uint i = 0; i < colorsArray.length; i++) {
            bytes32 c = colorsArray[i];

            if (
                keccak256(abi.encodePacked((color))) ==
                keccak256(abi.encodePacked((c)))
            ) {
                colorFound = c;
                break;
            }
        }
        return colorFound;
    }
}
