import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  Sun,
  XCircle,
} from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { t } from '../lib/i18n.ts';
import { downloadQuotationPdf } from '../lib/pdfGenerator.ts';
import { PROJECT_STAGES } from '../types/domain.ts';

export function HomeownerPortalPage() {
  const {
    leads,
    extractions,
    quotations,
    projects,
    dataLoading,
    language,
    logSimulatedNotification,
  } = useAuthData();
  const dict = t(language);
  const [banner, setBanner] = useState<string | null>(null);

  const handleQuotationDecision = async (
    quoteId: string,
    quoteNum: string,
    ownerUid: string,
    staffUids: string[],
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    try {
      await updateDoc(doc(db, 'quotations', quoteId), {
        status: decision,
        updatedAt: serverTimestamp(),
      });
      if (decision === 'APPROVED') {
        await logSimulatedNotification({
          recipientUid: ownerUid,
          assignedStaffUids: staffUids,
          channel: 'WHATSAPP_SIMULATION',
          eventType: 'QUOTATION_APPROVED',
          referenceCode: quoteNum,
          maskedRecipientPhone: '+91-98230-***00',
          title: `Simulated WhatsApp: Quotation ${quoteNum} Approved`,
          message: `[SIMULATION] Customer approved solar proposal ${quoteNum}. Ready for project conversion & advance payment booking.`,
        });
      }
      setBanner(
        decision === 'APPROVED'
          ? `Quotation ${quoteNum} approved! Our Nagpur EPC desk will initiate your project shortly.`
          : `Revision requested on ${quoteNum}. Our sales engineer will contact you with updated options.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quotations/${quoteId}`);
    }
  };

  return (
    <AppShell title={dict.navMySolar}>
      <div className="space-y-8">
        {/* Welcome Banner */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {dict.heroHeading}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{dict.heroSubheading}</p>
          </div>
          <Link
            to="/enquiry/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {dict.ctaNewEnquiry}
          </Link>
        </div>

        {banner && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs text-emerald-950 dark:text-emerald-200">
            <span className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
              {banner}
            </span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="font-semibold text-emerald-900 dark:text-emerald-300 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active Projects Section */}
        {projects.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {dict.projectLifecycleTitle}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((prj) => {
                const stageDef = PROJECT_STAGES.find((s) => s.code === prj.currentStage);
                return (
                  <div
                    key={prj.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                          {prj.projectNumber}
                        </span>
                        <span>
                          Stage <span className="font-mono tabular-nums">{prj.stageIndex}/10</span>
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {prj.customerName} ·{' '}
                        <span className="font-mono tabular-nums">{prj.systemCapacityKw} kW</span>{' '}
                        Rooftop Plant
                      </h3>
                      <p className="text-xs text-emerald-900 dark:text-emerald-400 font-medium mt-1">
                        Current Milestone: {stageDef?.label || prj.currentStage}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {prj.pendingActivities}
                      </p>

                      <div className="mt-4 w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-800 dark:bg-emerald-500 transition-all"
                          style={{ width: `${Math.min(100, prj.stageIndex * 10)}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {prj.city} · Net Cost{' '}
                        <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                          ₹{prj.netCustomerCostInr.toLocaleString('en-IN')}
                        </span>
                      </span>
                      <Link
                        to={`/track/${prj.trackingToken}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-900 dark:text-sky-300 hover:underline whitespace-nowrap"
                      >
                        Open Live Tracker
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Submitted Solar Enquiries */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Submitted Solar Enquiries
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {leads.length} {leads.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          {dataLoading ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3">
              <div className="h-5 bg-slate-100 dark:bg-slate-800 rounded w-1/3 animate-pulse" />
              <div className="h-12 bg-slate-100 dark:bg-slate-800 rounded w-full animate-pulse" />
            </div>
          ) : leads.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
              <Sun className="w-8 h-8 text-emerald-800 dark:text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                No Solar Enquiries Yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-5">
                Upload your latest electricity bill photo to get AI bill reading, rooftop capacity
                sizing, and an itemized solar subsidy quotation.
              </p>
              <Link
                to="/enquiry/new"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600"
              >
                {dict.submitEnquiry}
              </Link>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <th className="py-3 px-4">Lead ID</th>
                      <th className="py-3 px-4">Applicant & Location</th>
                      <th className="py-3 px-4 text-right">Monthly Bill</th>
                      <th className="py-3 px-4">Recommended Size</th>
                      <th className="py-3 px-4">Bill Verification</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                    {leads.map((ld) => {
                      const ext = extractions[ld.id];
                      return (
                        <tr
                          key={ld.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {ld.leadNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {ld.customerName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {ld.ownershipType === 'OWNER' ? 'Owner' : 'Tenant'} ·{' '}
                              {ld.roofType.replace('_', ' ')} · {ld.city} ({ld.pincode})
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            ₹{ld.avgMonthlyBillInr.toLocaleString('en-IN')}
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {ld.averageUnitsKwh} kWh
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums font-medium text-emerald-900 dark:text-emerald-400 whitespace-nowrap">
                            {ld.recommendationLabel}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {ext?.verificationStatus === 'USER_CONFIRMED' ||
                            ext?.verificationStatus === 'STAFF_VERIFIED'
                              ? 'Confirmed'
                              : ext?.clarityStatus === 'UNCLEAR_REUPLOAD'
                                ? 'Re-upload Requested'
                                : 'Needs Confirmation'}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <Link
                              to={`/leads/${ld.id}/analysis`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-900 dark:text-sky-300 hover:underline"
                            >
                              View Bill & Score
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Quotations Section */}
        <section id="quotations" className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Solar Quotations & Multi-Option PDF Proposals
          </h2>
          {quotations.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>
                Once our Nagpur engineering team prepares your proposal (with 1 kW, 2 kW, 3 kW &amp;
                alternative options), you can review, approve, and download the PDF here.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quotations.map((qt) => {
                const matchingLead = leads.find((l) => l.id === qt.leadId);
                return (
                  <div
                    key={qt.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                          {qt.quotationNumber}
                        </span>
                        <span>
                          Valid until {qt.validUntilDate} ·{' '}
                          <strong className="text-slate-800 dark:text-slate-200">{qt.status}</strong>
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        <span className="font-mono tabular-nums">{qt.systemCapacityKw} kW</span>{' '}
                        System · {qt.customerName}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {qt.panelTypeLabel} ·{' '}
                        <span className="font-mono tabular-nums">
                          {qt.annualGenerationUnits.toLocaleString('en-IN')} kWh/yr
                        </span>{' '}
                        · Payback{' '}
                        <span className="font-mono tabular-nums">{qt.estimatedPaybackYears} yrs</span>
                      </p>

                      <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                        <div>
                          <div className="text-slate-500 dark:text-slate-400">Gross Cost</div>
                          <div className="font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                            ₹{qt.totalInstallationCostInr.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500 dark:text-slate-400">Subsidy*</div>
                          <div className="font-mono tabular-nums font-semibold text-emerald-800 dark:text-emerald-400 mt-0.5">
                            -₹{qt.applicableSubsidyInr.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500 dark:text-slate-400">Net Cost</div>
                          <div className="font-mono tabular-nums font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                            ₹{qt.netCustomerCostInr.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => downloadQuotationPdf(qt, [], matchingLead?.leadNumber)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-950 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </button>

                      {qt.status === 'ISSUED' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void handleQuotationDecision(
                                qt.id,
                                qt.quotationNumber,
                                qt.ownerUid,
                                qt.assignedStaffUids,
                                'REJECTED'
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-red-800 dark:text-red-200 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {dict.declineProposalBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleQuotationDecision(
                                qt.id,
                                qt.quotationNumber,
                                qt.ownerUid,
                                qt.assignedStaffUids,
                                'APPROVED'
                              )
                            }
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {dict.approveProposalBtn}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
