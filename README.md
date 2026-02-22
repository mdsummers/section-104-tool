# Section 104 tool

## Background

The aim of this tool is to assist in the tracking of a [Section 104 holding](https://www.gov.uk/government/publications/shares-and-capital-gains-tax-hs284-self-assessment-helpsheet/hs284-shares-and-capital-gains-tax-2021).

Such a holding is required for the calculation of (taxable) gains when making disposals from the pool. It is not applicable for tax-sheltered accounts (i.e. ISA / SIPP)

## Getting started

```
npm ci
npm link
s104 <input-file>
s104 -h
```

## Feature: Coinbase CSV Compatibility

This tool supports transaction history exported from Coinbase as a CSV file.

### Exporting your data from Coinbase

1. Navigate to: `https://accounts.coinbase.com/statements`
  Authenticate if required.
2. Under **Generate custom statement**, create a report with the following settings:
  - **Asset:** BTC  
  - **Transaction Types:** All transactions  
  - **Date range:** (enough to cover all activity)
3. Click **Generate Report**, then download the resulting **CSV** once it becomes available.
4. Save the CSV file somewhere accessible from your terminal.

### Running against the data

```bash
s104 ./path/to/downloaded.csv
```

Will output Section 104 pool and reporting information for all GBP transactions.

## Vanguard UK GIA CSV Compatibility

This tool supports **itemised transaction histories** from a Vanguard UK **General Investment Account (GIA)**, provided they are supplied in **CSV** format.

Vanguard exports transactions as **.xlsx** files, so you will need to convert the relevant sheet to CSV before importing.

### Exporting your data from Vanguard UK

**These instructions assume the account old design**

1. Log in to your Vanguard UK account.

2. Click **Documents** in the left-hand menu.

3. Open **Report Generator** and choose the **Client Transactions Listing - Excel** option.

4. Select a date range which covers all historic transactions and click **Generate Report**

5. Download the Created report when it becomes available in the document list (you may need to refresh the page).

### Converting the XLSX to CSV

Open the downloaded file in Excel, Numbers, LibreOffice, or similar spreadsheet software.

Locate the sheet containing the **GIA itemised transactions**, then export **that sheet only** to CSV:

- **Excel:**  
  `File → Save As → CSV (Comma delimited) (.csv)`

- **Numbers:**  
  `File → Export To → CSV`

- **LibreOffice Calc:**  
  `File → Save As → Text CSV (.csv)`

Ensure you export **only the transaction sheet**, not summaries or other tabs.

Save the resulting CSV somewhere accessible from your terminal.

### Running the import

```bash
s104 ./path/to/downloaded.csv
```

Will output Section 104 pool and reporting information for all discovered assets in the export.

### Important notes

The information being output by the tool is specific to General Investment Accounts (GIAs) *only*.

This tool outputs information on asset disposals, which help in the calculation of CGT liability. The tool **does not** make any attempt to assist with dividends, interest or excess reportable income. For details on those, please see the Vanguard materials on tax return information - `https://www.vanguardinvestor.co.uk/investing-explained/general-account-tax-information`

## Feature: Generic CSV format

The tool supports pool creation from a simple CSV format.

Currently only supports shares.

Spreadsheet software can be used to export CSV files matching this format, or a text editor.

### File Structure

The file is a comma-separated values (CSV) file with:

1. Metadata rows
2. Transaction record header row
3. Transaction rows in chronological order (oldest → newest)

Example layout:

```
Format,Generic,,,,
Share,Example plc,,,,
Currency,GBP,,,,
Date,Type,Quantity,Total,Fee,Description
2021-01-10,BUY,10000,25000,0,<optional>
2022-02-11,SELL,5000,15000,0,<optional>
```

### Metadata rows

#### Format indicator

* Mandatory
* Must start with case-insensitive string `Format,Generic`

#### Share name

* Mandatory
* Free text
* Not used in calculations
* Must contain the literal `Share` in column 1

e.g.
```
Share,Example plc,,,,
```

#### Currency

* Optional
* Not currently read, GBP used regardless

e.g.
```
Currency,GBP,,,,
```

### Transaction record header row

* Must begin `Date,`
* Other fields are not required in fixed order
* Non-documented fields are ignored

e.g.
```
Date,Type,Quantity,Total,Fee,Per share (pence),Description,Ignored
```

### Column details

Required unless otherwise stated

#### `Date`

* Format: `YYYY-MM-DD`
* Must be in ascending chronological order
* Multiple transactions, e.g. multiple BUYs are supported on the same date, but same-day matching is not yet supported

#### `Type`

* Allowed values: `BUY` or `SELL`
* No other values are accepted.

#### `Quantity`

* Positive integer
* No decimals (fractional shares not supported)

#### `Total`

For `BUY` trades:
* Represents gross acquisition cost
* Used to derive per-share cost if needed
* Does not include fees

For `SELL` trades:
* Represents disposal proceeds only
* Must not include fees
* Used for gain calculations and to ensure correct reporting information is produced

#### `Fee`

* May be:
  * A numeric value (e.g. 12.50)
  * `0`
  * Empty (blank field)
* Fees are not included in the `Total` column

### Important notes

* The share pool quantity may never go negative
* Only the final SELL may deplete the pool (dissolving it)
* Records must cover all historic transactions to avoid incorrect findings being produced.
* Records must be in chronological order (date ascending)

## TODO

* Full coverage for `InputFormat`s
* Wider Generic support for units and crypto

## Limitations

* Same-day matching is not implemented/tested.

(reaching unimplemented logic immediately throws)

## Disclaimer

This tool is provided "as is", without warranty of any kind, express or implied. The author shall not be held liable for any claims, damages or other liabilities arising from its use. This tool is for informational purposes only and does not constitute professional tax or financial advice. Users are encouraged to consult with a qualified tax professional before making any financial decisions.
