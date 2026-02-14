### Structure

An input file is parsed into a series of records:
* The input file path must be provided
* The format of the content must be determined/validated (i.e. coinbase export)
* The output records should be filtered down to buys and sells only

The records are normalized into trades:
* The normalization is going to depend on input format again
* Output format should be standard for trades, used by all formats

The trades are processed:
* Sorted into ascending time and asserted to be of correct form
* Section 104 holding formed, grown, shrunk
* Same-day and 30-day matching takes place
* As trades are processed, reporting information consistent with HS284 examples
* Summary information is returned

On completion:
* Summary information is presented
