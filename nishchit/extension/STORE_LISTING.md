# Chrome Web Store listing — copy/paste

## Name
Nishchit – Vacant Berth Finder

## Summary (≤132 chars)
Lets the Nishchit site read the public train reservation chart from your own browser to find berths left vacant.

## Category
Travel

## Description
Nishchit finds berths left vacant after the reservation chart is prepared and stitches them into a seated journey, even across coaches.

The chart is public on IRCTC's website, but IRCTC doesn't let other websites read it directly. This extension fetches it from your own browser when you search on https://krupalvora.github.io/nishchit/ so the results are live and nothing goes through a third-party server.

What it does
• Reads only the public chart for the train you search: route, coach list and berth vacancy.
• Works only on the Nishchit website. Does nothing anywhere else.
• Opens Nishchit once after you install it, so you can see it worked.
• May briefly open IRCTC's chart page in a background tab when IRCTC needs it. The tab closes itself after a couple of minutes.

What it doesn't do
• No accounts, no tracking, no analytics. No data is collected or sent anywhere except IRCTC.
• Does not read your IRCTC login, bookings or any other site.
• Does not book tickets. A plan is not a ticket: book each leg on IRCTC.

Not affiliated with IRCTC or Indian Railways.

## Single purpose
Fetch the public train reservation chart from the user's browser for the Nishchit vacant-berth finder website.

## Permission justifications
- **Host permission www.irctc.co.in**: to fetch the public reservation chart (train schedule, train composition, coach composition) that the user searches for on Nishchit.
- **scripting**: when IRCTC only answers requests from its own chart page, the extension makes that same chart request from an IRCTC chart tab.
- **Content script on krupalvora.github.io/nishchit**: to receive chart requests from the Nishchit page and return the results.

## Remote code
No. All code is in the package.

## Data usage
Does not collect or use user data.

## Privacy policy URL
https://krupalvora.github.io/nishchit/privacy.html
