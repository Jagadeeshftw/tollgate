import type { Listing } from "./listing.js";

export interface DataRequest {
  readonly label: string;
  readonly units: number;
  readonly listing: Listing;
}

/**
 * Where the goods come from once payment clears.
 *
 * @remarks
 * Implemented in Phase 4 against live Graph providers. It is an injected interface rather than a
 * direct import so that the payment layer can be built and tested before the data layer exists —
 * but note that there is deliberately **no fallback implementation**. A stub returning plausible
 * data would be worse than no implementation at all: mocked or static datasets are an explicit
 * disqualifier for both Graph tracks, and a service that charges for invented data is one bad
 * merge away from being demoed by accident.
 */
export interface DataSource {
  readonly name: string;
  fetch(request: DataRequest): Promise<unknown>;
}
