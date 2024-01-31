import { assert, expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { ISpectre, SpectreProxy } from "../../../typechain-types";

describe("Spectre Proxy", () => {
  const originDomainID = 1;

  const invalidOriginDomainID = 4;
  const validDomainID = 3;

  const rotateProof =
    "0xcc69885fda6bcc1a4ace058b4a62bf5e179ea78fd58a1ccd71c22cc9b688792f";
  const stepProof =
    "0xcc69885fda6bcc1a4ace058b4a62bf5e179ea78fd58a1ccd71c22cc9b688792f";

  const validStateRoot =
    "0x8c0c3244e0ca8c0e5416a3407787c71b29225723e0f887396ce018f8f38f20d5";
  const validStateRootProof = [
    "0x0c2e45ec77206f3b0cac1da903c4bc05cf177da367c428c1ba3cab0f654f4f78",
    "0xdf581c183b1083cf6be31fde9f6073dfacfc252f8b514577f2ca03955b921552",
    "0x59dac95a8278295a3a05d809156f69b45007af3f3df94bcabe4bbbdd9cce5c5a",
    "0x4dc9cd52dff9694aed19a73da85386b77d641c81bcb7015dbf7daeec5614f010",
  ];
  const invalidStateRoot =
    "0xcc69885fda6bcc1a4ace058b4a62bf5e179ea78fd58a1ccd71c22cc9b688792f";
  const invalidStateRootProof = [
    "0x0c2e45ec77206f3b0cac1da903c4bc05cf177da367c428c1ba3cab0f654f4f78",
    "0xdf581c183b1083cf6be31fde9f6073dfacfc252f8b514577f2ca03955b921552",
    "0x59dac95a8278295a3a05d809156f69b45007af3f3df94bcabe4bbbdd9cce5c5a",
  ];

  const rotateInput: ISpectre.RotateInputStruct = {
    syncCommitteePoseidon: "256",
    syncCommitteeSSZ:
      "0xcc69885fda6bcc1a4ace058b4a62bf5e179ea78fd58a1ccd71c22cc9b688792f",
    accumulator: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  };
  const stepInput: ISpectre.SyncStepInputStruct = {
    finalizedHeaderRoot:
      "0xcc69885fda6bcc1a4ace058b4a62bf5e179ea78fd58a1ccd71c22cc9b688792f",
    finalizedSlot: 100,
    attestedSlot: 101,
    participation: 8,
    executionPayloadRoot:
      "0x9109d68183cb2c2b4d8d769a4263195c153ece0d2bc797f44b8f6cec4814439c",
    accumulator: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  };

  const constructorDomains = [2, 3];
  const invalidSpectreAddress = "0x9Da9DbbB87db6e9862C79651CBae0D468fa88c71";
  const constructorAddresses = [invalidSpectreAddress];

  let spectreAddress: string;

  let spectreProxyInstance: SpectreProxy;
  let nonAdminAccount: HardhatEthersSigner;

  beforeEach(async () => {
    [, nonAdminAccount] = await ethers.getSigners();
    const SpectreProxyContract =
      await ethers.getContractFactory("SpectreProxy");
    const SpectreContract = await ethers.getContractFactory("TestSpectre");
    const spectreInstance = await SpectreContract.deploy();
    spectreAddress = await spectreInstance.getAddress();
    constructorAddresses[1] = spectreAddress;
    spectreProxyInstance = await SpectreProxyContract.deploy(
      constructorDomains,
      constructorAddresses,
    );
  });

  it("constructor should set intial addresses", async () => {
    assert.equal(
      await spectreProxyInstance.spectreContracts(constructorDomains[0]),
      constructorAddresses[0],
    );
    assert.equal(
      await spectreProxyInstance.spectreContracts(constructorDomains[1]),
      spectreAddress,
    );
  });

  it("should require admin role to set spectre address", async () => {
    await expect(
      spectreProxyInstance
        .connect(nonAdminAccount)
        .adminSetSpectreAddress(originDomainID, spectreAddress),
    ).to.be.revertedWith("sender doesn't have admin role");
  });

  it("should set spectre address with an admin role", async () => {
    await spectreProxyInstance.adminSetSpectreAddress(
      originDomainID,
      spectreAddress,
    );

    assert.equal(
      await spectreProxyInstance.spectreContracts(originDomainID),
      spectreAddress,
    );
  });

  it("should revert if spectre address not set in rotate", async () => {
    await expect(
      spectreProxyInstance.rotate(
        invalidOriginDomainID,
        rotateInput,
        rotateProof,
        stepInput,
        stepProof,
      ),
    ).to.be.revertedWith("no spectre address found");
  });

  it("should emit event even if rotate successful", async () => {
    const rotateTx = await spectreProxyInstance.rotate(
      validDomainID,
      rotateInput,
      rotateProof,
      stepInput,
      stepProof,
    );

    await expect(rotateTx)
      .to.emit(spectreProxyInstance, "CommitteeRotated")
      .withArgs(validDomainID, stepInput.attestedSlot);
  });

  it("should revert if spectre address not set in step", async () => {
    await expect(
      spectreProxyInstance.step(
        invalidOriginDomainID,
        stepInput,
        stepProof,
        validStateRoot,
        validStateRootProof,
      ),
    ).to.be.revertedWith("no spectre address found");
  });

  it("should revert if step proof not valid", async () => {
    await expect(
      spectreProxyInstance.step(
        validDomainID,
        stepInput,
        stepProof,
        validStateRoot,
        invalidStateRootProof,
      ),
    ).to.be.revertedWith("invalid merkle proof");
  });

  it("should revert if step state root not valid", async () => {
    await expect(
      spectreProxyInstance.step(
        validDomainID,
        stepInput,
        stepProof,
        invalidStateRoot,
        validStateRootProof,
      ),
    ).to.be.revertedWith("invalid merkle proof");
  });

  it("should emit event and store state root if step valid", async () => {
    const stepTx = await spectreProxyInstance.step(
      validDomainID,
      stepInput,
      stepProof,
      validStateRoot,
      validStateRootProof,
    );

    assert.equal(
      await spectreProxyInstance.stateRoots(
        validDomainID,
        stepInput.finalizedSlot,
      ),
      validStateRoot,
    );
    assert.equal(
      await spectreProxyInstance.getStateRoot(
        validDomainID,
        stepInput.finalizedSlot,
      ),
      validStateRoot,
    );
    await expect(stepTx)
      .to.emit(spectreProxyInstance, "StateRootSubmitted")
      .withArgs(validDomainID, stepInput.finalizedSlot, validStateRoot);
  });
});
