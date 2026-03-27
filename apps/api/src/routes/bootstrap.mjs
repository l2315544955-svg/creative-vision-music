import {
  billingPolicy,
  organizationBlueprint,
  pricingCatalog,
  recommendedPackages,
  sunoVersions,
} from "../config/catalog.mjs";
import { getDatabaseRuntime } from "../lib/database.mjs";
import { getAlipayRuntimeStatus } from "../providers/alipay.mjs";
import { getAizntRuntimeStatus } from "../providers/aiznt.mjs";

export function registerBootstrapRoutes(app) {
  app.get("/api/health", (_req, res) => {
    res.json({
      success: true,
      data: {
        service: "creative-vision-music-api",
        timestamp: new Date().toISOString(),
        runtime: getAizntRuntimeStatus(),
        database: getDatabaseRuntime(),
      },
    });
  });

  app.get("/api/system/bootstrap", (_req, res) => {
    res.json({
      success: true,
      data: {
        supplier: "AIZNT",
        runtime: getAizntRuntimeStatus(),
        strategy: {
          primaryProvider: "suno",
          secondaryProvider: "minimax",
          recommendedLaunchModels: ["suno_music", "music-1.5"],
          deferredModels: ["music-2.0", "udio"],
        },
        sunoVersions,
        pricingCatalog,
        recommendedPackages,
        billingPolicy,
        organizationBlueprint,
        databaseRuntime: getDatabaseRuntime(),
        paymentRuntime: {
          alipayPage: getAlipayRuntimeStatus(),
        },
      },
    });
  });
}
