// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.11;

/**
    @title Represents a bridged Centrifuge asset.
    @author ChainSafe Systems.
 */
contract CentrifugeAsset {
  mapping (bytes32 => bool) public _assetsStored;

  event AssetStored(bytes32 indexed asset);

  /**
    @notice Marks {asset} as stored.
    @param asset Hash of asset deposited on Centrifuge chain.
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
    @param asset Hash of asset deposited on Centrifuge chain.
    @param depositorCheck Depositor address (padded to 32 bytes) to check
      on destination chain if depositor passed through metadata is valid.
    @notice {asset} must not have already been stored.
    @notice Emits {AssetStored} event.
   */
  function storeWithDepositor(bytes32 depositor, bytes32 asset, bytes32 depositorCheck) external {
      address depositorAddress;
      address depositorCheckAddress;

      require(!_assetsStored[asset], "asset is already stored");

      depositorAddress   = address(uint160(uint256(depositor)));
      depositorCheckAddress   = address(uint160(uint256(depositorCheck)));
      require(depositorAddress == depositorCheckAddress, "invalid depositor address");

      _assetsStored[asset] = true;
      emit AssetStored(asset);
  }
}
