import { billingPolicy, pricingCatalog, recommendedPackages } from "../config/catalog.mjs";

export { billingPolicy, recommendedPackages };

export function findPackage(packageCode) {
  return recommendedPackages.find((item) => item.code === packageCode) || null;
}

function getPrice(code) {
  return pricingCatalog.find((item) => item.code === code)?.price || 0;
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

export function buildPackagePreview(packageCode) {
  const selectedPackage = findPackage(packageCode);

  if (!selectedPackage) {
    return null;
  }

  const bonusCredits = Number(selectedPackage.bonusCredits || 0);
  const totalCredits = Number(selectedPackage.credits || 0) + bonusCredits;
  const sunoPrice = getPrice("suno_music");
  const minimax15Price = getPrice("music-1.5");
  const minimax20Price = getPrice("music-2.0");

  return {
    package: {
      ...selectedPackage,
      totalCredits,
    },
    amount: Number(selectedPackage.amount),
    credits: Number(selectedPackage.credits),
    bonusCredits,
    totalCredits,
    settlementMode: billingPolicy.settlementMode,
    pricePerCredit: totalCredits ? roundCurrency(Number(selectedPackage.amount) / totalCredits) : 0,
    estimatedGenerations: {
      sunoMusic: sunoPrice ? Math.floor(totalCredits / sunoPrice) : 0,
      minimax15: minimax15Price ? Math.floor(totalCredits / minimax15Price) : 0,
      minimax20: minimax20Price ? Math.floor(totalCredits / minimax20Price) : 0,
    },
  };
}

export function generateOrderNo(prefix = "CVM") {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${stamp}${random}`;
}
