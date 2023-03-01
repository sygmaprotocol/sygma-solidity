# Decimals value cross chain conversion
## Abstract
There is a possible situation where a token is bridged between multiple chains where each chain has different decimals value and isn't aware of the different value on the opposite chain. This would result in more or less tokens being bridged from source to destination chain depending on the decimals value difference between them. Because of that we need to account for decimals value difference and keep track of decimals value conversion.

## Solution
Introduce `Decimals` struct which is mapped to `tokenContractAddress` and keeps track of external decimals value since `Sygma` bridge internally operates with 18 decimals. External decimals value is set by admin account when registering the token on the `Sygma` bridge. Bridging requrest for tokens with 18 decimals are processed without any conversion since they don't require any extra configurations on the bridge. The workflow when bridging tokens is described in the chart bellow:
![](/docs/resource/decimals_conversion.png)
