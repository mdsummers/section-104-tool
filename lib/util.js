function daysBetween (a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function getUkTaxYear (date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid Date object');
  }

  const year = date.getFullYear();

  // UK tax year starts on 6 April
  const taxYearStart = new Date(year, 3, 6); // April = 3

  const startYear = date >= taxYearStart ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');

  return `${startYear}/${endYearShort}`;
}

function log (...args) {
  // allow us to wrap this later
  console.log(...args);
}

const COLSIZE = 20;
const LC_S104OPTS = { sizes: [0, 10] };
const LC_30DMATCH = { sizes: [0, 50, 1, 10] };
function logColumns (cols, {
  sizes = new Array(cols.length).fill(COLSIZE),
} = {}) {
  log(cols.map((c, i) => c.padStart(sizes[i] || COLSIZE, ' ')).join(' '));
}

module.exports = {
  log,
  logColumns,
  daysBetween,
  getUkTaxYear,
  COLSIZE,
  LC_30DMATCH,
  LC_S104OPTS,
};
