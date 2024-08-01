// The Licensed Work is (c) 2022 Sygma
// SPDX-License-Identifier: LGPL-3.0-only

 const Ethers = require("ethers");
 const ethSigUtil = require("eth-sig-util");
 const Utils = require("../scripts/generateFuncSignatures");

const AccessControlSegregatorContract = artifacts.require(
  "AccessControlSegregator"
);
const BridgeContract = artifacts.require("Bridge");

const blankFunctionSig = "0x00000000";
const blankFunctionDepositorOffset = "0x0000";
const AbiCoder = new Ethers.utils.AbiCoder();
const mpcAddress = "0x1Ad4b1efE3Bc6FEE085e995FCF48219430e615C3";
const mpcPrivateKey =
  "0x497b6ae580cb1b0238f8b6b543fada697bc6f8768a983281e5e52a1a5bca4d58";
const toHex = (covertThis, padding) => {
  return Ethers.utils.hexZeroPad(Ethers.utils.hexlify(covertThis), padding);
};

const abiEncode = (valueTypes, values) => {
  return AbiCoder.encode(valueTypes, values);
};

const getFunctionSignature = (contractInstance, functionName) => {
  return contractInstance.abi.filter(
    (abiProperty) => abiProperty.name === functionName
  )[0].signature;
};

const createCallData = (contractInstance, functionName, valueTypes, values) => {
  const signature = getFunctionSignature(contractInstance, functionName);
  const encodedABI = abiEncode(valueTypes, values);
  return signature + encodedABI.substr(2);
};

const createERCDepositData = (
  tokenAmountOrID,
  lenRecipientAddress,
  recipientAddress
) => {
  return (
    "0x" +
    toHex(tokenAmountOrID, 32).substr(2) + // Token amount or ID to deposit (32 bytes)
    toHex(lenRecipientAddress, 32).substr(2) + // len(recipientAddress)          (32 bytes)
    recipientAddress.substr(2)
  ); // recipientAddress               (?? bytes)
};

const createERCWithdrawData = (
  tokenAddress,
  recipientAddress,
  tokenAmountOrID
) => {
  return (
    "0x" +
    toHex(tokenAddress, 32).substr(2) +
    toHex(recipientAddress, 32).substr(2) +
    toHex(tokenAmountOrID, 32).substr(2)
  );
};

const createERC1155DepositData = (tokenIDs, amounts) => {
  return abiEncode(["uint[]", "uint[]"], [tokenIDs, amounts]);
};

const createERC1155DepositProposalData = (
  tokenIDs,
  amounts,
  recipient,
  transferData
) => {
  return abiEncode(
    ["uint[]", "uint[]", "bytes", "bytes"],
    [tokenIDs, amounts, recipient, transferData]
  );
};

const createERC1155WithdrawData = (
  tokenAddress,
  recipient,
  tokenIDs,
  amounts,
  transferData
) => {
  return abiEncode(
    ["address", "address", "uint[]", "uint[]", "bytes"],
    [tokenAddress, recipient, tokenIDs, amounts, transferData]
  );
};

const createERC721DepositProposalData = (
  tokenAmountOrID,
  lenRecipientAddress,
  recipientAddress,
  lenMetaData,
  metaData
) => {
  return (
    "0x" +
    toHex(tokenAmountOrID, 32).substr(2) + // Token amount or ID to deposit (32 bytes)
    toHex(lenRecipientAddress, 32).substr(2) + // len(recipientAddress)         (32 bytes)
    recipientAddress.substr(2) + // recipientAddress              (?? bytes)
    toHex(lenMetaData, 32).substr(2) + // len(metaData)                 (32 bytes)
    toHex(metaData, lenMetaData).substr(2)
  ); // metaData                      (?? bytes)
};

const advanceBlock = () => {
  const provider = new Ethers.providers.JsonRpcProvider();
  const time = Math.floor(Date.now() / 1000);
  return provider.send("evm_mine", [time]);
};

const advanceTime = (seconds) => {
  const provider = new Ethers.providers.JsonRpcProvider();
  const time = Math.floor(Date.now() / 1000) + seconds;
  return provider.send("evm_mine", [time]);
};

const createGmpDepositData = (
  executeFunctionSignature,
  executeContractAddress,
  maxFee,
  depositor,
  executionData,
  depositorCheck = true
) => {
  if (depositorCheck) {
    // if "depositorCheck" is true -> append depositor address for destination chain check
    executionData = executionData.concat(toHex(depositor, 32).substr(2));
  }

  return (
    "0x" +
    toHex(maxFee, 32).substr(2) + // uint256
    toHex(executeFunctionSignature.substr(2).length / 2, 2).substr(2) + // uint16
    executeFunctionSignature.substr(2) + // bytes
    toHex(executeContractAddress.substr(2).length / 2, 1).substr(2) + // uint8
    executeContractAddress.substr(2) + // bytes
    toHex(depositor.substr(2).length / 2, 1).substr(2) + // uint8
    depositor.substr(2) + // bytes
    executionData.substr(2)
  ) // bytes
    .toLowerCase();
};

const constructGenericHandlerSetResourceData = (...args) => {
  return args.reduce((accumulator, currentArg) => {
    if (typeof currentArg === "number") {
      currentArg = toHex(currentArg, 2);
    }
    return accumulator + currentArg.substr(2);
  });
};

const createResourceID = (contractAddress, domainID) => {
  return toHex(contractAddress + toHex(domainID, 1).substr(2), 32);
};

const assertObjectsMatch = (expectedObj, actualObj) => {
  for (const expectedProperty of Object.keys(expectedObj)) {
    assert.property(
      actualObj,
      expectedProperty,
      `actualObj does not have property: ${expectedProperty}`
    );

    let expectedValue = expectedObj[expectedProperty];
    let actualValue = actualObj[expectedProperty];

    // If expectedValue is not null, we can expected actualValue to not be null as well
    if (expectedValue !== null) {
      // Handling mixed case ETH addresses
      // If expectedValue is a string, we can expected actualValue to be a string as well
      if (expectedValue.toLowerCase !== undefined) {
        expectedValue = expectedValue.toLowerCase();
        actualValue = actualValue.toLowerCase();
      }

      // Handling BigNumber.js instances
      if (actualValue.toNumber !== undefined) {
        actualValue = actualValue.toNumber();
      }

      // Truffle seems to return uint/ints as strings
      // Also handles when Truffle returns hex number when expecting uint/int
      if (
        (typeof expectedValue === "number" &&
          typeof actualValue === "string") ||
        (Ethers.utils.isHexString(actualValue) &&
          typeof expectedValue === "number")
      ) {
        actualValue = parseInt(actualValue);
      }
    }

    assert.deepEqual(
      expectedValue,
      actualValue,
      `expectedValue: ${expectedValue} does not match actualValue: ${actualValue}`
    );
  }
};
//uint72 nonceAndID = (uint72(depositNonce) << 8) | uint72(domainID);
const nonceAndId = (nonce, id) => {
  return (
    Ethers.utils.hexZeroPad(Ethers.utils.hexlify(nonce), 8) +
    Ethers.utils.hexZeroPad(Ethers.utils.hexlify(id), 1).substr(2)
  );
};

const createOracleFeeData = (oracleResponse, privateKey, amount) => {
  /*
        feeData structure:
            ber*10^18:    uint256
            ter*10^18:    uint256
            dstGasPrice:  uint256
            timestamp:    uint256
            fromDomainID: uint8 encoded as uint256
            toDomainID:   uint8 encoded as uint256
            resourceID:   bytes32
            msgGasLimit:  uint256
            sig:          bytes(65 bytes)

        total in bytes:
        message:
            32 * 8  = 256
        message + sig:
            256 + 65 = 321

            amount: uint256
        total feeData length: 353
    */

  const oracleMessage = Ethers.utils.solidityPack(
    [
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "uint256",
      "bytes32",
      "uint256",
    ],
    [
      oracleResponse.ber,
      oracleResponse.ter,
      oracleResponse.dstGasPrice,
      oracleResponse.expiresAt,
      oracleResponse.fromDomainID,
      oracleResponse.toDomainID,
      oracleResponse.resourceID,
      oracleResponse.msgGasLimit,
    ]
  );
  const messageHash = Ethers.utils.keccak256(oracleMessage);
  const signingKey = new Ethers.utils.SigningKey(privateKey);
  const messageHashBytes = Ethers.utils.arrayify(messageHash);
  const signature = signingKey.signDigest(messageHashBytes);
  const rawSignature = Ethers.utils.joinSignature(signature);
  return oracleMessage + rawSignature.substr(2) + toHex(amount, 32).substr(2);
};

const decimalToPaddedBinary = (decimal) => {
  return decimal.toString(2).padStart(64, "0");
};

// filter out only func signatures
const accessControlFuncSignatures = Utils.generateAccessControlFuncSignatures().map(e => e.hash);

const deployBridge = async (domainID, admin) => {
  const accessControlInstance = await AccessControlSegregatorContract.new(
    accessControlFuncSignatures,
    Array(13).fill(admin)
  );
  return await BridgeContract.new(domainID, accessControlInstance.address);
};

const signTypedProposal = (bridgeAddress, proposals, chainId = 1) => {
  const name = "Bridge";
  const version = "3.1.0";

  const EIP712Domain = [
    {name: "name", type: "string"},
    {name: "version", type: "string"},
    {name: "chainId", type: "uint256"},
    {name: "verifyingContract", type: "address"},
  ];

  const types = {
    EIP712Domain: EIP712Domain,
    Proposal: [
      {name: "originDomainID", type: "uint8"},
      {name: "depositNonce", type: "uint64"},
      {name: "resourceID", type: "bytes32"},
      {name: "data", type: "bytes"},
    ],
    Proposals: [{name: "proposals", type: "Proposal[]"}],
  };

  return ethSigUtil.signTypedMessage(Ethers.utils.arrayify(mpcPrivateKey), {
    data: {
      types: types,
      domain: {
        name,
        version,
        chainId,
        verifyingContract: bridgeAddress,
      },
      primaryType: "Proposals",
      message: {
        proposals: proposals,
      },
    },
  });
};

const mockSignTypedProposalWithInvalidChainID = (bridgeAddress, proposals) => {
  return signTypedProposal(bridgeAddress, proposals, 3);
};

const createDepositProposalDataFromHandlerResponse = (
  depositTx,
  lenRecipientAddress,
  recipientAddress
) => {
  const amountFromHandlerResponse = Ethers.BigNumber.from(depositTx.logs[0].args.handlerResponse);
  return createERCDepositData(amountFromHandlerResponse, lenRecipientAddress, recipientAddress);
};


// This helper can be used to prepare execution data for GmpHandler
// The execution data will be packed together with depositorAddress before execution.
// If the target function parameters include reference types then the offsets should be kept consistent.
// This function packs the parameters together with a fake address and removes the address.
// After repacking the data in the handler together with depositorAddress, the offsets will be correct.
// Usage: use this function to prepare execution data,
// then pack the result together with executeFunctionSignature, maxFee etc
// (using the createGmpDepositData() helper)
// and then pass the data to Bridge.deposit().
const createGmpExecutionData = (
  types,
  values
) => {
  types.unshift("address");
  values.unshift(Ethers.constants.AddressZero);
  return "0x" + abiEncode(types, values).substr(66);
};

// truffle doesn't support decoding custom errors, this is adapted from
// https://github.com/trufflesuite/truffle/issues/4123
const expectToRevertWithCustomError = async function(promise, expectedErrorSignature) {
  try {
    await promise;
  } catch (error) {
    const encoded = web3.eth.abi.encodeFunctionSignature(expectedErrorSignature);
    const returnValue = error.data.result || error.data;
    // expect event error and provided error signatures to match
    assert.equal(returnValue.slice(0, 10), encoded);

    let inputParams;
    // match everything between () in function signature
    const regex = RegExp(/\(([^)]+)\)/);
    if(regex.exec(expectedErrorSignature)) {
      const types = regex.exec(expectedErrorSignature)[1].split(",");
      inputParams = Ethers.utils.defaultAbiCoder.decode(
        types,
        Ethers.utils.hexDataSlice(returnValue, 4)
      );
    }
    return inputParams;
  }
  assert.fail("Expected a custom error but none was received");
}

const reverts = async function(promise, expectedErrorMessage) {
  try {
    await promise;
  } catch (error) {
    if (expectedErrorMessage) {
      const message = error.reason || error.hijackedStack.split('revert ')[1].split('\n')[0];
      assert.equal(message, expectedErrorMessage);
    }
    return true;
  }
  assert.fail("Expected an error message but none was received");
}

const passes = async function(promise) {
  try {
    await promise;
  } catch (error) {
    assert.fail("Revert reason: " + error.data.result);
  }
}

module.exports = {
  advanceBlock,
  advanceTime,
  blankFunctionSig,
  blankFunctionDepositorOffset,
  mpcAddress,
  mpcPrivateKey,
  accessControlFuncSignatures,
  toHex,
  abiEncode,
  getFunctionSignature,
  createCallData,
  createERCDepositData,
  createERCWithdrawData,
  createERC1155DepositData,
  createERC1155DepositProposalData,
  createERC1155WithdrawData,
  createGmpDepositData,
  constructGenericHandlerSetResourceData,
  createERC721DepositProposalData,
  createResourceID,
  assertObjectsMatch,
  nonceAndId,
  createOracleFeeData,
  decimalToPaddedBinary,
  deployBridge,
  signTypedProposal,
  mockSignTypedProposalWithInvalidChainID,
  createDepositProposalDataFromHandlerResponse,
  createGmpExecutionData,
  expectToRevertWithCustomError,
  reverts,
  passes,
};
