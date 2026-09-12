#!/usr/bin/env bash
# @illustrative — sends a real Sepolia transaction from your wallet; not run by any gate
# List a service through the open registrar. You must be the operator: operator == your address.
set -euo pipefail
OPEN_REGISTRAR="${OPEN_REGISTRAR:?address from deployments/ens-sepolia.json}"
ME=$(cast wallet address --private-key "$PRIVATE_KEY")
EXPIRY=$(( $(date +%s) + 30 * 86400 ))
cast send "$OPEN_REGISTRAR" \
  'list(string,address,(string,string,string,string,string,string,string,string),uint64)' \
  my-service "$ME" \
  '("What it sells, for an agent to read","https://my.example/x402","0.001","request","0.0.12345","hedera:testnet","0.0.0","{}")' \
  "$EXPIRY" --private-key "$PRIVATE_KEY" --rpc-url "${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
