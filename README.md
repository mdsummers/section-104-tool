# Section 104 tool

## Background

The aim of this tool is to assist in the tracking of a [Section 104 holding](https://www.gov.uk/government/publications/shares-and-capital-gains-tax-hs284-self-assessment-helpsheet/hs284-shares-and-capital-gains-tax-2021).

Such a holding is required for the calculation of (taxable) gains when making disposals from the pool. It is not applicable for tax-sheltered accounts (i.e. ISA / SIPP)

The tool was originally created for tracking coinbase transactions (CSV export of BTC-GBP transactions). I intend to expand it to Vanguard GIA reports.

## Getting started

```
npm ci
npm link
s104 <input-file>
s104 -h
```

## TODO

* Add ~~unit tests~~, **full** coverage, ~~linting~~ - WIP
* ~~Facilitate multiple input formats (e.g. Vanguard GIA report)~~
* Reduce ambiguity over "total" being net of fees...
  * ...or allow trade to take either proceeds XOR total
* Allow date formatting only, i.e. YYYY-MM-DD when the input format omits it, e.g. VanguardGIA

## Limitations

* Same-day matching is not implemented/tested.

(reaching unimplemented logic immediately throws)

## Disclaimer

This tool is provided "as is", without warranty of any kind, express or implied. The author shall not be held liable for any claims, damages or other liabilities arising from its use. This tool is for informational purposes only and does not constitute professional tax or financial advice. Users are encouraged to consult with a qualified tax professional before making any financial decisions.
