# ENS — submission answers

Track entered: **Best Use of ENSv2**. Built on ENSv2, Sepolia.

---

## How we used ENS

**A name is the service.** Not a pointer to one — the listing itself. Everything a buyer needs to
transact lives on the name, and the permissions over those records are the product's security
model.

`tollgatehq.eth` is registered on Sepolia and carries a subname per service. Each subname publishes:

| Record | Standard | Holds |
|---|---|---|
| `agent-context` | ENSIP-26 | what the service sells, in prose an agent reads |
| `agent-endpoint[web]` | ENSIP-26 | the x402-gated endpoint |
| `x402:price` | ours | price per unit |
| `x402:unit` | ours | what one unit is |
| `x402:settlement` | ours | the Hedera account that gets paid |
| `x402:network` / `x402:asset` | ours | CAIP-2 network, asset id |

Where ENS has standardised a key we use the standard verbatim rather than inventing one. Where none
exists — x402 has no ENSIP for price discovery — we namespace under `x402:` so it is obvious the
key belongs to the payment protocol and is not squatting a generic name.

### What we built with ENSv2 specifically

**Our own subname registry**, a `UserRegistry` proxy deployed through `VerifiableFactory` and
attached to the parent at registration, so the parent is never in an unattached state.

**A registrar with its own rules** (`TollgateRegistrar`). A listing is atomic — the name is minted
and every record written in one transaction, or the whole thing reverts, so a name is never visible
in a half-configured state where an agent could read an endpoint but no price. Listings expire and
can be revoked, and revocation clears the records rather than leaving live ones on a burned name.

**Per-key Enhanced Access Control — the part that matters.** At listing time the registrar
delegates `ROLE_SET_TEXT` on exactly two record keys, via `authorizeTextRoles`. The operator can
change their price and their endpoint. They **cannot** change the account that gets paid, and they
cannot redefine the unit their price is quoted in — an operator free to redefine a unit could
multiply the bill without touching the advertised price.

The operator also owns the name's ERC-1155 token but is granted a role bitmap withholding
`ROLE_SET_RESOLVER` and `ROLE_SET_SUBREGISTRY`. Without that, the delegation would be trivially
bypassable: point the name at a resolver you control and publish any settlement account you like.

**None of this is enforced by our code.** It is ENS refusing a transaction. We demonstrate it
rather than describing it — `pnpm ens:demo-delegation`, from a genuinely separate operator account
holding only the delegated keys:

```
1. operator changes agent-endpoint[web]     SUCCESS  0xcad23ba4…
2. same operator attempts x402:settlement   REFUSED by ENS Enhanced Access Control
                                                     (EACUnauthorizedAccountRoles)
   settlement still 0.0.10319209
```

The script fails loudly if the operator is *not* refused, or if settlement changes, so the
demonstration cannot quietly decay into theatre.

**Discovery is real.** The agent is handed no endpoints. It reads `ServiceListed` / `ServiceRevoked`
from the registrar's event log, replays them in order so revoked listings disappear, then reads each
survivor's terms from the resolver rather than from the event — the event records what was true at
listing time, the resolver records what is true now, and an operator who has repriced should be
quoted their current price.

**No hard-coded values in the read path.** Resolution goes through `UniversalResolverV2` from a
DNS-encoded name; the read path does not even reference our resolver's address.

### Verify it yourself

```bash
cast call 0x4A1817d13E9cF196f471725176355C1234b63C70 "resolve(bytes,bytes)(bytes,address)" \
  $(cast --to-hex "$(printf '\x0duniswap-pools\x0atollgatehq\x03eth\x00')") \
  $(cast calldata "text(bytes32,string)" \
      $(cast namehash uniswap-pools.tollgatehq.eth) "x402:price") \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

- Parent and contracts: [deployer on Etherscan](https://sepolia.etherscan.io/address/0xF6A97d82885628b68DC2AdCFaBA936578AffeF8F)
- 16 fork tests run against the **deployed** ENSv2 beta, asserting the exact
  `EACUnauthorizedAccountRoles` error, resource and role bitmap rather than accepting any revert.
  The claim is about ENS's access control, so a mock resolver would only prove our mock behaves as
  we assumed.

---

## Feedback

Full detail in `FEEDBACK/ENS.md`.

**1. `contracts-v2` on `main` ships deployment artifacts for a superseded tree.** This cost us three
days. Cloning the repo — the natural thing to do when you want the interfaces — gives
`contracts/deployments/sepolia/*.json` naming a complete, internally consistent address set where
every address still holds bytecode on Sepolia. Nothing marks it stale. We built against it; the
names resolved correctly *within that tree* and were invisible to the ENS App.

A superseded deployment is not distinguishable from a current one by inspection. Both answer
`eth_getCode`; both are self-consistent — we checked `UniversalResolverV2.ROOT_REGISTRY()` on each
and each pointed at its own root registry, which we misread as two equally valid deployments rather
than one current and one retired.

**It also gives wrong answers about name availability**, which has a direct cost. `isAvailable("tollgate")`
returns `true` on the superseded registrar and `false` on the live one — on the current deployment
`tollgate` is RESERVED. A developer following the artifacts believes a name is free, plans around
it, and their registration fails. That is worse than the address confusion, because the answer looks
authoritative and is simply wrong for the tree everyone else is on.

*What resolves it, and it is a good answer:* `ROOT_REGISTRY()` on the upgradable Universal Resolver
proxy at `0xeEeEEEeE…EeEe`, which is stable across deployments and returns the tree actually being
served. Canonical, self-updating, one call. We now assert it in CI. **Suggestions:** mark the
artifacts on `main` as historical or point at the docs; and put the UR-proxy trick in the docs — it
is the most useful thing we learned about operating on the beta and we only learned it by asking.

**2. The registry and the resolver use different keyspaces, and conflating them fails silently.**
`PermissionedRegistry` keys by labelhash with a version in the low 32 bits; `PermissionedResolver`
keys by namehash. Both are `uint256`-shaped, so passing one where the other is expected compiles,
does not revert, and addresses a different name. We hit it writing `unregister()` and caught it by
reading `_constructTokenId`, not by a test.

**3. `authorizeTextRoles` takes a DNS-encoded name while the record setters take a namehash.** A
registrar has to carry both representations and keep them in sync; we initially accepted them as
two constructor arguments, got them inconsistent, and produced exactly the silent failure above —
delegation granted on a resource nobody checks. We now derive the namehash from the DNS encoding so
they cannot disagree.

*A correction we are recording deliberately:* an earlier draft of our feedback claimed the docs
deployments table omitted `PermissionedResolverImpl` and `UserRegistryImpl`. **That was wrong** —
both are listed, along with `LabelStore`. The omission was in a summarised fetch of the page that
we did not check against the source. The docs were right; our reading was not.

## Comments

Per-record-key authorization is the standout feature and the reason we chose ENSv2. It let us
express the exact rule the product needs — *an operator may change their price, but not the account
that gets paid* — in one call, with no permission layer of our own. We assumed we would have to
build that above the resolver and were glad to find it already there, scoped per-name as well as
per-key. The resource model in `PermissionedResolverLib.resource(node, part)` is an elegant way to
get fine granularity out of a flat role bitmap, and the nybble-packed roles read far better than
they sound once the `1 << (4n)` layout clicks.
