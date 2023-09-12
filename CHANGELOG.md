# Changelog

## [2.4.0](https://github.com/sygmaprotocol/sygma-solidity/compare/v2.3.0...v2.4.0) (2023-09-12)


### Features

* percentage based fee handler ([#194](https://github.com/sygmaprotocol/sygma-solidity/issues/194)) ([26dc82a](https://github.com/sygmaprotocol/sygma-solidity/commit/26dc82a1bd129de968fa2244b7ce36542b46cb27))


### Miscellaneous

* permission generic handlers ([#195](https://github.com/sygmaprotocol/sygma-solidity/issues/195)) ([6eb7041](https://github.com/sygmaprotocol/sygma-solidity/commit/6eb704180dd8344f47f5b0d039612c673456de59))
* update devnet, testnet & mainnet migrations config files ([#190](https://github.com/sygmaprotocol/sygma-solidity/issues/190)) ([fb37549](https://github.com/sygmaprotocol/sygma-solidity/commit/fb37549132519f84c7c284d99c92579f02e1f6b7))
* update license ([#192](https://github.com/sygmaprotocol/sygma-solidity/issues/192)) ([faf8305](https://github.com/sygmaprotocol/sygma-solidity/commit/faf83050bc6888c054134481d1883a7c15f5090a))

## [2.3.0](https://github.com/sygmaprotocol/sygma-solidity/compare/v2.2.1...v2.3.0) (2023-05-11)


### Features

* implement handler response on proposal execution ([#167](https://github.com/sygmaprotocol/sygma-solidity/issues/167)) ([ae04b0c](https://github.com/sygmaprotocol/sygma-solidity/commit/ae04b0c3040588d86247a1b87666478623ba6699))
* return data from Bridge.deposit() ([#165](https://github.com/sygmaprotocol/sygma-solidity/issues/165)) ([6e99f0f](https://github.com/sygmaprotocol/sygma-solidity/commit/6e99f0fa3fc11d42ef067ff6d3c99f8624e04d04))


### Bug Fixes

* check successful transfer when minting XC20 tokens ([#186](https://github.com/sygmaprotocol/sygma-solidity/issues/186)) ([84732d0](https://github.com/sygmaprotocol/sygma-solidity/commit/84732d0587185296f34e9250ada6d95746f80f51))
* emit appropriate events on dynamic fee handler changes ([#183](https://github.com/sygmaprotocol/sygma-solidity/issues/183)) ([df632f1](https://github.com/sygmaprotocol/sygma-solidity/commit/df632f175fc153578d23d8158f5aa751bd30c571))
* implement IERC1155 support check ([#185](https://github.com/sygmaprotocol/sygma-solidity/issues/185)) ([16610b8](https://github.com/sygmaprotocol/sygma-solidity/commit/16610b8d86f4d81afee35997c4d5eaea52ff9c7b))
* prevent tokenURI variable shadowing ([#184](https://github.com/sygmaprotocol/sygma-solidity/issues/184)) ([b321f19](https://github.com/sygmaprotocol/sygma-solidity/commit/b321f19d8c17ecb0a803301db563fa29faa62af8))
* remove unnecessary visibility from constructors ([#180](https://github.com/sygmaprotocol/sygma-solidity/issues/180)) ([a771697](https://github.com/sygmaprotocol/sygma-solidity/commit/a7716976317ad9c0001fd6027e592cb00bc9f207))
* set mutability on conversion helper functions ([#182](https://github.com/sygmaprotocol/sygma-solidity/issues/182)) ([fcb1cb3](https://github.com/sygmaprotocol/sygma-solidity/commit/fcb1cb3efbbaf3acff4a0f7ab32b829b49b34ea0))
* set new handler as minter ([#160](https://github.com/sygmaprotocol/sygma-solidity/issues/160)) ([5e4a9d6](https://github.com/sygmaprotocol/sygma-solidity/commit/5e4a9d6dbbe4f303fbc0bfac5c2c38b564c65c22))
* set owner variable as immutable ([#181](https://github.com/sygmaprotocol/sygma-solidity/issues/181)) ([09b389a](https://github.com/sygmaprotocol/sygma-solidity/commit/09b389aad7fb8dad1e0ed6733f027f8798932c13))
* setting tokens as burnable when migrating handlers ([#159](https://github.com/sygmaprotocol/sygma-solidity/issues/159)) ([52e96e3](https://github.com/sygmaprotocol/sygma-solidity/commit/52e96e3bb2b309e64329dc95e70a6ea15da07a59))
* use custom errors to reduce gas consumption ([#187](https://github.com/sygmaprotocol/sygma-solidity/issues/187)) ([51a2eb8](https://github.com/sygmaprotocol/sygma-solidity/commit/51a2eb8245754fbac4fd4b203acdc196d704ab25))


### Miscellaneous

* add decimals conversion docs ([#142](https://github.com/sygmaprotocol/sygma-solidity/issues/142)) ([6cc0b27](https://github.com/sygmaprotocol/sygma-solidity/commit/6cc0b27cc02eb74c8f408e7bdc6905fc466cc2e9))
* add description of environment configuration to README file ([#150](https://github.com/sygmaprotocol/sygma-solidity/issues/150)) ([1f55ea3](https://github.com/sygmaprotocol/sygma-solidity/commit/1f55ea3544bcae9dd8e237cad31ca325d16b2c25))
* add devnet and testnet configs for migrations ([#162](https://github.com/sygmaprotocol/sygma-solidity/issues/162)) ([acb58b1](https://github.com/sygmaprotocol/sygma-solidity/commit/acb58b19e8179c7557cebaabfcec3dc5b9d1fb85))
* add fees documentation ([#143](https://github.com/sygmaprotocol/sygma-solidity/issues/143)) ([0cf18fb](https://github.com/sygmaprotocol/sygma-solidity/commit/0cf18fb4bc2018dab04004081fa04154696a8df1))
* change test2 RPC url ([#158](https://github.com/sygmaprotocol/sygma-solidity/issues/158)) ([48068ef](https://github.com/sygmaprotocol/sygma-solidity/commit/48068ef8b1757f91336b5574044721a31cbb76fc))
* enable setting tokens as not burnable ([#164](https://github.com/sygmaprotocol/sygma-solidity/issues/164)) ([bab70c0](https://github.com/sygmaprotocol/sygma-solidity/commit/bab70c0fdd1cdc9287e6605befd76e9d54e411a4))
* PermissionlessGenericHandler: unpack depositor address with custom length ([#161](https://github.com/sygmaprotocol/sygma-solidity/issues/161)) ([ead1143](https://github.com/sygmaprotocol/sygma-solidity/commit/ead11435fd32ff0876433b8e9a83c019fd757c00))

## [2.2.1](https://github.com/sygmaprotocol/sygma-solidity/compare/v2.2.0...v2.2.1) (2023-03-06)


### Bug Fixes

* remove redundant release ([#152](https://github.com/sygmaprotocol/sygma-solidity/issues/152)) ([010e82a](https://github.com/sygmaprotocol/sygma-solidity/commit/010e82a8783339a4e17007bc3c51273faa86890d))


## [2.2.0](https://github.com/sygmaprotocol/sygma-solidity/compare/v2.1.2...v2.2.0) (2023-023-02)


### Features

* feat: contract storage optimization ([#134](https://github.com/sygmaprotocol/sygma-solidity/issues/134)) ([8acbcf0](https://github.com/sygmaprotocol/sygma-solidity/commit/8acbcf051959da21180cf8b9ea708860b0f2fb8e))


### Bug Fixes

* deploy and register one token handler per network ([#148](https://github.com/sygmaprotocol/sygma-solidity/issues/148)) ([49a6b39](https://github.com/sygmaprotocol/sygma-solidity/commit/49a6b3944f8156b5b9668fc0e2e7ac3ad9c0d322))

* fix: dynamic generic fee handler fee calcualtion ([#141](https://github.com/sygmaprotocol/sygma-solidity/issues/137)) ([e75c880](https://github.com/sygmaprotocol/sygma-solidity/commit/e75c8808b98934c5256a3cf50ae7df589a6a4394))


### Miscellaneous

* improvements for ERC20 decimals values ([#139](https://github.com/sygmaprotocol/sygma-solidity/issues/139)) ([69177e2](https://github.com/sygmaprotocol/sygma-solidity/commit/69177e2cc9866bcab0e55aaa59dc7d9712505db9))

* rename finalFee to inclusionFee on substrate handler ([#145](https://github.com/sygmaprotocol/sygma-solidity/issues/145)) ([ccaabe7](https://github.com/sygmaprotocol/sygma-solidity/commit/ccaabe718fb5315e4c8b3b2adb9756fadc662c91))

## [2.1.2](https://github.com/sygmaprotocol/sygma-solidity/compare/v2.1.1...v2.1.2) (2023-02-20)


### Miscellaneous

* fix package tags ([#133](https://github.com/sygmaprotocol/sygma-solidity/issues/133)) ([edf66de](https://github.com/sygmaprotocol/sygma-solidity/commit/edf66dee597e933f084c75e1646dee2c7405a24c))

## [2.1.1](https://github.com/sygmaprotocol/sygma-solidity/compare/v2.1.0...v2.1.1) (2023-02-20)


### Bug Fixes

* remove unused return variable ([#52](https://github.com/sygmaprotocol/sygma-solidity/issues/52)) ([b8442aa](https://github.com/sygmaprotocol/sygma-solidity/commit/b8442aacd66f1a5c9dae6575b676bccf9a81f153))
* remove unused state var ([#33](https://github.com/sygmaprotocol/sygma-solidity/issues/33)) ([aaff5e9](https://github.com/sygmaprotocol/sygma-solidity/commit/aaff5e98ffbc3bb4516ea929f16ac10ef74469b0))


### Miscellaneous

* clean up README file ([#126](https://github.com/sygmaprotocol/sygma-solidity/issues/126)) ([23fcf3a](https://github.com/sygmaprotocol/sygma-solidity/commit/23fcf3a5e909d07190ce006873dc8a03a15bc126))
* fix typo `amonuts` -&gt; `amounts` ([#53](https://github.com/sygmaprotocol/sygma-solidity/issues/53)) ([12e1574](https://github.com/sygmaprotocol/sygma-solidity/commit/12e15746281e29c773254e44b893e816e379b8f2))
* remove publish workflow dependecy ([#129](https://github.com/sygmaprotocol/sygma-solidity/issues/129)) ([e85d8c9](https://github.com/sygmaprotocol/sygma-solidity/commit/e85d8c9e2fdcca9a2ad8ef7fa2e2e3f6fee00ad5))

## [2.1.0](https://github.com/sygmaprotocol/sygma-solidity/compare/v2.0.0...v2.1.0) (2023-02-20)


### Features

* add fee handler for substrate ([f90106c](https://github.com/sygmaprotocol/sygma-solidity/commit/f90106ce5f57848efc6d6059212373fcd05654b8))
* add function for generating function signatures ([385fd94](https://github.com/sygmaprotocol/sygma-solidity/commit/385fd94e4758478e418fc0ef237926ad26a8e39e))


### Bug Fixes

* minting xc20 tokens when executing proposal ([c055713](https://github.com/sygmaprotocol/sygma-solidity/commit/c0557133d773ec5ba0caa3e8b40b3389a8e75a77))


### Miscellaneous

* 'chore: depends on the first job ([9f0dc84](https://github.com/sygmaprotocol/sygma-solidity/commit/9f0dc84313697ed6abd56ed1e81d928ee08ce837))
