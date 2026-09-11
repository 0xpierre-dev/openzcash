# Monthly reading-set preview

Open `/monthly-preview` in a local build. This is a UI proposal using the dated September 1–10 reference, not a new monthly production issue. The final concise editorial selection still needs its own complete production review.

Monthly has 13 pages and ends with the Zcon7 update. Voter Supplement has 6 pages: a cover, NU7 advisory polling, and the complete 37-proposal Q3 register across four pages. Every proposal has its scope, applicant, exact USD request and a direct original proposal link in both the PDF and reader. The register is alphabetical, shows the September 10 cutoff, and identifies the $9,014,383.20 total as requested and unawarded. Neither document has a generic instructions or methodology closing page. Cover metrics describe the content rather than the sample's page count.

The month selector owns the issue. Three visible tabs own the type of reading: Monthly, Voter Supplement, and Sources & Data. Text labels and icons identify the views; gold, green and slate accents reinforce the selection. The reader keeps each PDF's page position, count, download and URL independent. Both sets of arrows turn one page.

Sources & Data has the original 77-source index, 32-community coverage register and 37-request Q3 register, with search, pagination, external source links and CSV export. The records retain the September 10 cutoff and requested/awarded distinction. The historical full reference remains accessible.

Generate these UI fixtures with `python reports/monthly/build_bundle_preview.py --source-dir /absolute/september-01-10-issue`. It requires the source JSON, original PDF, logo assets and the approved fonts on the local host. It does not use or alter the publication importer, monthly quality sign-off or recurring schedule. Future production support for multiple document types needs explicit schema, importer, monthly-prompt and review updates before deployment.
