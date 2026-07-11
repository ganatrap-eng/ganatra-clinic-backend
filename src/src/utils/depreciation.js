// Mirrors the calendar/depreciation logic used in the frontend, so the API
// and the app never disagree on a number. Keep the two in sync if either changes.

function fyOf(dateStr) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function fyRange(fy) {
  const startYear = parseInt(fy.split("-")[0], 10);
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

function nextFY(fy) {
  const y = parseInt(fy.split("-")[0], 10) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

function prevFY(fy) {
  const y = parseInt(fy.split("-")[0], 10) - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
}

/** Depreciation for a single asset for a single financial year (Sec. 32, WDV method). */
function assetDepForFY(asset, fy) {
  const purchaseFY = fyOf(asset.purchase_date);
  if (parseInt(fy.split("-")[0]) < parseInt(purchaseFY.split("-")[0])) {
    return { dep: 0, wdvStart: 0, wdvEnd: 0, applicable: false };
  }
  let wdvStart;
  if (fy === purchaseFY) wdvStart = Number(asset.cost);
  else wdvStart = assetWDVAsOf(asset, fyRange(prevFY(fy)).end).wdv;

  let dep;
  if (fy === purchaseFY) {
    const days = daysBetween(asset.purchase_date, fyRange(fy).end);
    dep = wdvStart * (days >= 180 ? Number(asset.rate) / 100 : Number(asset.rate) / 200);
  } else {
    dep = wdvStart * (Number(asset.rate) / 100);
  }
  dep = Math.min(dep, wdvStart);
  return { dep, wdvStart, wdvEnd: wdvStart - dep, applicable: true };
}

/** Written-down value of an asset as of any date, walking FY by FY from purchase. */
function assetWDVAsOf(asset, targetDate) {
  if (asset.purchase_date > targetDate) return { wdv: 0, cumDep: 0, acquired: false };
  const purchaseFY = fyOf(asset.purchase_date);
  const targetFY = fyOf(targetDate);
  let fy = purchaseFY;
  let wdv = Number(asset.cost);
  let guard = 0;
  while (guard < 60) {
    guard++;
    const r = assetDepForFY(asset, fy);
    wdv = r.wdvEnd;
    if (fy === targetFY) break;
    fy = nextFY(fy);
  }
  return { wdv, cumDep: Number(asset.cost) - wdv, acquired: true };
}

module.exports = { fyOf, fyRange, nextFY, prevFY, daysBetween, assetDepForFY, assetWDVAsOf };
