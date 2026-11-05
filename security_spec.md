# SuryaSetu Zero-Trust Firestore Security Specification

## 1. Master Source of Truth & Data Invariants

1. **Default-Deny Catch-All**: All paths default to `allow read, write: if false;`.
2. **Verified Authentication Invariant**: Every authenticated write and protected read requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Privilege Anti-Escalation Invariant**: Users creating `/users/{userId}` can only self-assign `role == 'HOMEOWNER'` unless verified as the bootstrapped administrator (`rohitumdale@gmail.com` with `email_verified == true`) or present in `/admins/{uid}`. Users can never modify `role` on their own profile via standard profile updates.
4. **PII Split-Collection Invariant (DPDP Act 2023)**: User contact PII (`/user_private/{userId}`) and lead contact PII (`/lead_contacts/{leadId}`) are strictly isolated from core operational collections and readable only by `ownerUid`, bounded `assignedStaffUids`, or `isAdmin()`.
5. **Relational Existence & Master Gate Invariant**:
   - `/lead_contacts/{leadId}` requires `exists(/databases/$(database)/documents/leads/$(leadId))` or atomic `existsAfter(...)`.
   - `/electricity_bills/{billId}`, `/bill_extractions/{extractionId}`, `/lead_scores/{scoreId}`, and `/quotations/{quotationId}` require `exists(/databases/$(database)/documents/leads/$(incoming().leadId))` on creation.
   - Subcollections `/quotations/{quotationId}/items/{itemId}` and `/projects/{projectId}/{documents|payments|history}/{childId}` enforce the Master Gate by fetching the parent document via `get()` and verifying current membership (`ownerUid == request.auth.uid`, `request.auth.uid in parent.assignedStaffUids`, or `isAdmin()`).
6. **System-Generated Field Immutability**: AI-computed telemetry fields (`confidenceScore`, `clarityStatus` on `/bill_extractions/{extractionId}`) cannot be modified during user verification updates.
7. **Terminal State Locking Invariant**:
   - `/leads/{leadId}` locked against non-admin updates once `leadStage == 'CONVERTED'`.
   - `/quotations/{quotationId}` locked against non-admin updates once `status == 'CONVERTED'`.
   - `/projects/{projectId}` locked against non-admin updates once `currentStage == 'PROJECT_COMPLETED'`.
   - `/projects/{projectId}/history/{historyId}` is strictly append-only (`allow update, delete: if false`).
8. **Zero-Lookup Cost-Safe List Queries**: No `get()` or `exists()` lookups appear inside any `allow list` rule. Every `allow list` rule evaluates `resource.data` directly against `request.auth.uid` or verified token claims.
9. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps must equal `request.time`, and `createdAt` + `ownerUid` are immortal (immutable on updates).
10. **Unguessable Token Capability Isolation**: `/public_tracking/{trackingToken}` enforces `allow list: if false`, requires `trackingToken.size() >= 24`, and prohibits storing PII (`email`, `mobileNumber`, `billImage`).

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Privilege Escalation on Registration (`Identity`)**:
   Authenticated homeowner creates `/users/user_abc` with `role: "ADMIN"`.
   *Expected*: `PERMISSION_DENIED`.
2. **Payload 2 — Shadow Field Injection on Lead Update (`Integrity`)**:
   Homeowner updates `/leads/lead_1` with required fields plus ghost field `"isVerified": true`.
   *Expected*: `PERMISSION_DENIED` via `hasOnly()` + `affectedKeys().hasOnly()`.
3. **Payload 3 — Unverified Admin Email Spoof (`Identity`)**:
   Token has `email: "rohitumdale@gmail.com"` with `email_verified: false` attempting admin rule creation on `/admin_rules/rule_1`.
   *Expected*: `PERMISSION_DENIED`.
4. **Payload 4 — Cross-Tenant PII Scrape (`Identity / PII`)**:
   Authenticated `user_attacker` attempts `get` on `/lead_contacts/LD-30881` belonging to `user_victim`.
   *Expected*: `PERMISSION_DENIED`.
5. **Payload 5 — Blanket Collection List Scraping (`Query Trust`)**:
   Authenticated `user_attacker` executes unfiltered `list` on `/leads` without `where('ownerUid', '==', uid)`.
   *Expected*: `PERMISSION_DENIED`.
6. **Payload 6 — ID Poisoning / Denial-of-Wallet (`Integrity`)**:
   Authenticated user attempts `create` on `/leads/<200-char-junk-id!@#$>`.
   *Expected*: `PERMISSION_DENIED` via `isValidId()`.
7. **Payload 7 — AI Confidence Score Tampering (`System-Only Fields`)**:
   Homeowner updates `/bill_extractions/ext_1` changing `confidenceScore` from `42` to `99`.
   *Expected*: `PERMISSION_DENIED`.
8. **Payload 8 — Terminal Project Mutation (`State`)**:
   Staff user attempts to change `currentStage` on `/projects/prj_1` after `currentStage == "PROJECT_COMPLETED"`.
   *Expected*: `PERMISSION_DENIED`.
9. **Payload 9 — Orphaned Electricity Bill Creation (`Relational Integrity`)**:
   Homeowner creates `/electricity_bills/bill_orphan` pointing to non-existent `leadId: "LD-99999"`.
   *Expected*: `PERMISSION_DENIED` via `exists()` check.
10. **Payload 10 — Client Timestamp Forgery (`Temporal Integrity`)**:
    Homeowner creates `/leads/LD-30999` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
    *Expected*: `PERMISSION_DENIED`.
11. **Payload 11 — Public Tracking Enumeration (`Capability Leak`)**:
    Anonymous or signed-in attacker attempts `list` query on `/public_tracking`.
    *Expected*: `PERMISSION_DENIED`.
12. **Payload 12 — Value Poisoning on Whitelisted Key (`Integrity`)**:
    Staff updates whitelisted `pendingActivities` on `/projects/prj_1` with a 50KB string or boolean value.
    *Expected*: `PERMISSION_DENIED` via `isValidSolarProject(incoming())` wrapping the entire `allow update` gate.
