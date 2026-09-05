# Feedback — ENS (ENSv2 beta, Sepolia)

Written as we went, from actually building on the beta rather than reading about it. Phase 2 of
this project is an ENSv2 subname registry with per-record delegated permissions.

## What worked well

**Per-record-key authorization is the standout feature.** `authorizeTextRoles(name, key, account,
grant)` let us express the exact rule our product needs — *a service operator may change their own
price, but may not change the account that gets paid* — in one call, with no custom access-control
code on our side. We assumed we would have to build a permission layer above the resolver and were
glad to find it already there, and scoped per-name as well as per-key. The resource model in
`PermissionedResolverLib.resource(node, part)` is a genuinely elegant way to get fine granularity
out of a flat role bitmap.

**The nybble-packed role system reads far better than it sounds.** Once the `1 << (4n)` layout
clicked, `RegistryRolesLib` and `PermissionedResolverLib` were self-documenting, and the admin bit
being `role << 128` makes "who may delegate this onward" obvious at a glance.

**Deploying our own registry and resolver through `VerifiableFactory` was a two-line affair.**

## Friction

### 1. `contracts-v2` on `main` ships deployment artifacts for a superseded tree

This cost us three days, and it is worth reporting precisely because the trap is not where we first
thought it was.

Cloning `ensdomains/contracts-v2` (a natural thing to do when you want the interfaces) gives you
`contracts/deployments/sepolia/*.json` on `main`. Those artifacts name a **complete and internally
consistent set of addresses** — `RootRegistry`, `ETHRegistry`, `UniversalResolverV2`,
`UserRegistryImpl`, `PermissionedResolverImpl` — and every one of them still holds bytecode on
Sepolia. Nothing in the directory, the filenames, or the JSON says the set is superseded.

We built our subname registry against it. The names resolved correctly *within that tree*, so
nothing failed; they were simply invisible to the ENS App, which serves the current deployment.

The specific hazard is that a superseded deployment is not distinguishable from a current one by
inspection. Both answer `eth_getCode`. Both are self-consistent — we checked
`UniversalResolverV2.ROOT_REGISTRY()` on each and each pointed at its own root registry, which we
misread as evidence of two equally valid deployments rather than one current and one retired.

**What resolves it, and it is a good answer:** the upgradable Universal Resolver proxy at
`0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` is stable across deployments, and
`ROOT_REGISTRY()` on it returns the root registry of the deployment actually being served:

```
cast call 0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe "ROOT_REGISTRY()(address)"
  -> 0x8115186E8f2E0B0281e86ab91f0f48Ba90364354   # the current tree
```

That is canonical, self-updating and one call. We now assert it in CI so we cannot drift onto a
retired set again.

**A second, independent symptom — a name that is free on one tree and reserved on the other.**

The stale artifacts do not only misdirect contract calls; they give wrong answers about *name
availability*, which has a direct and visible failure cost. We planned to register `tollgate.eth`.
Asking each tree's `ETHRegistrar` the same question gives opposite answers:

```
cast call 0xa4449a0dD2b83007553D9b1d28b583A46A805a30 "isAvailable(string)(bool)" "tollgate"
  -> true    # superseded registrar, from the repo artifacts

cast call 0xa88553F454b77203B0D036A05c894d555EAAa2Cc "isAvailable(string)(bool)" "tollgate"
  -> false   # live registrar, from the docs table
```

On the live deployment `tollgate` is **RESERVED** — `ETHRegistry.getStatus()` returns `1`, with an
expiry set to 2028 and a zero owner. So a developer following the repo artifacts sees a name as
free, plans a project around it, and their registration fails on the deployment that counts.

This is worse than the address confusion because it is not a silent divergence a developer can
notice by comparing addresses — the answer looks authoritative and is simply wrong for the tree
anyone else is on. (We were lucky: we hit it while verifying, not at registration time.)

**Suggestions:**

1. **Mark the deployment artifacts on `main` as historical**, or remove them in favour of pointing
   at the docs. A `README.md` in `contracts/deployments/` saying "these are a snapshot; the
   authoritative list is <docs link>, and you can confirm the live tree with `ROOT_REGISTRY()` on
   the UR proxy" would have saved us entirely.
2. **Put the UR-proxy trick in the docs.** It is the single most useful thing we learned about
   operating on the beta and we only learned it by asking. It belongs next to the deployments
   table.

*Correction, recorded deliberately:* an earlier draft of this file claimed the docs deployments
table omitted `PermissionedResolverImpl` and `UserRegistryImpl`. **That was wrong.** Both are
listed, along with `LabelStore`
([docs.ens.domains/learn/deployments](https://docs.ens.domains/learn/deployments#sepolia-ensv2-beta)).
The omission was in a summarised fetch of that page which we did not check against the source
before writing it down. The docs were right; our reading of them was not.

### 2. The registry and the resolver use different keyspaces, and conflating them fails silently

`PermissionedRegistry` keys entries by **labelhash** (`keccak256(label)`, no parent) with a version
counter in the low 32 bits. `PermissionedResolver` keys records by **namehash** (which does include
the parent). Both are `uint256`/`bytes32`, so passing one where the other is expected compiles
cleanly, does not revert, and addresses a different name.

We hit this writing `unregister()` and caught it only by reading `_constructTokenId` in the source.

**Suggestion:** a short "ids and keyspaces" note in the contract-developer guide would help. Even
naming the parameters distinctly in the docs — `anyId` for registry calls versus `node` for
resolver calls, which the code does but the guide does not emphasise — would flag it.

### 3. `authorizeTextRoles` takes a DNS-encoded name while the record setters take a namehash

The asymmetry is defensible — the authorization needs to support "any name" via an empty encoded
name — but it means a registrar contract has to carry both representations of the same name and
keep them in sync. We initially accepted the parent's namehash and its DNS encoding as two
constructor arguments and got them inconsistent, which produced exactly the silent failure in (3):
delegation was granted on a resource nobody would ever check. We now derive the namehash from the
DNS encoding so they cannot disagree.

**Suggestion:** worth a warning in the Permissioned Resolver docs. A convenience overload taking a
node for the single-name case would remove the trap.

### 4. Beta caveat is doing a lot of work

"The contracts and interfaces described here are not yet final and may change prior to mainnet
deployment" appears in the contract-developer guide, but there is no changelog or version marker
to build against. We ended up writing minimal hand-extracted interfaces and fork-testing against
the live deployment rather than vendoring the contracts, specifically so that an upstream change
would fail our tests rather than pass against a stale local copy.

**Suggestion:** tag deployments with a version, and publish a changelog between beta deployments.

### 5. Public RPC endpoints silently return an incomplete `eth_getLogs` result

This is not an ENS contract issue, but it lands squarely on anyone doing ENS discovery from events,
and it is the most dangerous thing we hit all project because nothing fails.

Our registrar emits `ServiceListed` per subname, and the agent enumerates the marketplace by
replaying those events. On 3 September the hosted dashboard showed **one** listing. The chain held
**three**. Nothing errored. The same code had returned three the day before.

`eth_getLogs` was returning a *subset* of matching events — a different subset on different calls —
while `eth_call` against the resolver returned complete, correct records for all three names
throughout. Only historical log indexing was wrong, and it was wrong quietly.

Measured against `0x78155e1b4cd666244d5bdae73ad4a8c53693c661` on Sepolia, a registrar with exactly
three `ServiceListed` events, scanning from its deploy block (a range of ~11,000 blocks):

| Method | Listings found |
|---|---|
| Single `getLogs`, `fromBlock` → `latest` | 1 of 3 |
| Chunked at 500 / 1000 / 2000 / 5000 / 10000 / 20000 blocks | 1 of 3 at every size |
| Union of 2 endpoints × 3 rounds | 1 of 6 runs complete |
| Union + verifying each candidate via `eth_call` | 5 of 5 runs complete |

Endpoint behaviour, three consecutive identical queries each:

| Endpoint | Result |
|---|---|
| `ethereum-sepolia-rpc.publicnode.com` | 1, 1, 1 — reachable and consistently wrong |
| `1rpc.io/sepolia` | 3, error, 3 — correct when it answers |
| `sepolia.gateway.tenderly.co`, `rpc.sepolia.org`, `eth-sepolia.public.blastapi.io`, `sepolia.drpc.org`, `endpoints.omniatech.io` | errored from our network |

Chunking — the standard advice when `getLogs` misbehaves — did not help at any size, because the
failure is not range-limit truncation. An endpoint that answers from an incompletely indexed node
returns fewer events with no error at all.

The consequence for a name-based marketplace is that the catalogue silently shrinks. Every claim we
make about an agent *choosing between* services depends on there being services to choose between,
and a judge would have seen a one-listing marketplace with nothing indicating anything was missing.

**What we did.** Corroborate the scan across several endpoints on a hard deadline, then resolve
every candidate through the public ENS resolution path and drop any the resolver does not back — so
a stale hint cannot invent a service and a revoked one stays revoked. A gate now fails if discovery
finds fewer services than the deployment recorded, and the UI reports an under-reporting scan rather
than quietly showing a smaller market.

**Suggestion.** ENS documentation that recommends event-log enumeration — subname discovery in
particular — would be much stronger for a sentence saying public endpoints may return incomplete
log results without error, and that any list derived from logs should be re-verified through
resolver reads before it is shown to a user. A registry-level enumeration view, where it is
feasible, would remove the dependence entirely: `eth_call` was reliable on the same endpoints that
mis-served `eth_getLogs`.

## Overall

The feature set is genuinely well matched to what we are building — we chose ENSv2 because
per-record delegated permissions and revocable, expiring subnames let a name *be* the service
listing rather than merely point at one, and that held up in practice. Nearly all our friction was
in finding the right addresses and understanding the id model, not in the contracts themselves.
