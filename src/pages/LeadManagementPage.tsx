import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  Calculator,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSearch,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { t } from '../lib/i18n.ts';
import { maskConsumerNumber, maskMobileNumber } from '../shared/solarEngine.ts';
import type {
  OwnershipType,
  QualificationCategory,
  SolarLeadDoc,
  SurveyStatus,
} from '../types/domain.ts';

const SURVEY_STATUS_OPTIONS: Array<{ value: SurveyStatus; label: string }> = [
  { value: 'PENDING_REVIEW', label: 'Pending Review' },
  { value: 'CALL_SCHEDULED', label: 'Qualification Call Scheduled' },
  { value: 'SURVEY_SCHEDULED', label: 'Site Survey Scheduled' },
  { value: 'SURVEY_COMPLETED', label: 'Site Survey Completed' },
  { value: 'HOLD_TENANT_CONSENT', label: 'Hold: Landlord NOC Call' },
];

export function LeadManagementPage() {
  const {
    leads,
    leadContacts,
    extractions,
    scores,
    dataLoading,
    isBootstrappedAdmin,
    language,
    logSimulatedNotification,
  } = useAuthData();
  const dict = t(language);

  const [searchQuery, setSearchQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'ALL' | QualificationCategory>('ALL');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [ownershipFilter, setOwnershipFilter] = useState<'ALL' | OwnershipType>('ALL');
  const [surveyFilter, setSurveyFilter] = useState<'ALL' | SurveyStatus>('ALL');
  const [revealPii, setRevealPii] = useState<boolean>(false);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const cities = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.city) set.add(l.city);
    });
    return Array.from(set).sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((lead) => {
      if (scoreFilter !== 'ALL' && lead.qualificationCategory !== scoreFilter) return false;
      if (cityFilter !== 'ALL' && lead.city !== cityFilter) return false;
      if (ownershipFilter !== 'ALL' && lead.ownershipType !== ownershipFilter) return false;
      if (surveyFilter !== 'ALL' && lead.surveyStatus !== surveyFilter) return false;

      if (q) {
        const contact = leadContacts[lead.id];
        const haystack = [
          lead.leadNumber,
          lead.customerName,
          lead.city,
          lead.pincode,
          contact?.mobileNumber || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [leads, leadContacts, searchQuery, scoreFilter, cityFilter, ownershipFilter, surveyFilter]);

  const handleSurveyStatusChange = async (lead: SolarLeadDoc, nextStatus: SurveyStatus) => {
    if (lead.surveyStatus === nextStatus) return;
    if (lead.leadStage === 'CONVERTED' && !isBootstrappedAdmin) {
      return;
    }

    setUpdatingLeadId(lead.id);
    setBannerMessage(null);

    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        surveyStatus: nextStatus,
        updatedAt: serverTimestamp(),
      });

      const contact = leadContacts[lead.id];
      const maskedPhone = contact?.mobileNumber
        ? `+91-XXXXXX${contact.mobileNumber.slice(-4)}`
        : '+91-XXXXXX0000';
      const label =
        SURVEY_STATUS_OPTIONS.find((s) => s.value === nextStatus)?.label || nextStatus;

      await logSimulatedNotification({
        recipientUid: lead.ownerUid,
        assignedStaffUids: lead.assignedStaffUids,
        channel: 'WHATSAPP_SIMULATION',
        eventType: 'LEAD_SCORED',
        referenceCode: lead.leadNumber,
        maskedRecipientPhone: maskedPhone,
        title: `Survey Status Updated (${lead.leadNumber})`,
        message: `[Simulated WhatsApp] Dear ${lead.customerName}, your solar enquiry ${lead.leadNumber} survey status is now "${label}".`,
      });

      setBannerMessage(`Updated ${lead.leadNumber} (${lead.customerName}) to "${label}".`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `leads/${lead.id}`);
    } finally {
      setUpdatingLeadId(null);
    }
  };

  const renderScoreText = (cat: QualificationCategory, scoreVal: number) => {
    const color =
      cat === 'HIGH'
        ? 'text-emerald-900 dark:text-emerald-400 font-semibold'
        : cat === 'MEDIUM'
          ? 'text-sky-800 dark:text-sky-300 font-semibold'
          : 'text-slate-600 dark:text-slate-400 font-medium';
    return (
      <span className={color}>
        <span className="font-mono tabular-nums">{scoreVal}/100</span> · {cat}
      </span>
    );
  };

  return (
    <AppShell title={dict.navLeads} breadcrumb="Sales CRM & Site Survey Queue">
      <div className="space-y-5">
        {/* Search, PII Protection Toggle & Multi-Facet Filter Toolbar */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Lead ID (e.g. LD-30881), customer name, pincode, city, or mobile..."
                className="w-full pl-9 pr-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-emerald-700 dark:focus:border-emerald-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setRevealPii((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {revealPii ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {revealPii ? dict.maskPii : dict.showFullPii}
              </button>

              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {filteredLeads.length}
                </span>
                <span>of {leads.length} leads</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Qualification Score
              </label>
              <select
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value as 'ALL' | QualificationCategory)}
                className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
              >
                <option value="ALL">All Categories (High / Medium / Low)</option>
                <option value="HIGH">High Score Only</option>
                <option value="MEDIUM">Medium Score Only</option>
                <option value="LOW">Low Score (Phone Call Qualification)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Location / Feeder City
              </label>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
              >
                <option value="ALL">All Vidarbha Locations</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Property Ownership
              </label>
              <select
                value={ownershipFilter}
                onChange={(e) => setOwnershipFilter(e.target.value as 'ALL' | OwnershipType)}
                className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
              >
                <option value="ALL">Owners & Tenants</option>
                <option value="OWNER">Homeowner / Property Owner</option>
                <option value="TENANT">Tenant (Phone Call Rule)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Site Survey Status
              </label>
              <select
                value={surveyFilter}
                onChange={(e) => setSurveyFilter(e.target.value as 'ALL' | SurveyStatus)}
                className="w-full text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
              >
                <option value="ALL">All Survey Statuses</option>
                {SURVEY_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {bannerMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-950 dark:text-emerald-200">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
              {bannerMessage}
            </span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="text-emerald-900 dark:text-emerald-300 font-semibold hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Lead Management Data Table */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          {dataLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="h-12 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No solar leads match your current filter selection.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reset active filters or submit a new homeowner electricity bill enquiry.
              </p>
              <Link
                to="/enquiry/new"
                className="inline-block px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600"
              >
                {dict.navEnquiry}
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <th className="py-3.5 px-4">Lead ID & Customer</th>
                    <th className="py-3.5 px-4">Location & Roof</th>
                    <th className="py-3.5 px-4">Bill & Consumer No.</th>
                    <th className="py-3.5 px-4">Qualification & Sizing</th>
                    <th className="py-3.5 px-4">Site Survey Status</th>
                    <th className="py-3.5 px-4 text-right">Workflow Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm align-top">
                  {filteredLeads.map((lead) => {
                    const contact = leadContacts[lead.id];
                    const extraction = extractions[lead.id];
                    const scoreDoc = scores[lead.id];
                    const isConverted = lead.leadStage === 'CONVERTED' && !isBootstrappedAdmin;

                    return (
                      <tr
                        key={lead.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono tabular-nums text-xs font-bold text-emerald-950 dark:text-emerald-300">
                              {lead.leadNumber}
                            </span>
                            <span
                              className="text-slate-300 dark:text-slate-700"
                              aria-hidden="true"
                            >
                              ·
                            </span>
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                              {lead.ownershipType === 'OWNER' ? 'Owner' : 'Tenant'}
                            </span>
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                            {lead.customerName}
                          </div>
                          <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {contact?.mobileNumber
                              ? revealPii
                                ? `+91 ${contact.mobileNumber}`
                                : maskMobileNumber(contact.mobileNumber)
                              : 'DPDP Protected'}
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {lead.city}{' '}
                            <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                              ({lead.pincode})
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {lead.roofType.replace('_', ' ')} ·{' '}
                            <span className="font-mono tabular-nums">
                              {lead.rooftopAreaSqFt.toLocaleString('en-IN')} sq ft
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            Stage:{' '}
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {lead.leadStage}
                            </span>
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                            ₹{lead.avgMonthlyBillInr.toLocaleString('en-IN')}/mo
                          </div>
                          <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {lead.averageUnitsKwh} units · {lead.sanctionedLoadKw} kW load
                          </div>
                          {extraction?.consumerNumber && (
                            <div className="mt-0.5 text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              CN:{' '}
                              {revealPii
                                ? extraction.consumerNumber
                                : maskConsumerNumber(extraction.consumerNumber)}
                            </div>
                          )}
                          <div className="mt-0.5 text-xs">
                            {extraction ? (
                              <span
                                className={
                                  extraction.verificationStatus === 'STAFF_VERIFIED' ||
                                  extraction.verificationStatus === 'USER_CONFIRMED'
                                    ? 'text-emerald-800 dark:text-emerald-400 font-medium'
                                    : extraction.clarityStatus === 'UNCLEAR_REUPLOAD'
                                      ? 'text-red-700 dark:text-red-400 font-medium'
                                      : 'text-amber-700 dark:text-amber-400 font-medium'
                                }
                              >
                                {extraction.verificationStatus.replace(/_/g, ' ')} (
                                <span className="font-mono tabular-nums">
                                  {extraction.confidenceScore}%
                                </span>
                                )
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">
                                Pending AI Scan
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-4 px-4">
                          <div className="text-sm">
                            {renderScoreText(lead.qualificationCategory, lead.leadScore)}
                          </div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Recommended:{' '}
                            <span className="font-mono tabular-nums">
                              {lead.recommendationLabel}
                            </span>
                          </div>
                          {lead.qualificationCategory === 'LOW' && (
                            <div className="mt-0.5 text-[11px] text-sky-800 dark:text-sky-300">
                              Phone qualification call assigned
                            </div>
                          )}
                          {scoreDoc?.isOverridden && (
                            <div className="mt-0.5 text-xs text-amber-800 dark:text-amber-400">
                              Staff Override Applied
                            </div>
                          )}
                        </td>

                        <td className="py-4 px-4">
                          <select
                            aria-label={`Survey status for ${lead.leadNumber}`}
                            disabled={updatingLeadId === lead.id || isConverted}
                            value={lead.surveyStatus}
                            onChange={(e) =>
                              void handleSurveyStatusChange(lead, e.target.value as SurveyStatus)
                            }
                            className="w-full min-w-[185px] text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500 disabled:opacity-60"
                          >
                            {SURVEY_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-4 px-4 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <Link
                              to={`/leads/${lead.id}/analysis`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors whitespace-nowrap shrink-0"
                            >
                              <FileSearch className="w-3.5 h-3.5" />
                              Verify Bill & Score
                            </Link>
                            <Link
                              to={`/quotations/builder?leadId=${encodeURIComponent(lead.id)}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors whitespace-nowrap shrink-0"
                            >
                              <Calculator className="w-3.5 h-3.5" />
                              Quote
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
