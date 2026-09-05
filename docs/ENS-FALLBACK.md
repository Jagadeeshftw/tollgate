# Can Track E proceed without the ENS App? — Yes. Verified.

**Question (asked while the ENS deployment question was still open):** if `#partner-ens` never
answers which ENSv2 Sepolia deployment the ENS App beta uses, can the registry be demonstrated on a
parent name we register ourselves? Does the "functional demo,
no hard-coded values" bar survive that, and does resolution work end to end through the
`UniversalResolver`?

**Answer: yes on all three.** Verified by execution, not by reading the contracts —
`pnpm ens:verify-fallback` runs it against a fork of the live Sepolia deployment and prints each
step. Re-runnable.

## What the verification does

1. **Confirms the parent label is available** and that `ETHRegistrar.register()` is an ordinary
   contract call. The ENS App is a *client* of that contract, not a gatekeeper to it.
2. **Deploys our `UserRegistry`, then registers the parent with that registry already attached** —
   `register()` takes `subregistry` as a parameter, so the parent is never in an unattached state.
   Payment is in MockUSDC (`0xD332…422f`), which has a public `mint()` on testnet: ~8 tokens for a
   year, freely mintable, no real funds.
3. **Lists a service through `TollgateRegistrar`**, exactly as in production.
4. **Resolves `uniswap-pools.tollgate.eth` through `UniversalResolverV2`** — the same public entry
   point any ENS client uses. `findResolver` returns *our* resolver, and `resolve()` returns the
   live record values:

```
resolve("uniswap-pools.tollgate-market.eth", text "x402:price")          -> "0.001"
resolve("uniswap-pools.tollgate-market.eth", text "x402:settlement")     -> "0.0.10319209"
resolve("uniswap-pools.tollgate-market.eth", text "agent-endpoint[web]") -> "https://tollgate.example/s/uniswap-pools"
```

## Why this satisfies ENS's bar

- **Built on ENSv2, Sepolia.** Same contracts either way; how the parent was acquired is not part
  of the criterion.
- **Central, not cosmetic.** Unchanged — the registry, the permissioned resolver and the per-key
  EAC delegation are the product.
- **Functional demo, no hard-coded values.** *Strengthened*, if anything. Resolution goes through
  `UniversalResolverV2` from a DNS-encoded name, so the read path knows nothing but the name — it
  does not even reference our resolver's address. Every value on screen is read from chain.

## Which deployment this runs against

The one the ENS App and Explorer serve — confirmed by ENS Labs and asserted in CI. `pnpm gates`
calls `ROOT_REGISTRY()` on the Universal Resolver proxy
(`0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe`, stable across deployments) and fails if it does not
match the root registry our config targets.

That matters because Sepolia also carries a **superseded** ENSv2 tree, which we originally built
against: complete, self-consistent, still holding bytecode, and invisible to the App. See
`FEEDBACK/ENS.md`.

**There is no longer a presentation cost.** An earlier version of this document argued that a
self-registered name would be less convincing because a judge could not look it up in the ENS App.
That was a consequence of being on the wrong tree. On the current tree the App resolves our names
like any other, so registering the parent ourselves and registering it through the App produce the
same artifact — the difference is only who sends the transaction.

## A trap worth knowing before you register

**`tollgate.eth` is RESERVED on the live deployment and cannot be registered** — registry status
`1`, expiry set to 2028, owner zero, and `ETHRegistrar.isAvailable("tollgate")` returns `false`.
Attempting it through the App would simply fail.

It *was* available on the superseded tree, which is one more way that tree misleads: a name can
look free there and be unobtainable on the deployment that counts. Verified available at the time
of writing: `tollgate-market`, `tollgatehq`, `tollgate-agents`, `tollgate-eth`, `paytollgate`,
`usetollgate`. The verification defaults to `tollgate-market`; override with `ENS_PARENT_LABEL`.

## Recommendation

Either route works and produces the same result, so take whichever is convenient — registering
through the App is fine now that we know it is the right tree. Keep this verification in the repo
regardless: it is the end-to-end proof that resolution works through the public
`UniversalResolver`, which is the check the ENS track actually cares about, and it is re-runnable
against whatever parent we end up with.
