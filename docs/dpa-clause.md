# Data Processing Addendum (DPA) — Draft Clause

**Status: DRAFT — needs legal review before inclusion in client agreements**
**Owner:** Luke / cewall0
**Created:** 2026-06-29

> This is a starting point, not legal advice. Have a lawyer review before using in a client contract.

---

## Recommended Placement

Insert as a standalone section in the client service agreement, titled **"Data Processing"** or **"Data Processing Addendum."** Place it after the Services section and before Limitations of Liability.

---

## Draft Clause Text

---

**Data Processing**

**(a) Roles.** The parties agree that Client is the data controller and CAIAC Digital is the data processor with respect to any personal data of Client's end users (including leads, customers, and portal users) that is processed through the CAIAC Digital platform (the "End User Data").

**(b) Purpose Limitation.** CAIAC Digital will process End User Data only to the extent necessary to provide the Services described in this Agreement. CAIAC Digital will not process End User Data for its own commercial purposes, sell End User Data to third parties, or use End User Data for advertising or marketing.

**(c) Subprocessors.** CAIAC Digital may engage third-party subprocessors (including cloud hosting providers and transactional email providers) to assist in delivering the Services. CAIAC Digital will ensure that each subprocessor is bound by data protection obligations no less protective than those in this clause.

**(d) Security.** CAIAC Digital will maintain reasonable technical and organizational security measures to protect End User Data against unauthorized access, disclosure, alteration, or destruction. These include HTTPS encryption in transit, restricted database access, encrypted storage of integration credentials, and authentication requirements on all API endpoints.

**(e) Retention and Deletion.** CAIAC Digital will retain End User Data for the duration of the active client relationship. Upon termination of this Agreement, CAIAC Digital will delete or return End User Data within ninety (90) days, unless a longer retention period is required by applicable law.

**(f) Deletion Requests.** If Client receives a request from an end user to access, correct, or delete their personal data, Client will notify CAIAC Digital at us@caiacdigital.com. CAIAC Digital will cooperate with Client to fulfill such requests within a reasonable timeframe, not to exceed thirty (30) days.

**(g) Breach Notification.** In the event of a confirmed security breach that affects End User Data, CAIAC Digital will notify Client without undue delay, and in any case within seventy-two (72) hours of becoming aware of the breach. Notification will include the nature of the breach, the categories of data affected, and the steps CAIAC Digital is taking to contain and remediate the incident.

**(h) Audit.** Upon Client's reasonable written request (no more than once per year), CAIAC Digital will provide written confirmation that it is complying with its obligations under this clause.

---

## Review Checklist (before publishing)

- [ ] Legal review of the full clause text
- [ ] Confirm 90-day retention period is acceptable and operationally implemented (see nightly cleanup job in OPEN_ITEMS.md)
- [ ] Confirm 72-hour breach notification window is achievable (involves cewall0 for infrastructure response)
- [ ] Confirm subprocessor list is accurate: cloud VPS, Resend (email), Telnyx (SMS). Any others?
- [ ] Decide whether to name subprocessors explicitly or keep general
- [ ] Insert into client agreement template and have a lawyer review the full document in context
- [ ] Update `docs/pii-and-compliance.md` status to "Implemented" once in use

## Related

- [`docs/pii-and-compliance.md`](pii-and-compliance.md) — full PII inventory and compliance status
- `OPEN_ITEMS.md` — data retention implementation (nightly cleanup job)
