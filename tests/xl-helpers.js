// FC-00033: export cells may hold a formula ({formula, result}). These helpers read a cell
// the way Excel shows it on open: the cached result for a formula, the value otherwise.
function xlNum(cell) {
  if (!cell) return undefined;
  const v = cell.value;
  return v && typeof v === 'object' && 'formula' in v ? v.result : v;
}
// A zero in a column whose number format hides zeros (third section "") displays as blank.
function xlHidesZero(cell) {
  return !!(cell && typeof cell.numFmt === 'string' && /;""$/.test(cell.numFmt));
}
module.exports = { xlNum, xlHidesZero };
