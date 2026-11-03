import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Plus, ShieldCheck } from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { t } from '../lib/i18n.ts';
import type { AdminConfigRuleDoc, RuleCategory } from '../types/domain.ts';

export function AdminRulesPage() {
  const { firebaseUser, isBootstrappedAdmin, adminRules, language } = useAuthData();
  const dict = t(language);

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
    'Sample configurable rule stored with effective dates; does not overwrite historical quotation snapshots.'
  );

  // Category-specific parameters
  const [firstTierRateInr, setFirstTierRateInr] = useState<number>(30000);
  const [secondTierRateInr, setSecondTierRateInr] = useState<number>(18000);
  const [maxSubsidyCapInr, setMaxSubsidyCapInr] = useState<number>(78000);
  const [pricePerKwInr, setPricePerKwInr] = useState<number>(52000);
  const [annualGenPerKw, setAnnualGenPerKw] = useState<number>(1400);
  const [installationPerKwInr, setInstallationPerKwInr] = useState<number>(8500);
  const [bosFlatInr, setBosFlatInr] = useState<number>(12000);
  const [tariffPerUnitInr, setTariffPerUnitInr] = useState<number>(9.2);

  const [saving, setSaving] = useState<boolean>(false);
  const [banner, setBanner] = useState<string | null>(null);

  const filteredRules = useMemo(() => {
    return adminRules.filter((r) => {
      if (categoryTab !== 'ALL' && r.ruleCategory !== categoryTab) return false;
      return true;
    });
  }, [adminRules, categoryTab]);

  const handleCategoryDefaults = (nextCat: RuleCategory) => {
    setRuleCategory(nextCat);
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
    if (!firebaseUser) return;

    setSaving(true);
    setBanner(null);

    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 60);
    const existingSameCode = adminRules.filter((r) => r.code === cleanCode);
    const nextVersion =
      existingSameCode.reduce((max, r) => Math.max(max, r.versionNumber), 0) + 1;

    let parameters: Record<string, number | string | boolean> = {};
    if (ruleCategory === 'SUBSIDY_RULE') {
      parameters = {
        firstTierMaxKw: 2,
        firstTierRateInr: Number(firstTierRateInr),
        secondTierMaxKw: 3,
        secondTierRateInr: Number(secondTierRateInr),
        maxSubsidyCapInr: Number(maxSubsidyCapInr),
        residentialOnly: true,
      };
    } else if (ruleCategory === 'SOLAR_OPTION') {
      parameters = {
        pricePerKwInr: Number(pricePerKwInr),
        annualGenPerKw: Number(annualGenPerKw),
        warrantyYears: 25,
      };
    } else if (ruleCategory === 'PRICING_RULE') {
      parameters = {
        installationPerKwInr: Number(installationPerKwInr),
        bosFlatInr: Number(bosFlatInr),
        selfConsumptionRatio: 1.0,
      };
    } else {
      parameters = {
        tariffPerUnitInr: Number(tariffPerUnitInr),
        selfConsumptionRatio: 1.0,
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
        `Published ${cleanCode} v${nextVersion} (${effectiveFrom} to ${effectiveTo}). Existing quotations remain locked to their original rule snapshot.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `admin_rules/${ruleId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRuleActive = async (rule: AdminConfigRuleDoc) => {
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

  return (
    <AppShell title={dict.navConfig} breadcrumb="Versioned Pricing, Subsidy & Tariff Rules">
      <div className="space-y-6">
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-4 flex items-start gap-3 text-xs text-emerald-950">
          <ShieldCheck className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
          <div>
            <strong>Immutable Historical Quotations Guarantee:</strong> Updating solar hardware
            packages, installation BOS rates, electricity tariffs, or sample subsidy rules creates a
            new versioned configuration record with effective start/end dates. Previously issued
            quotations retain their immutable <code>appliedRuleSnapshot</code>.
          </div>
        </div>

        {banner && (
          <div className="bg-white border border-emerald-300 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-950">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-800 shrink-0" />
              {banner}
            </span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="font-semibold text-emerald-900 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 5 Cols: Publish New Rule Version */}
          <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Plus className="w-4 h-4 text-emerald-800" />
              Publish New Configuration Rule Version
            </h2>

            <form onSubmit={(e) => void handlePublishRuleVersion(e)} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rule Category
                </label>
                <select
                  value={ruleCategory}
                  onChange={(e) => handleCategoryDefaults(e.target.value as RuleCategory)}
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                >
                  <option value="SUBSIDY_RULE">Subsidy Rule (Sample Slab & Cap)</option>
                  <option value="SOLAR_OPTION">Solar Panel & Inverter Option</option>
                  <option value="PRICING_RULE">EPC Installation & BOS Pricing</option>
                  <option value="ELECTRICITY_TARIFF">DISCOM Electricity Tariff</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rule Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rule Code (Auto-Increments Version Number)
                  </label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Effective From
                  </label>
                  <input
                    type="date"
                    required
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Effective To
                  </label>
                  <input
                    type="date"
                    required
                    value={effectiveTo}
                    onChange={(e) => setEffectiveTo(e.target.value)}
                    className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              {/* Dynamic Parameter Inputs */}
              {ruleCategory === 'SUBSIDY_RULE' && (
                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      First 2 kW (₹/kW)
                    </label>
                    <input
                      type="number"
                      value={firstTierRateInr}
                      onChange={(e) => setFirstTierRateInr(Number(e.target.value))}
                      className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      3rd kW Add-on (₹)
                    </label>
                    <input
                      type="number"
                      value={secondTierRateInr}
                      onChange={(e) => setSecondTierRateInr(Number(e.target.value))}
                      className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Max Cap (₹)
                    </label>
                    <input
                      type="number"
                      value={maxSubsidyCapInr}
                      onChange={(e) => setMaxSubsidyCapInr(Number(e.target.value))}
                      className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2"
                    />
                  </div>
                </div>
              )}

              {ruleCategory === 'SOLAR_OPTION' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Equipment Rate (₹ / kW)
                    </label>
                    <input
                      type="number"
                      value={pricePerKwInr}
                      onChange={(e) => setPricePerKwInr(Number(e.target.value))}
                      className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Annual Generation (Units / kW)
                    </label>
                    <input
                      type="number"
                      value={annualGenPerKw}
                      onChange={(e) => setAnnualGenPerKw(Number(e.target.value))}
                      className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
              )}

              {ruleCategory === 'PRICING_RULE' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Installation Charge (₹ / kW)
                    </label>
                    <input
                      type="number"
                      value={installationPerKwInr}
                      onChange={(e) => setInstallationPerKwInr(Number(e.target.value))}
                      className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      BOS & Net Meter Flat (₹)
                    </label>
                    <input
                      type="number"
                      value={bosFlatInr}
                      onChange={(e) => setBosFlatInr(Number(e.target.value))}
                      className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
              )}

              {ruleCategory === 'ELECTRICITY_TARIFF' && (
                <div className="pt-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Applicable Electricity Tariff (₹ / unit)
                  </label>
                  <input
                    type="number"
                    step={0.1}
                    value={tariffPerUnitInr}
                    onChange={(e) => setTariffPerUnitInr(Number(e.target.value))}
                    className="w-full text-xs font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Regulatory / Audit Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Publishing Rule Version...' : 'Publish New Rule Version'}
              </button>
            </form>
          </section>

          {/* Right 7 Cols: Versioned Rules Ledger */}
          <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: 'ALL', label: 'All Rules' },
                    { key: 'SUBSIDY_RULE', label: 'Subsidy' },
                    { key: 'SOLAR_OPTION', label: 'Panels' },
                    { key: 'PRICING_RULE', label: 'Pricing' },
                    { key: 'ELECTRICITY_TARIFF', label: 'Tariffs' },
                  ] as const
                ).map((tItem) => (
                  <button
                    key={tItem.key}
                    type="button"
                    onClick={() => setCategoryTab(tItem.key)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      categoryTab === tItem.key
                        ? 'bg-emerald-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {tItem.label}
                  </button>
                ))}
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {filteredRules.length} versions
              </span>
            </div>

            <div className="divide-y divide-slate-200">
              {filteredRules.map((rule) => (
                <div key={rule.id} className="p-4 sm:p-5 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono text-slate-500">
                        {rule.ruleCategory} · <strong>{rule.code}</strong> · v{rule.versionNumber}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-0.5">{rule.title}</h3>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-semibold ${
                          rule.isActive ? 'text-emerald-800' : 'text-slate-400'
                        }`}
                      >
                        {rule.isActive ? 'Active' : 'Archived'}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleToggleRuleActive(rule)}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
                      >
                        {rule.isActive ? 'Archive' : 'Reactivate'}
                      </button>
                    </div>
                  </div>

                  <div className="text-xs font-mono tabular-nums text-slate-600">
                    Effective Window: {rule.effectiveFrom} → {rule.effectiveTo}
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-mono tabular-nums text-slate-800 flex flex-wrap gap-x-4 gap-y-1">
                    {Object.entries(rule.parameters).map(([k, v]) => (
                      <span key={k}>
                        <span className="text-slate-500">{k}:</span> <strong>{String(v)}</strong>
                      </span>
                    ))}
                  </div>

                  {rule.notes && <p className="text-xs text-slate-500">{rule.notes}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
