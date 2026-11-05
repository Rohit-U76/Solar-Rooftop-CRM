import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = process.cwd();
const rulesSource = fs.readFileSync(path.join(ROOT_DIR, 'firestore.rules'), 'utf8');
const blueprintJson = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, 'firebase-blueprint.json'), 'utf8')
) as {
  firestore: Record<string, { schema: string; description: string }>;
};

describe('Firestore Zero-Trust Security Rules & Blueprint Alignment', () => {
  it('enforces Global Default-Deny safety net and verified email authentication', () => {
    expect(rulesSource).toContain('match /{document=**}');
    expect(rulesSource).toContain('allow read, write: if false;');
    expect(rulesSource).toContain('request.auth.token.email_verified == true');
  });

  it('covers every top-level and nested collection path declared in firebase-blueprint.json', () => {
    const requiredTopMatches = [
      'match /users/{userId}',
      'match /user_private/{userId}',
      'match /admins/{adminId}',
      'match /leads/{leadId}',
      'match /lead_contacts/{leadId}',
      'match /electricity_bills/{billId}',
      'match /bill_extractions/{extractionId}',
      'match /lead_scores/{scoreId}',
      'match /admin_rules/{ruleId}',
      'match /quotations/{quotationId}',
      'match /items/{itemId}',
      'match /projects/{projectId}',
      'match /documents/{docId}',
      'match /payments/{paymentId}',
      'match /history/{historyId}',
      'match /public_tracking/{trackingToken}',
      'match /notifications/{notificationId}',
    ];

    expect(Object.keys(blueprintJson.firestore)).toHaveLength(17);
    for (const matchHeader of requiredTopMatches) {
      expect(rulesSource).toContain(matchHeader);
    }
  });

  it('blocks PII & capability-token directory harvesting via allow list: if false', () => {
    // Extract match blocks for /users, /user_private, /admins, and /public_tracking
    const usersBlock = rulesSource.split('match /users/{userId}')[1]?.split('match /user_private')[0] || '';
    const privateBlock = rulesSource.split('match /user_private/{userId}')[1]?.split('match /admins')[0] || '';
    const adminsBlock = rulesSource.split('match /admins/{adminId}')[1]?.split('match /leads')[0] || '';
    const trackingBlock = rulesSource.split('match /public_tracking/{trackingToken}')[1]?.split('match /notifications')[0] || '';

    expect(usersBlock).toContain('allow list: if false;');
    expect(privateBlock).toContain('allow list: if false;');
    expect(adminsBlock).toContain('allow list: if false;');
    expect(trackingBlock).toContain('allow list: if false;');
    expect(trackingBlock).toContain('trackingToken.size() >= 24');
  });

  it('prevents Dirty Dozen privilege escalation, timestamp spoofing, and snapshot tampering', () => {
    // Self-role escalation guard on /users update
    expect(rulesSource).toContain('incoming().role == existing().role');
    // Strict key whitelisting across blueprints
    expect(rulesSource).toContain('.keys().hasOnly(');
    // Server timestamp anchor enforcement
    expect(rulesSource).toContain('incoming().createdAt == request.time');
    expect(rulesSource).toContain('incoming().updatedAt == request.time');
    // Immutable historical quotation rule snapshot
    expect(rulesSource).toContain('incoming().appliedRuleSnapshot == existing().appliedRuleSnapshot');
    // Atomic cross-document integrity between projects and public_tracking
    expect(rulesSource).toContain('existsAfter(/databases/$(database)/documents/public_tracking/$(incoming().trackingToken))');
    expect(rulesSource).toContain('existsAfter(/databases/$(database)/documents/projects/$(incoming().projectId))');
  });

  it('accommodates full LeadScoreRecord point ranges (including 18 consumptionPoints for >=300 kWh bills)', () => {
    expect(rulesSource).toContain('data.consumptionPoints >= 0 && data.consumptionPoints <= 25');
  });
});
