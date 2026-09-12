#!/usr/bin/env bash
# @executable — read-only; run by `pnpm gate:docs`
# Who may write which record on a listing? Simulate setText as two identities and see what the
# resolver says. Nothing is sent.
set -euo pipefail
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
RESOLVER=0xeb22a41C9b5f979385A045faaE72E730BF9d0B0C
REGISTRY=0x45BF1E3da54d9747Eb12D260fC76C3F5dc35d78e
LABEL="${1:-uniswap-pools}"
NODE=$(cast namehash "$LABEL.tollgatehq.eth")
# ownerOf needs the token id — the labelhash with its low 32 bits cleared. A raw labelhash returns
# the zero address even for a live, owned name.
ID=$(python3 -c "print(int('$(cast keccak "$LABEL")',16) & ~0xffffffff)")
OWNER=$(cast call $REGISTRY "ownerOf(uint256)(address)" "$ID" --rpc-url "$RPC")
ROOT=$(cast call $RESOLVER "hasRoles(uint256,uint256,address)(bool)" 0 16 "$OWNER" --rpc-url "$RPC")
STRANGER=0x000000000000000000000000000000000000dEaD
echo "$LABEL.tollgatehq.eth is owned by $OWNER (top-level ROLE_SET_TEXT on the resolver: $ROOT)"
for WHO in "$OWNER" "$STRANGER"; do
  for KEY in x402:price agent-endpoint[web] x402:settlement x402:unit; do
    if cast call $RESOLVER "setText(bytes32,string,string)" "$NODE" "$KEY" probe --from "$WHO" --rpc-url "$RPC" >/dev/null 2>&1; then
      R="may write"; else R="refused"; fi
    printf "  %-44s %-22s %s\n" "$WHO" "$KEY" "$R"
  done
done
