import { findDefaultAsset, HBAR_ASSET_ID } from "@x402/hedera";
import type { Network } from "@x402/core/types";

/** Native HBAR is denominated in tinybars: 1 HBAR = 10^8 tinybar. */
const HBAR_DECIMALS = 8;

export class UnsupportedAssetError extends Error {
  constructor(readonly asset: string, readonly network: string) {
    super(
      `listing prices in asset "${asset}" on ${network}, whose decimals are unknown. ` +
        `Use HBAR ("${HBAR_ASSET_ID}") or a known default asset.`,
    );
    this.name = "UnsupportedAssetError";
  }
}

/**
 * Decimal places for an asset id on a Hedera network.
 *
 * @remarks
 * Resolved rather than assumed. Getting this wrong is not a rounding error — it is a factor of
 * 100 in what gets charged, in whichever direction. HBAR has 8 decimals, USDC on Hedera has 6, and
 * an arbitrary HTS token has whatever its treasury chose.
 *
 * Unknown assets throw rather than defaulting. A default here would let a listing publish an asset
 * we cannot price and have us quietly bill in the wrong denomination.
 */
export function decimalsFor(asset: string, network: string): number {
  if (asset === HBAR_ASSET_ID) return HBAR_DECIMALS;

  const known = findDefaultAsset(asset, network as Network);
  if (known) return known.decimals;

  throw new UnsupportedAssetError(asset, network);
}

/**
 * Convert a decimal amount into an asset's smallest unit, exactly.
 *
 * @remarks
 * Integer arithmetic throughout, for the same reason `totalPrice` avoids floats: the value here
 * becomes the exact figure a transfer is signed for, and the facilitator rejects a payment that
 * does not match the requirement to the unit.
 */
export function toBaseUnits(amount: string, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(`cannot convert malformed amount: "${amount}"`);
  }

  const [whole = "0", fraction = ""] = amount.split(".");
  if (fraction.length > decimals) {
    throw new Error(
      `amount "${amount}" has more precision than the asset supports (${decimals} decimals)`,
    );
  }

  const padded = fraction.padEnd(decimals, "0");
  return (BigInt(whole + padded)).toString();
}
