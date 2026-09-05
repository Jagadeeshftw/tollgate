//! Uniswap V3 swaps on Ethereum mainnet, decoded straight from block logs.
//!
//! No ABI file and no `Abigen`: the event has one canonical signature, so a `topic0` constant plus
//! hand decoding is fewer moving parts than a code generator and one less dependency in the wasm.
//! The topic0 below was computed with `cast keccak` and cross-checked against the verified table in
//! the `substreams-ethereum` skill — the skill is explicit that inventing one is the classic error.

mod pb;

use pb::tollgate::uniswap_v3::v1 as out;
use substreams::errors::Error;
use substreams::scalar::BigInt;
use substreams::Hex;
use substreams_ethereum::pb::eth::v2 as eth;

/// keccak256("Swap(address,address,int256,int256,uint160,uint128,int24)")
const SWAP_TOPIC: [u8; 32] =
    hex_literal::hex!("c42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67");

/// `Hex::encode` is lowercase and carries no `0x`, so every emitted address re-prefixes.
fn hex0x(bytes: &[u8]) -> String {
    format!("0x{}", Hex::encode(bytes))
}

/// An address inside a topic is left-padded to 32 bytes; the address is the last 20.
fn address_from_topic(topic: &[u8]) -> String {
    hex0x(&topic[topic.len().saturating_sub(20)..])
}

/// Two's-complement signed decode. `amount0`/`amount1` are `int256` and are negative on one side of
/// every swap — reading them as unsigned turns an outflow into an astronomically large inflow.
fn signed(word: &[u8]) -> BigInt {
    BigInt::from_signed_bytes_be(word)
}

fn unsigned(word: &[u8]) -> BigInt {
    BigInt::from_unsigned_bytes_be(word)
}

/// `int24`, sign-extended from the low 3 bytes of its 32-byte word.
fn tick_from(word: &[u8]) -> i32 {
    let raw = ((word[29] as i32) << 16) | ((word[30] as i32) << 8) | (word[31] as i32);
    if raw & 0x80_0000 != 0 { raw - 0x100_0000 } else { raw }
}

#[substreams::handlers::map]
fn map_swaps(block: eth::Block) -> Result<out::Swaps, Error> {
    let timestamp = block
        .header
        .as_ref()
        .and_then(|h| h.timestamp.as_ref())
        .map(|t| t.seconds)
        .unwrap_or_default();

    let mut swaps = Vec::new();

    // `transactions()` yields successful transactions only, and `logs_with_calls()` skips logs
    // emitted inside reverted sub-calls — those never reached chain state and would inflate volume.
    for trx in block.transactions() {
        let tx_hash = hex0x(&trx.hash);

        for (log, _call) in trx.logs_with_calls() {
            // Cheapest reject first. Every V3 pool is its own contract, so there is no address
            // allowlist here: the topic is what identifies the event.
            if log.topics.len() != 3 || log.topics[0] != SWAP_TOPIC {
                continue;
            }
            // amount0, amount1, sqrtPriceX96, liquidity, tick — five 32-byte words.
            if log.data.len() < 160 {
                continue;
            }

            swaps.push(out::Swap {
                pool: hex0x(&log.address),
                sender: address_from_topic(&log.topics[1]),
                recipient: address_from_topic(&log.topics[2]),
                amount0: signed(&log.data[0..32]).to_string(),
                amount1: signed(&log.data[32..64]).to_string(),
                sqrt_price_x96: unsigned(&log.data[64..96]).to_string(),
                liquidity: unsigned(&log.data[96..128]).to_string(),
                tick: tick_from(&log.data[128..160]),
                block_number: block.number,
                block_timestamp: timestamp,
                tx_hash: tx_hash.clone(),
                log_index: log.index,
            });
        }
    }

    Ok(out::Swaps { swaps })
}
