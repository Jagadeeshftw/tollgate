import { x402ResourceServer } from "@x402/core/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddleware } from "@x402/express";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import express, { type Express, type NextFunction, type Request, type Response } from "express";

import type { AuditLog } from "./audit.js";
import { NoopAuditLog } from "./audit.js";
import type { DataSource } from "./data.js";
import { requireListing } from "./ens.js";
import { IncompleteListingError, type Listings, UnknownServiceError } from "./listing.js";
import { InvalidUnitsError, quote, unitsRequested } from "./metering.js";
import { buildRouteConfig, labelFromPath } from "./paywall.js";
import { assertQuotable, UnquotableListingError } from "./validate.js";

export interface AppOptions {
  readonly listings: Listings;
  readonly facilitatorUrl: string;
  /** Omit only while the data layer is unbuilt; paid requests will 503 rather than invent data. */
  readonly dataSource?: DataSource;
  /** Where settled payments are recorded. Defaults to discarding them. */
  readonly auditLog?: AuditLog;
}

export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  const facilitator = new HTTPFacilitatorClient({ url: options.facilitatorUrl });
  const auditLog = options.auditLog ?? new NoopAuditLog();

  const server = new x402ResourceServer(facilitator)
    .register("hedera:testnet", new ExactHederaScheme())
    /**
     * Record every settled payment to the audit trail.
     *
     * Hooked to `onAfterSettle` rather than to the route handler so the trail records *settlement*,
     * not request completion. Those differ in exactly the cases that matter: a handler that throws
     * after the money moved would otherwise leave a payment with no entry.
     *
     * Deliberately not awaited into the response path — see HcsAuditLog. The payment has already
     * settled; failing the request now would leave a caller who paid and got nothing.
     */
    .onAfterSettle(async (context) => {
      const transport = context.transportContext as
        | { request?: { path?: string; adapter?: { getQueryParam?(name: string): unknown } } }
        | undefined;
      const path = transport?.request?.path ?? "";
      const label = labelFromPath(path) ?? "unknown";
      const rawLimit = transport?.request?.adapter?.getQueryParam?.("limit");
      const limit = Array.isArray(rawLimit) ? rawLimit[0] : rawLimit;

      let units = 1;
      let unit = "";
      try {
        units = unitsRequested(typeof limit === "string" ? limit : undefined);
        unit = (await options.listings.resolve(label))?.unit ?? "";
      } catch {
        // A malformed meter cannot retroactively invalidate a settled payment; record what we know.
      }

      void auditLog
        .record({
          service: label,
          units,
          unit,
          amount: String(context.result.amount ?? context.requirements.amount ?? ""),
          asset: String(context.requirements.asset ?? ""),
          payTo: String(context.requirements.payTo ?? ""),
          payer: String(context.result.payer ?? ""),
          transactionId: String(context.result.transaction ?? ""),
        })
        .catch((err: unknown) => {
          console.error(
            `[audit] failed to record settled payment ${String(context.result.transaction)}:`,
            (err as Error)?.message ?? err,
          );
        });
    });

  /** Unpaid, and free — lets an agent read the terms before deciding to transact. */
  app.get("/s/:label/quote", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const label = req.params.label as string;
      const listing = await requireListing(options.listings, label);
      const units = unitsRequested(
        typeof req.query.limit === "string" ? req.query.limit : undefined,
      );
      res.json({
        service: label,
        context: listing.context,
        quote: quote(listing, units),
        settlement: {
          account: listing.settlement,
          network: listing.network,
          asset: listing.asset,
        },
        schema: listing.schema,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get("/healthz", (_req, res) => res.json({ ok: true }));

  /**
   * Resolve and validate before pricing.
   *
   * @remarks
   * Without this, an unknown service or a malformed `?limit` first surfaces inside the paywall's
   * price callback, where the x402 middleware has no way to tell "this caller asked for something
   * impossible" from "this server is broken" — so it reports 500 for both. Rejecting here means an
   * agent gets 404 or 400 and can correct itself, and it keeps the failure honest: we never quote
   * a price for a request we were never going to serve.
   *
   * It also warms the listing cache, so the price and payTo callbacks that follow resolve from
   * the same read rather than racing a second one.
   */
  app.use("/s", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const label = labelFromPath(req.path);
      if (!label) {
        next();
        return;
      }
      unitsRequested(typeof req.query.limit === "string" ? req.query.limit : undefined);
      const listing = await requireListing(options.listings, label);
      // Reject an unpayable listing before quoting a price against it.
      assertQuotable(label, listing);
      next();
    } catch (err) {
      next(err);
    }
  });

  /**
   * Everything below here requires payment.
   *
   * @remarks
   * The trailing `syncFacilitatorOnStart` is left at its default of `true` on purpose. Without it
   * the resource server never fetches the facilitator's supported kinds and rejects every request
   * with "Facilitator does not support exact on hedera:testnet" — a 500 that reads like our bug
   * rather than a missing handshake. It does mean the service will not serve a 402 unless
   * Blocky402 is reachable, which is the correct dependency to have: we cannot honestly quote a
   * price for a settlement path we have not confirmed is up.
   */
  app.use("/s", paymentMiddleware(buildRouteConfig(options.listings), server));

  app.get("/s/:label", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const label = req.params.label as string;
      const listing = await requireListing(options.listings, label);
      const units = unitsRequested(
        typeof req.query.limit === "string" ? req.query.limit : undefined,
      );

      if (!options.dataSource) {
        // Reached only if a payment has already settled, so say plainly that the money moved and
        // the goods did not. Returning invented data here would be the single worst failure mode
        // available to this service.
        res.status(503).json({
          error: "data_source_unavailable",
          message:
            "Payment settled but no data source is configured. The Graph data layer lands in Phase 4.",
          service: label,
          units,
        });
        return;
      }

      res.json({
        service: label,
        units,
        unit: listing.unit,
        source: options.dataSource.name,
        data: await options.dataSource.fetch({ label, units, listing }),
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    // Log before classifying. A 500 in production with no log entry is undiagnosable, and this
    // handler previously swallowed one that a caller had already paid for.
    console.error(`[error] ${req.method} ${req.originalUrl} — ${err.name}: ${err.message}`);
    if (err instanceof UnknownServiceError) {
      res.status(404).json({ error: "unknown_service", service: err.label });
      return;
    }
    if (err instanceof InvalidUnitsError) {
      res.status(400).json({ error: "invalid_units", message: err.message });
      return;
    }
    if (err instanceof UnquotableListingError) {
      res.status(502).json({
        error: "unquotable_listing",
        service: err.label,
        reason: err.reason,
      });
      return;
    }
    if (err instanceof IncompleteListingError) {
      // The name exists but does not describe a payable service. That is the operator's problem,
      // not the caller's, so say so rather than returning a 402 nobody can satisfy.
      res.status(502).json({
        error: "incomplete_listing",
        service: err.label,
        missing: err.missing,
      });
      return;
    }
    // Reached only after payment has settled, so say plainly that the money moved and the goods
    // did not. 502 rather than 500: the failure is in the upstream data source, not in the gate.
    res.status(502).json({
      error: "data_unavailable",
      message:
        "Payment settled but the data source could not be reached. This is upstream of the " +
        "payment layer — the transaction is on chain and the audit trail records it.",
      detail: err.message,
    });
  });

  return app;
}
