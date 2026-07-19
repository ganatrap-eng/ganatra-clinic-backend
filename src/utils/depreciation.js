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

/** Depreciation for a single asset for a single financial year (Sec. 32, WDV method).
 *  `knownWdvStart`, if given, is used directly instead of being recomputed —
 *  this is what makes assetWDVAsOf's year-by-year walk linear instead of
 *  exponential (see there). Callers computing a single year in isolation
 *  (e.g. statements.js) can omit it and it's derived the slower way, which
 *  is fine for a one-off lookup. */
function assetDepForFY(asset, fy, knownWdvStart) {
  const purchaseFY = fyOf(asset.purchase_date);
  if (parseInt(fy.split("-")[0]) < parseInt(purchaseFY.split("-")[0])) {
    return { dep: 0, wdvStart: 0, wdvEnd: 0, applicable: false };
  }
  let wdvStart;
  if (knownWdvStart !== undefined) wdvStart = knownWdvStart;
  else if (fy === purchaseFY) wdvStart = Number(asset.cost);
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

/** Written-down value of an asset as of any date, walking FY by FY from
 *  purchase — O(years since purchase), not exponential (see assetDepForFY:
 *  each step passes its own running WDV forward instead of asking
 *  assetDepForFY to re-derive it by re-walking everything before it). */
function assetWDVAsOf(asset, targetDate) {
  if (asset.purchase_date > targetDate) return { wdv: 0, cumDep: 0, acquired: false };
  const purchaseFY = fyOf(asset.purchase_date);
  const targetFY = fyOf(targetDate);
  let fy = purchaseFY;
  let wdv = Number(asset.cost);
  let guard = 0;
  while (guard < 60) {
    guard++;
    const r = assetDepForFY(asset, fy, wdv);
    wdv = r.wdvEnd;
    if (fy === targetFY) break;
    fy = nextFY(fy);
  }
  return { wdv, cumDep: Number(asset.cost) - wdv, acquired: true };
}

module.exports = { fyOf, fyRange, nextFY, prevFY, daysBetween, assetDepForFY, assetWDVAsOf };
