# Decimals value cross chain conversion
## Abstract
There is a possible situation where a token is bridged between multiple chains where each chain has different decimals value and isn't aware of the different value on the opposite chain. This could lead to either an excess or shortfall of tokens bridged from the source to the destination chain, depending on the discrepancy in decimal values between them. Because of that we need to account for decimals value difference and keep track of decimals value conversion.

## Solution
To tackle this situation we introduced `Decimals` struct which is mapped to `tokenContractAddress` and keeps track of external decimals value since `Sygma` bridge internally operates with 18 decimals. External decimals value is set by admin account when registering the token on the `Sygma` bridge. Bridging request for tokens with 18 decimals are processed without any conversion since they don't require any extra configurations on the bridge.

**Important notices:**
- If a token with decimals value != 18 isn't setup by the admin with the appropriate decimals it will be interpreted as it has 18 decimals, because of that it is important that the admin configures all decimal values properly when registering a new token on `Sygma` bridge.
- Fees are not dependant on token decimals value and are deducted in a regular basis. More details about fees can be found [here](/docs/fees.md)
The workflow when bridging tokens is described in the chart bellow:
![](/docs/resource/decimals_conversion.png)
