import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  History,
  Lock,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { t } from '../lib/i18n.ts';
import type { AdminConfigRuleDoc, RuleCategory } from '../types/domain.ts';

function formatFirestoreTimestamp(value: unknown): string {
  if (!value) return 'Just now';
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      const dt = (value as { toDate: () => Date }).toDate();
      return dt.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recorded';
    }
  }
  if (typeof value === 'string') return value;
  return 'Recorded';
}

export function AdminRulesPage() {
  const { firebaseUser, profile, isBootstrappedAdmin, adminRules, dataLoading, language } =
    useAuthData();
  const dict = t(language);

  // Restrict administrative functionality strictly to authorized Administrators
  const isAuthorizedAdmin = isBootstrappedAdmin || profile?.role === 'ADMIN';

  const [categoryTab, setCategoryTab] = useState<'ALL' | RuleCategory>('ALL');

  // New Rule Version Form
  const [ruleCategory, setRuleCategory] = useState<RuleCategory>('SUBSIDY_RULE');
  const [title, setTitle] = useState<string>(
    'Residential Rooftop Sample Subsidy Slab (Updated)'
  );
  const [code, setCode] = useState<string>('RES_SAMPLE_SLAB');
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [effectiveTo, setEffectiveTo] = useState<string>('2027-12-31');
  const [notes, setNotes] = useState<string>(
    'Configurable rule stored with effective dates; preserves historical quotation snapshots.'
  );

  // Category-specific parameters (editable pricing, generation & subsidy eligibility)
  const [firstTierMaxKw, setFirstTierMaxKw] = useState<number>(2);
  const [firstTierRateInr, setFirstTierRateInr] = useState<number>(30000);
  const [secondTierMaxKw, setSecondTierMaxKw] = useState<number>(3);
  const [secondTierRateInr, setSecondTierRateInr] = useState<number>(18000);
  const [maxSubsidyCapInr, setMaxSubsidyCapInr] = useState<number>(78000);
  const [residentialOnly, setResidentialOnly] = useState<boolean>(true);

  const [pricePerKwInr, setPricePerKwInr] = useState<number>(52000);
  const [annualGenPerKw, setAnnualGenPerKw] = useState<number>(1400);
  const [warrantyYears, setWarrantyYears] = useState<number>(25);

  const [installationPerKwInr, setInstallationPerKwInr] = useState<number>(8500);
  const [bosFlatInr, setBosFlatInr] = useState<number>(12000);
  const [selfConsumptionRatio, setSelfConsumptionRatio] = useState<number>(1.0);
  const [tariffPerUnitInr, setTariffPerUnitInr] = useState<number>(9.2);

  // Inline Effective End-Date Editor for existing versioned rules
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editEffectiveTo, setEditEffectiveTo] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  const [saving, setSaving] = useState<boolean>(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredRules = useMemo(() => {
    return adminRules.filter((r) => {
      if (categoryTab !== 'ALL' && r.ruleCategory !== categoryTab) return false;
      return true;
    });
  }, [adminRules, categoryTab]);

  const sortedAuditRules = useMemo(() => {
    return [...adminRules].sort((a, b) => {
      if (a.code !== b.code) return a.code.localeCompare(b.code);
      return b.versionNumber - a.versionNumber;
    });
  }, [adminRules]);

  const handleCategoryDefaults = (nextCat: RuleCategory) => {
    setRuleCategory(nextCat);
    setErrorMsg(null);
    if (nextCat === 'SUBSIDY_RULE') {
      setTitle('Residential Rooftop Sample Subsidy Slab');
      setCode('RES_SAMPLE_SLAB');
    } else if (nextCat === 'SOLAR_OPTION') {
      setTitle('550Wp TOPCon Bifacial + MPPT String Inverter');
      setCode('PANEL_TOPCON_550');
    } else if (nextCat === 'PRICING_RULE') {
      setTitle('Vidarbha Standard EPC Turnkey Installation & BOS');
      setCode('EPC_VIDARBHA_STD');
    } else {
      setTitle('MSEDCL LT-I Residential Blended Tariff');
      setCode('MSEDCL_LT1_RES');
    }
  };

  const handlePublishRuleVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !isAuthorizedAdmin) {
      setErrorMsg('Administrator privileges are required to publish configuration rules.');
      return;
    }

    if (!effectiveFrom || !effectiveTo || effectiveFrom > effectiveTo) {
      setErrorMsg('Effective From date must be on or before Effective To date.');
      return;
    }

    if (
      (ruleCategory === 'SOLAR_OPTION' || ruleCategory === 'PRICING_RULE') &&
      (!Number.isFinite(annualGenPerKw) || annualGenPerKw < 800 || annualGenPerKw > 2200)
    ) {
      setErrorMsg('Annual generation benchmark must be between 800 and 2,200 units per kW.');
      return;
    }

    setSaving(true);
    setBanner(null);
    setErrorMsg(null);

    const cleanCode = code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 60);

    if (cleanCode.length < 2) {
      setErrorMsg('Rule code must contain at least 2 alphanumeric characters.');
      setSaving(false);
      return;
    }

    const existingSameCode = adminRules.filter((r) => r.code === cleanCode);
    const nextVersion =
      existingSameCode.reduce((max, r) => Math.max(max, r.versionNumber), 0) + 1;

    let parameters: Record<string, number | string | boolean> = {};
    if (ruleCategory === 'SUBSIDY_RULE') {
      parameters = {
        firstTierMaxKw: Math.max(1, Number(firstTierMaxKw)),
        firstTierRateInr: Math.max(0, Number(firstTierRateInr)),
        secondTierMaxKw: Math.max(Number(firstTierMaxKw), Number(secondTierMaxKw)),
        secondTierRateInr: Math.max(0, Number(secondTierRateInr)),
        maxSubsidyCapInr: Math.max(0, Number(maxSubsidyCapInr)),
        residentialOnly: Boolean(residentialOnly),
      };
    } else if (ruleCategory === 'SOLAR_OPTION') {
      parameters = {
        pricePerKwInr: Math.max(1000, Number(pricePerKwInr)),
        annualGenPerKw: Math.round(Number(annualGenPerKw)),
        warrantyYears: Math.max(1, Number(warrantyYears)),
      };
    } else if (ruleCategory === 'PRICING_RULE') {
      parameters = {
        installationPerKwInr: Math.max(0, Number(installationPerKwInr)),
        bosFlatInr: Math.max(0, Number(bosFlatInr)),
        annualGenPerKw: Math.round(Number(annualGenPerKw)),
        selfConsumptionRatio: Math.min(1, Math.max(0.1, Number(selfConsumptionRatio))),
      };
    } else {
      parameters = {
        tariffPerUnitInr: Math.max(0.5, Number(tariffPerUnitInr)),
        selfConsumptionRatio: Math.min(1, Math.max(0.1, Number(selfConsumptionRatio))),
      };
    }

    const ruleId = `rule_${cleanCode.toLowerCase()}_v${nextVersion}_${Date.now()}`;
    const workspaceScope = isBootstrappedAdmin ? 'global' : firebaseUser.uid;

    try {
      await setDoc(doc(db, 'admin_rules', ruleId), {
        ruleCategory,
        workspaceScope,
        title: title.trim().slice(0, 120),
        code: cleanCode,
        versionNumber: nextVersion,
        effectiveFrom,
        effectiveTo,
        isActive: true,
        parameters,
        notes: notes.trim().slice(0, 500),
        createdByUid: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setBanner(
        `Published ${cleanCode} v${nextVersion} (${effectiveFrom} → ${effectiveTo}). Previously issued quotations remain locked to their original rule snapshot.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `admin_rules/${ruleId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRuleActive = async (rule: AdminConfigRuleDoc) => {
    if (!isAuthorizedAdmin) return;
    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'admin_rules', rule.id), {
        isActive: !rule.isActive,
        updatedAt: serverTimestamp(),
      });
      setBanner(
        `Rule ${rule.code} v${rule.versionNumber} is now ${!rule.isActive ? 'Active' : 'Archived'}.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `admin_rules/${rule.id}`);
    }
  };

  const handleStartEditRuleWindow = (rule: AdminConfigRuleDoc) => {
    if (!isAuthorizedAdmin) return;
    setEditingRuleId(rule.id);
    setEditEffectiveTo(rule.effectiveTo);
    setEditNotes(rule.notes || '');
    setErrorMsg(null);
  };

  const handleSaveRuleWindow = async (rule: AdminConfigRuleDoc) => {
    if (!isAuthorizedAdmin) return;
    if (!editEffectiveTo || rule.effectiveFrom > editEffectiveTo) {
      setErrorMsg(
        `Effective end date for ${rule.code} v${rule.versionNumber} cannot precede ${rule.effectiveFrom}.`
      );
      return;
    }

    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'admin_rules', rule.id), {
        effectiveTo: editEffectiveTo,
        notes: editNotes.trim().slice(0, 500),
        updatedAt: serverTimestamp(),
      });
      setEditingRuleId(null);
      setBanner(
        `Updated effective window & audit note for ${rule.code} v${rule.versionNumber} (${rule.effectiveFrom} → ${editEffectiveTo}).`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `admin_rules/${rule.id}`);
    }
  };

  return (
    <AppShell
      title={dict.navConfig}
      breadcrumb="Admin Governance · Solar Pricing, Subsidy Slabs & Audit Ledger"
    >
      <div className="space-y-6">
        {/* Snapshot Immutability Guarantee Banner */}
        <div className="bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-start gap-3 text-xs text-emerald-950 dark:text-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <strong>Immutable Historical Quotations Guarantee:</strong> Updating solar hardware
            packages, annual generation benchmarks (default 1,400 units/kW), EPC BOS rates,
            electricity tariffs, or subsidy caps creates a versioned rule with effective dates.
            Previously issued quotations retain their locked <code>appliedRuleSnapshot</code>.
          </div>
        </div>

        {/* RBAC Restriction Banner for Non-Admin Staff */}
        {!isAuthorizedAdmin && (
          <div className="bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-xl p-4 flex items-start gap-3 text-xs text-sky-950 dark:text-sky-200">
            <Lock className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0 mt-0.5" />
            <div>
              <strong>{dict.adminReadOnlyNotice}</strong> Signed in as{' '}
              <span className="font-mono">{profile?.role || 'SALES_STAFF'}</span>. You may inspect
              active solar pricing, subsidy slabs, effective windows, and version audit history
              below.
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-red-900 dark:text-red-200">
            <span className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
              {errorMsg}
            </span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="font-semibold text-red-800 dark:text-red-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {banner && (
          <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-950 dark:text-emerald-200">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
              {banner}
            </span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="font-semibold text-emerald-900 dark:text-emerald-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 Cols: Publish New Rule Version (Authorized Admins) */}
          {isAuthorizedAdmin && (
            <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-emerald-800 dark:text-emerald-400" />
                Publish New Configuration Rule Version
              </h2>

              <form onSubmit={(e) => void handlePublishRuleVersion(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rule Category
                  </label>
                  <select
                    value={ruleCategory}
                    onChange={(e) => handleCategoryDefaults(e.target.value as RuleCategory)}
                    className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
                  >
                    <option value="SUBSIDY_RULE">Subsidy Rule (Slabs, Cap & Eligibility)</option>
                    <option value="SOLAR_OPTION">Solar Panel, Inverter & Generation Benchmark</option>
                    <option value="PRICING_RULE">EPC Turnkey Installation & BOS Pricing</option>
                    <option value="ELECTRICITY_TARIFF">DISCOM Electricity Tariff</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Rule Title
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Rule Code (Auto-Increments Version Number)
                    </label>
                    <input
                      type="text"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Effective From
                    </label>
                    <input
                      type="date"
                      required
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Effective To
                    </label>
                    <input
                      type="date"
                      required
                      value={effectiveTo}
                      onChange={(e) => setEffectiveTo(e.target.value)}
                      className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Dynamic Parameter Inputs */}
                {ruleCategory === 'SUBSIDY_RULE' && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Tier 1 Up To (kW)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={firstTierMaxKw}
                          onChange={(e) => setFirstTierMaxKw(Number(e.target.value))}
                          className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Tier 1 Rate (₹/kW)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={firstTierRateInr}
                          onChange={(e) => setFirstTierRateInr(Number(e.target.value))}
                          className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Tier 2 Up To (kW)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={secondTierMaxKw}
                          onChange={(e) => setSecondTierMaxKw(Number(e.target.value))}
                          className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Tier 2 Rate (₹/kW)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={secondTierRateInr}
                          onChange={(e) => setSecondTierRateInr(Number(e.target.value))}
                          className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Maximum Subsidy Cap (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={maxSubsidyCapInr}
                          onChange={(e) => setMaxSubsidyCapInr(Number(e.target.value))}
                          className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Tariff & Ownership Eligibility Rule
                      </label>
                      <select
                        value={residentialOnly ? 'RESIDENTIAL_ONLY' : 'ALL_OWNERS'}
                        onChange={(e) => setResidentialOnly(e.target.value === 'RESIDENTIAL_ONLY')}
                        className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      >
                        <option value="RESIDENTIAL_ONLY">
                          Residential LT-I Property Owners Only (Tenants & Commercial Excluded)
                        </option>
                        <option value="ALL_OWNERS">
                          All Verified Property Owners (Residential & Eligible Institutional)
                        </option>
                      </select>
                    </div>
                  </div>
                )}

                {ruleCategory === 'SOLAR_OPTION' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Equipment (₹/kW)
                      </label>
                      <input
                        type="number"
                        min={1000}
                        value={pricePerKwInr}
                        onChange={(e) => setPricePerKwInr(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Units / kW / Yr
                      </label>
                      <input
                        type="number"
                        min={800}
                        max={2200}
                        value={annualGenPerKw}
                        onChange={(e) => setAnnualGenPerKw(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Warranty (Yrs)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={30}
                        value={warrantyYears}
                        onChange={(e) => setWarrantyYears(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                {ruleCategory === 'PRICING_RULE' && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Installation Charge (₹ / kW)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={installationPerKwInr}
                        onChange={(e) => setInstallationPerKwInr(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        BOS & Net Meter Flat (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={bosFlatInr}
                        onChange={(e) => setBosFlatInr(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Default Generation (Units/kW/Yr)
                      </label>
                      <input
                        type="number"
                        min={800}
                        max={2200}
                        value={annualGenPerKw}
                        onChange={(e) => setAnnualGenPerKw(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Net-Meter Self-Use Ratio (0.1–1.0)
                      </label>
                      <input
                        type="number"
                        step={0.05}
                        min={0.1}
                        max={1.0}
                        value={selfConsumptionRatio}
                        onChange={(e) => setSelfConsumptionRatio(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                {ruleCategory === 'ELECTRICITY_TARIFF' && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Applicable Tariff (₹ / unit)
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        min={0.5}
                        value={tariffPerUnitInr}
                        onChange={(e) => setTariffPerUnitInr(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Self-Consumption Ratio
                      </label>
                      <input
                        type="number"
                        step={0.05}
                        min={0.1}
                        max={1.0}
                        value={selfConsumptionRatio}
                        onChange={(e) => setSelfConsumptionRatio(Number(e.target.value))}
                        className="w-full text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Regulatory / Audit Notes
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {saving ? 'Publishing Rule Version...' : 'Publish New Rule Version'}
                </button>
              </form>
            </section>
          )}

          {/* Right Cols: Active & Archived Pricing / Subsidy Tables */}
          <section
            className={`${
              isAuthorizedAdmin ? 'lg:col-span-7' : 'lg:col-span-12'
            } bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                {(
                  [
                    { key: 'ALL', label: 'All Rules' },
                    { key: 'SUBSIDY_RULE', label: 'Subsidy Slabs' },
                    { key: 'SOLAR_OPTION', label: 'Solar Hardware' },
                    { key: 'PRICING_RULE', label: 'EPC Pricing' },
                    { key: 'ELECTRICITY_TARIFF', label: 'Tariffs' },
                  ] as const
                ).map((tItem) => (
                  <button
                    key={tItem.key}
                    type="button"
                    onClick={() => setCategoryTab(tItem.key)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      categoryTab === tItem.key
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tItem.label}
                  </button>
                ))}
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {filteredRules.length} versions
              </span>
            </div>

            {dataLoading ? (
              <div className="p-5 space-y-4">
                {[1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="h-24 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-lg"
                  />
                ))}
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No configuration rules match the selected category filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRules.map((rule) => {
                  const isEditingThis = editingRuleId === rule.id;
                  return (
                    <div key={rule.id} className="p-4 sm:p-5 space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {rule.ruleCategory} ·{' '}
                            <strong className="text-slate-700 dark:text-slate-200">
                              {rule.code}
                            </strong>{' '}
                            · v{rule.versionNumber}
                            <span aria-hidden="true"> · </span>
                            <span>
                              {rule.workspaceScope === 'global'
                                ? 'Global Default'
                                : 'Workspace Rule'}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            {rule.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span
                            className={`text-xs font-semibold ${
                              rule.isActive
                                ? 'text-emerald-800 dark:text-emerald-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {rule.isActive ? 'Active' : 'Archived'}
                          </span>
                          {isAuthorizedAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  isEditingThis
                                    ? setEditingRuleId(null)
                                    : handleStartEditRuleWindow(rule)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-md hover:bg-sky-100 dark:hover:bg-sky-900/60 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                                {isEditingThis ? 'Cancel' : 'Edit End Date'}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleRuleActive(rule)}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {rule.isActive ? 'Archive' : 'Reactivate'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        Effective Window: {rule.effectiveFrom} → {rule.effectiveTo}
                      </div>

                      {isEditingThis && isAuthorizedAdmin && (
                        <div className="bg-sky-50/60 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 rounded-lg p-3 space-y-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Effective To Date (Min {rule.effectiveFrom})
                              </label>
                              <input
                                type="date"
                                min={rule.effectiveFrom}
                                value={editEffectiveTo}
                                onChange={(e) => setEditEffectiveTo(e.target.value)}
                                className="w-full text-xs font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-md px-2.5 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                Updated Audit Note
                              </label>
                              <input
                                type="text"
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                className="w-full text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-md px-2.5 py-1.5"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void handleSaveRuleWindow(rule)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-md hover:bg-emerald-950 dark:hover:bg-emerald-600 whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Save Effective Window
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200 flex flex-wrap gap-x-4 gap-y-1">
                        {Object.entries(rule.parameters).map(([k, v]) => (
                          <span key={k}>
                            <span className="text-slate-500 dark:text-slate-400">{k}:</span>{' '}
                            <strong>{String(v)}</strong>
                          </span>
                        ))}
                      </div>

                      {rule.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{rule.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Configuration Version & Audit History Ledger */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-sky-700 dark:text-sky-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {dict.auditHistoryTitle}
              </h2>
              <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {sortedAuditRules.length} versioned records
              </span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Append-only version lineage · Non-destructive effective-date governance
            </span>
          </div>

          {sortedAuditRules.length === 0 ? (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
              No configuration rule versions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <th className="py-3 px-5">Rule Code & Version</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Effective Dates</th>
                    <th className="py-3 px-4">State & Scope</th>
                    <th className="py-3 px-4">Recorded By & Timestamp</th>
                    <th className="py-3 px-5">Audit Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {sortedAuditRules.map((rule) => (
                    <tr
                      key={`audit_${rule.id}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-5 whitespace-nowrap">
                        <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {rule.code} · v{rule.versionNumber}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                          {rule.title}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {rule.ruleCategory}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {rule.effectiveFrom} → {rule.effectiveTo}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            rule.isActive
                              ? 'text-emerald-800 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {rule.isActive ? 'Active' : 'Archived'}
                        </span>
                        <span className="text-slate-300 dark:text-slate-600" aria-hidden="true">
                          {' '}
                          ·{' '}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {rule.workspaceScope === 'global' ? 'Global' : 'Workspace'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-700 dark:text-slate-300">
                          UID: {rule.createdByUid.slice(0, 10)}…
                        </div>
                        <div className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {formatFirestoreTimestamp(rule.updatedAt || rule.createdAt)}
                        </div>
                      </td>
                      <td className="py-3 px-5 text-slate-600 dark:text-slate-300 max-w-xs">
                        {rule.notes || 'Standard configuration release'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
