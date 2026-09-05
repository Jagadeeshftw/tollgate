# Feedback — The Graph

From building an agent that buys on-chain data per query, with The Graph as the data source.

## What worked well

**The gateway is straightforward and the failure modes are honest.** An unauthenticated request
returns `auth error: missing authorization header` rather than a 404, which meant we could verify
the route was live and correct *before* we had a key — a small thing that let us gate the whole
Graph dependency on day one instead of waiting.

**The hosted Subgraph MCP server works out of the box** at `https://subgraphs.mcp.thegraph.com/sse`
with a Gateway key as a bearer token. No self-hosting, no build step.

**The network subgraph is a genuinely good API.** Being able to query the registry itself — every
subgraph, its display name, its current deployment — turned out to be the most useful endpoint we
touched. More on that below, because it is also the workaround for the problem.

## Friction

### 1. Standardized subgraphs are effectively undiscoverable by name

This is the one that matters, because it sits on the exact thing a prize track asks people to use.

The Composable/Standardized track asks builders to "build meaningfully on a standardized schema
(e.g. Messari Standardized Subgraphs)". So we went looking for one. What we found:

- **Searching the registry by name returns nothing.** Querying the network subgraph
  (`8pVKDwHniAz87CHEQsiz2wgFXGZXrbMDkrxgauVVfMJC`) for
  `displayName_contains_nocase: "messari"` returns an empty set. No subgraph on the network
  advertises the standard it implements in its name.
- **Explorer and web search do not close the gap.** Documentation and blog posts reference Messari
  standardized subgraphs by protocol ("Uniswap V3 Ethereum") but not by the deployment or subgraph
  id you actually need to query, and several ids that do surface are no longer queryable through
  the gateway (`subgraph not found`).
- **Nothing in a subgraph's metadata states its schema standard.** There is no field to filter on,
  so "find me a subgraph implementing the Messari DEX schema" has no direct expression.

The practical consequence: the recommended route into a $5,000 track has no reliable discovery
path. A builder either already knows an id, or hunts.

**The method that does work is schema probing.** A subgraph's schema is authoritative about which
standard it implements, so ask it directly — the Messari DEX standard roots at `dexAmmProtocols`:

```graphql
{ dexAmmProtocols { id name slug schemaVersion totalValueLockedUSD } }
```

A standardized subgraph answers. A bespoke one returns
`Type 'Query' has no field 'dexAmmProtocols'`. That is a definitive one-request test, and it works
regardless of what the subgraph is called.

Combined with the network subgraph, it gives a workable discovery loop that needs no prior
knowledge: enumerate deployments from the registry, probe each for the standard's root entity,
keep the ones that answer and are currently indexing.

**Suggestions, in order of how much they would have helped us:**

1. **Add a schema-standard field to subgraph metadata** — even a free-text `schemaStandard`
   ("messari/dex-amm@3.1.0") would make the registry query trivial and make the track's
   recommended route discoverable in one hop.
2. **Publish a maintained index of live standardized deployments** — protocol, chain, subgraph id,
   schema version, current indexing status. A page or a JSON file would do. The value is that it is
   *current*: most ids we found through search were stale.
3. **Document the schema-probe technique** in the standardized-subgraph docs. It is the reliable
   method and it is not written down anywhere we could find.

### 2. Stale subgraph ids are indistinguishable from wrong ones

Several ids found via documentation and search return `subgraph not found` from the gateway. That
error does not distinguish "this id never existed", "this id is not signalled on the network", and
"this deployment has been superseded" — all three read identically, so there is no signal about
whether to keep looking or fix the id you have.

**Suggestion:** distinguish unknown ids from known-but-unavailable ones in the gateway error.

### 3. Minor: the deprecated hosted-service host is a black hole

`api.thegraph.com` does not resolve or respond — requests hang until they time out rather than
failing fast. Plenty of tutorials still point there. A DNS-level failure or an immediate 410 with a
pointer to the gateway would save people a confused debugging session.

## Status of this feedback

Item 1 is a candidate for a contribution rather than only a complaint: the discovery loop above
(enumerate via the network subgraph, probe for the standard's root entity, filter by indexing
status) is small, general, and would work as a documented recipe or a utility. Whether we submit it
depends on how the rest of the build lands — see `spec/PHASE-0-GATES.md`. We will not file
something we have not actually used in anger.
