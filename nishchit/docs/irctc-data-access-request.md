# Request for authorised access to Reservation Chart (vacant-berth) data

> **How to use this draft.** Example details are filled in below. **Replace the sample phone
> number `+91 98XXX XXXXX` with your real number** (and double-check the name/email) before
> sending, then use one of the channels in *Where to send this* (below). Keep it factual; do not
> overstate usage. This asks only for authorised, programmatic access to data IRCTC **already
> publishes** on the public *online-charts* page — not for any new or private data.

---

**To:** The Nodal Officer — Data / API Partnerships
Indian Railway Catering and Tourism Corporation (IRCTC)
[and / or] Centre for Railway Information Systems (CRIS)

**From:** Krupal Vora, developer of *Nishchit*
krupalvora00@gmail.com · +91 98XXX XXXXX · https://krupalvora.github.io/nishchit/

**Date:** 22 November 2026

**Subject:** Request for authorised programmatic access to Reservation Chart vacant-berth data for a non-commercial passenger-assistance tool

---

## 1. Who I am and what Nishchit does

I am an independent developer. I have built a small, **non-commercial** web tool called
**Nishchit** that helps passengers who do not hold a confirmed seat.

After the reservation chart is prepared, some berths sit **empty on part of the route** —
because of cancellations, no-shows, and passengers who booked only a short segment. Today a
waitlisted or unreserved passenger cannot easily see these partly-empty berths, and they travel
empty while people stand.

Nishchit reads the prepared chart and does one useful thing on top of it: it **stitches these
part-route vacant berths into a single seated journey** for the passenger's actual boarding and
alighting stations — for example "berth S4-23 up to Surat, then switch to B2-7 onward" — choosing
the option with the fewest changes. It is a planning aid only; **all booking stays on IRCTC.**

## 2. What data I am requesting

Access to the **same data that is already public** on
`https://www.irctc.co.in/online-charts/`, but through an **authorised, machine-readable channel**
instead of the public web page. Specifically, three read-only datasets per searched train and date:

| # | Data | IRCTC endpoint today | What it provides |
|---|------|----------------------|------------------|
| 1 | Train schedule / route | `GET /eticketing/protected/mapps1/trnscheduleenquiry/{train}` | Station list, timings, distances |
| 2 | Train composition + chart status | `POST /online-charts/api/trainComposition` | Coach list, class, whether the chart is prepared |
| 3 | Coach composition | `POST /online-charts/api/coachComposition` | Per-berth vacant/occupied status by route segment |

I am open to receiving this through **whatever channel you prefer** — an official API, a licensed
data feed, or authorisation for a fixed server IP — rather than the public endpoints above.

## 3. Public benefit

- **Fewer empty berths.** Surfacing part-route vacancies helps fill seats that otherwise run empty.
- **Helps the passengers who need it most** — waitlisted, RAC, and unreserved travellers.
- **Sends demand back to IRCTC.** Every suggestion ends in a booking on IRCTC; Nishchit sells nothing.

## 4. Technical scope and expected volume

- **Read-only.** Nishchit never books, cancels, modifies, or logs in on anyone's behalf.
- **No personal data.** It uses only train number, date, and station codes. It stores no passenger data.
- **Low volume, through caching.** A chart changes only when it is prepared (first and second chart),
  so Nishchit caches each train+date result. Many users searching the same train cost roughly
  **one request per train per chart preparation**, not one per user. I will honour any rate limit you set.
- **Identifiable traffic.** Requests identify themselves (e.g. `User-Agent: Nishchit/1.0 (+project URL)`)
  so they are easy to recognise, monitor, or throttle.

## 5. Commitments

- Use the data **only** for the passenger-assistance feature described above.
- **No resale, redistribution, or bulk scraping** of IRCTC data.
- Respect IRCTC's terms of use, branding, and any rate or caching limits you require.
- Display a clear notice that Nishchit is **not affiliated with IRCTC or Indian Railways** and that
  **a plan is not a ticket** (already shown in the app).
- Suspend access immediately on request.

## 6. What I am asking for

1. Confirmation of the **correct process** to obtain authorised access to this chart data, and
2. The **form of access** you can offer — official API, licensed feed, or an authorised server IP —
   together with any agreement, rate limits, or conditions I must accept.

I am happy to complete any formal application, sign an agreement, or meet to discuss scope and
safeguards. Thank you for your time and for considering this request.

Sincerely,
Krupal Vora
krupalvora00@gmail.com · +91 98XXX XXXXX
https://krupalvora.github.io/nishchit/

---

## Where to send this (verify current contacts before sending)

These channels change over time — **please confirm each is current** before you send:

- **IRCTC customer / corporate care:** `care@irctc.co.in` (ask them to route it to the data /
  API / B2B partnerships team).
- **IRCTC B2B / API partnership** enquiry form, if available on `irctc.co.in` (look for
  "Partner with us" / "B2B" / "API").
- **CRIS (Centre for Railway Information Systems):** the body that builds and runs these systems —
  see `cris.org.in` for the contact or RTI/partnership channel.
- **Indian Railways open-data:** check `data.gov.in` and the National Train Enquiry System (NTES)
  for any published datasets or API terms that already cover chart/vacancy data.

Tip: send it as a short email (see the covering note in `irctc-data-access-email.md`) with this
document attached or pasted below the note.
