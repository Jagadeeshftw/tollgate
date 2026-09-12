#!/usr/bin/env bash
# @executable — read-only; run by `pnpm gate:docs`
# Resolve a listing's price through the public ENS UniversalResolver, with nothing from this repo.
set -euo pipefail
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
NAME="${1:-uniswap-pools.tollgatehq.eth}"
# DNS wire format: each label prefixed by its length byte, terminated by a zero byte.
DNS=$(python3 -c "import sys; n=sys.argv[1]; print('0x' + b''.join(bytes([len(l)]) + l.encode() for l in n.split('.')).hex() + '00')" "$NAME")
CALL=$(cast calldata "text(bytes32,string)" "$(cast namehash "$NAME")" "x402:price")
# resolve() returns (bytes result, address resolver); `result` is the ABI-encoded return of text().
RESULT=$(cast call 0x4A1817d13E9cF196f471725176355C1234b63C70 "resolve(bytes,bytes)(bytes,address)" "$DNS" "$CALL" --rpc-url "$RPC" | head -1)
PRICE=$(cast --abi-decode "text()(string)" "$RESULT")
[ -n "$PRICE" ] || { echo "empty price — resolution failed" >&2; exit 1; }
echo "$NAME x402:price = $PRICE"
