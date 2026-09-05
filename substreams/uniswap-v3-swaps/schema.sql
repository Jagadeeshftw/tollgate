-- One row per Swap log. (tx_hash, log_index) is the natural key: a transaction can contain many
-- swaps, and log_index is unique within a transaction.
CREATE TABLE IF NOT EXISTS swaps (
    tx_hash          TEXT      NOT NULL,
    log_index        BIGINT    NOT NULL,
    pool             TEXT      NOT NULL,
    sender           TEXT      NOT NULL,
    recipient        TEXT      NOT NULL,
    -- NUMERIC, not BIGINT: int256 amounts exceed 64 bits routinely and are signed.
    amount0          NUMERIC   NOT NULL,
    amount1          NUMERIC   NOT NULL,
    sqrt_price_x96   NUMERIC   NOT NULL,
    liquidity        NUMERIC   NOT NULL,
    tick             INTEGER   NOT NULL,
    block_number     BIGINT    NOT NULL,
    block_timestamp  BIGINT    NOT NULL,
    PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS swaps_pool_block ON swaps (pool, block_number);
