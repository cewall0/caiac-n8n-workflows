# PII Storage and Compliance

**Decision date: 2026-06-22**
**Status: Policy approved — implementation items tracked in OPEN_ITEMS.md**

> This document is operational guidance, not legal advice. Consult a lawyer before finalizing client contracts or making representations about compliance.

---

## PII Inventory

**This table is the canonical record of every place CAIAC stores personal data.** Update it whenever a new column, table, or integration is added that touches personal data. Claude must update this table before deploying any change that introduces new PII storage.

| Data | Table / Service | Column / Field | Encrypted | Since |
|---|---|---|---|---|
| Client admin email | `caiac.clients` | `config` JSONB | No | Day 1 |
| Client admin email | `caiac.client_platform_config` | `client_admin_email` | No | Day 1 |
| Lead name, email, phone + intake fields | `caiac.leads` | `intake_data JSONB` | No | v2.1.0 (planned) |
| CRM API credentials | `caiac.client_crm_configs` | `crm_config` JSONB | Yes (pgcrypto) | 2026-06-20 |
| Review link signing secret | `caiac.client_platform_config` | `link_signing_secret` | No | Day 1 |
| Visitor IP address (public chat) | `caiac.audit_log` | `detail JSONB → ip` | No | 2026-06-26 |

### How to Add a New Entry

When adding a new DB column, table, or third-party integration that stores personal data:

1. Add a row to the table above with: what data, where it lives, whether it's encrypted, and the date/version
2. Assess whether it changes the **PII category** (basic contact vs. sensitive — see below)
3. If it's a new sensitive PII category (health, financial, government ID), stop and get legal review before shipping
4. Check the **Regulatory Landscape** section — does the new data push you into a new regulatory tier?
5. Update `saveDataSuccessExecution: "none"` on any workflow that processes the new PII through execution nodes
6. Note in the PR description what PII is added and why

**PII categories in use:**
- **Basic contact** (name, email, phone, address) — current tier. Lower risk. Breach notification required if exposed.
- **Sensitive** (SSN, financials, health, passwords, government ID) — not currently stored. Requires encryption at rest, additional legal review, and likely sector-specific compliance work before adding.

**CAIAC's role:** Data processor. Clients (the trades businesses) are data controllers — they collected consent from their leads. CAIAC processes that data on the client's behalf to operate the service.

---

## Regulatory Landscape

### US Federal
No general privacy law applies. Sector-specific laws (HIPAA, GLBA, COPPA) are not relevant to a trades services SaaS.

### US State Laws (CCPA/CPRA, VCDPA, etc.)
Apply based on volume/revenue thresholds. CCPA (strictest) requires:
- 100k+ California consumer records processed per year, **or**
- $25M+ revenue, **or**
- 25k+ records + >50% revenue from selling data

**At current scale:** Below threshold. Not yet applicable.
**Trigger to revisit:** ~50k lead records processed per year, or any client expansion into regulated industries.

### GDPR
Applies only if serving EU residents. Not currently applicable.

### CAN-SPAM
Applies to commercial email. Follow-up emails sent to leads are transactional (response to an inquiry the lead initiated) — low risk. Ensure unsubscribe handling is present in any email that could be construed as marketing.

---

## Required Implementations

### 1. Privacy Policy on Website (caiac-website)
**Status: Not done**

Must disclose:
- What data is collected (lead name, email, phone via client intake forms)
- That CAIAC stores this data on behalf of clients
- Data retention period
- How users can request deletion

**Owner:** Luke — website update in `caiac-website` repo.

### 2. Data Processing Addendum (DPA) in Client Agreements
**Status: Not done**

One paragraph in the client contract stating:
- CAIAC is a data processor; client is the data controller
- CAIAC processes lead data only to operate the service
- CAIAC will not sell or share lead data with third parties
- CAIAC will assist with data deletion requests
- CAIAC maintains reasonable security measures

**Owner:** Luke / business decision — may need legal review before finalizing.

### 3. Data Retention Policy
**Status: Decision needed**

Decide: how long do we keep lead data after a client churns?

**Recommendation:** 90 days after churn date (client deactivated in `caiac.clients`). Long enough for final exports; short enough to limit liability.

Implementation: add a `Delete Churned Client Lead Data` node to `CAIAC Maintenance - Nightly Cleanup v1.0.0`:
```sql
DELETE FROM caiac.leads
WHERE client_id IN (
  SELECT id FROM caiac.clients
  WHERE active = false
  AND updated_at < NOW() - INTERVAL '90 days'
);
```

### 4. n8n Execution Log PII Exposure
**Status: Must fix before v2.1.0 deploys**

n8n stores node outputs in execution history. The `Extract and Fingerprint Lead` node outputs `name`, `email`, `phone` — these land in n8n's internal Postgres table (`execution_data`). This is PII sitting in plaintext in the n8n DB.

**Fix:** Set `saveDataSuccessExecution: "none"` on Lead Capture v2.1.0. This stops n8n from persisting successful execution output to disk. Error executions still save (needed for debugging).

Add to Lead Capture workflow settings:
```json
"settings": {
  "saveDataSuccessExecution": "none",
  "saveDataErrorExecution": "all",
  "executionOrder": "v1"
}
```

Also check: `CAIAC Maintenance - Nightly Cleanup` should prune execution logs regularly. n8n has a global pruning setting (Settings → Log Pruning) — set to 30 days max.

### 5. Breach Response Plan
**Status: Not documented**

If the VPS is compromised:
1. Immediately rotate all API keys and DB credentials
2. Identify what data was accessible (scope the breach)
3. Notify affected individuals within state-required window (typically 30-72 hours for some states, 30-60 days for others)
4. Preserve logs for investigation
5. Notify clients (they may have their own notification obligations to their customers)

**Owner:** cewall0 (infrastructure) + Luke (client notification).

---

## Technical Security (Already Implemented)

- HTTPS on all endpoints ✅ (Cloudflare)
- Webhook authentication required on all intake endpoints ✅ (Header Auth)
- CRM credentials encrypted at rest ✅ (pgcrypto + `CAIAC_ENCRYPTION_KEY`)
- DB not publicly exposed ✅ (VPS, no public Postgres port)
- No secrets in workflow JSON ✅ (n8n Credentials Manager)
- JWT-based auth with short-lived tokens ✅ (Full Auth v2.0.0)
- Public chat IP logging: uses `CF-Connecting-IP` (Cloudflare-set, not spoofable via public internet); sanitized to IPv4/IPv6 charset before storage; purpose-limited to rate limiting only; governed by `audit_log` nightly pruning retention

---

## Scale Triggers — When to Revisit

| Trigger | Action |
|---|---|
| ~50k lead records/year | Assess CCPA threshold; implement rights management (access, deletion on request) |
| Any EU client | GDPR compliance project — DPA upgrade, data residency decision |
| Client in regulated industry (healthcare, finance) | Sector-specific compliance review |
| Investor due diligence | SOC 2 Type II audit consideration |
