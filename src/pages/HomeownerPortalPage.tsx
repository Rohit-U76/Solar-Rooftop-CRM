import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Download, ExternalLink, FileSpreadsheet, Plus, Sun } from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { downloadQuotationPdf } from '../lib/pdfGenerator.ts';
import { PROJECT_STAGES } from '../types/domain.ts';

export function HomeownerPortalPage() {
  const {
    leads,
    extractions,
    quotations,
    projects,
    dataLoading,
    logSimulatedNotification,
  } = useAuthData();

  const handleApproveQuotation = async (quoteId: string, quoteNum: string, ownerUid: string, staffUids: string[]) => {
    try {
      await updateDoc(doc(db, 'quotations', quoteId), {
        status: 'APPROVED',
        updatedAt: serverTimestamp(),
      });
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
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `quotations/${quoteId}`);
    }
  };

  return (
    <AppShell title="My Rooftop Solar Overview">
      <div className="space-y-8">
        {/* Welcome Banner */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Your Solar Enquiries, Quotations & Installation Progress
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Submit an electricity bill for AI consumption verification, review transparent solar recommendations, or download your proposal.
            </p>
          </div>
          <Link
            to="/enquiry/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Solar Enquiry
          </Link>
        </div>

        {/* Active Projects Section */}
        {projects.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Active Rooftop Installations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((prj) => {
                const stageDef = PROJECT_STAGES.find((s) => s.code === prj.currentStage);
                return (
                  <div key={prj.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                        <span className="font-mono tabular-nums font-semibold text-slate-800">
                          {prj.projectNumber}
                        </span>
                        <span>
                          Stage <span className="font-mono tabular-nums">{prj.stageIndex}/10</span>
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900">
                        {prj.customerName} · <span className="font-mono tabular-nums">{prj.systemCapacityKw} kW</span> Rooftop Plant
                      </h3>
                      <p className="text-xs text-emerald-900 font-medium mt-1">
                        Current Milestone: {stageDef?.label || prj.currentStage}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">{prj.pendingActivities}</p>

                      {/* Clean Progress Bar */}
                      <div className="mt-4 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-800 transition-all"
                          style={{ width: `${Math.min(100, prj.stageIndex * 10)}%` }}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-500">
                        {prj.city} · Net Cost{' '}
                        <span className="font-mono tabular-nums font-medium text-slate-800">
                          ₹{prj.netCustomerCostInr.toLocaleString('en-IN')}
                        </span>
                      </span>
                      <Link
                        to={`/track/${prj.trackingToken}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-900 hover:underline whitespace-nowrap"
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
            <h2 className="text-base font-semibold text-slate-900">Submitted Solar Enquiries</h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {leads.length} {leads.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          {dataLoading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="h-5 bg-slate-100 rounded w-1/3 animate-pulse" />
              <div className="h-12 bg-slate-100 rounded w-full animate-pulse" />
            </div>
          ) : leads.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <Sun className="w-8 h-8 text-emerald-800 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-900 mb-1">No Solar Enquiries Yet</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
                Upload your latest electricity bill photo to get AI bill reading, rooftop capacity sizing, and an itemized solar subsidy quotation.
              </p>
              <Link
                to="/enquiry/new"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950"
              >
                Submit Your First Enquiry
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Lead ID</th>
                      <th className="py-3 px-4">Applicant & Location</th>
                      <th className="py-3 px-4 text-right">Monthly Bill</th>
                      <th className="py-3 px-4">Recommended Size</th>
                      <th className="py-3 px-4">Bill Verification</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {leads.map((ld) => {
                      const ext = extractions[ld.id];
                      return (
                        <tr key={ld.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {ld.leadNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{ld.customerName}</div>
                            <div className="text-xs text-slate-500">
                              {ld.ownershipType === 'OWNER' ? 'Owner' : 'Tenant'} · {ld.city} ({ld.pincode})
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                            ₹{ld.avgMonthlyBillInr.toLocaleString('en-IN')}
                            <div className="text-xs text-slate-500">{ld.averageUnitsKwh} kWh</div>
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums font-medium text-emerald-900 whitespace-nowrap">
                            {ld.recommendationLabel}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                            {ext?.verificationStatus === 'USER_CONFIRMED' || ext?.verificationStatus === 'STAFF_VERIFIED'
                              ? 'Confirmed'
                              : ext?.clarityStatus === 'UNCLEAR_REUPLOAD'
                                ? 'Re-upload Requested'
                                : 'Needs Confirmation'}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <Link
                              to={`/leads/${ld.id}/analysis`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-900 hover:underline"
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
          <h2 className="text-base font-semibold text-slate-900">Solar Quotations & Subsidy Breakdown</h2>
          {quotations.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 text-xs text-slate-500 flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-slate-400 shrink-0" />
              <span>Once our Nagpur engineering team prepares your proposal, you can view, approve, and download the PDF here.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quotations.map((qt) => {
                const matchingLead = leads.find((l) => l.id === qt.leadId);
                return (
                  <div key={qt.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                        <span className="font-mono tabular-nums font-semibold text-slate-800">
                          {qt.quotationNumber}
                        </span>
                        <span>Valid until {qt.validUntilDate} · {qt.status}</span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900">
                        <span className="font-mono tabular-nums">{qt.systemCapacityKw} kW</span> System · {qt.customerName}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{qt.panelTypeLabel}</p>

                      <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
                        <div>
                          <div className="text-slate-500">Gross Cost</div>
                          <div className="font-mono tabular-nums font-semibold text-slate-800 mt-0.5">
                            ₹{qt.totalInstallationCostInr.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Subsidy*</div>
                          <div className="font-mono tabular-nums font-semibold text-emerald-800 mt-0.5">
                            -₹{qt.applicableSubsidyInr.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Net Cost</div>
                          <div className="font-mono tabular-nums font-bold text-slate-900 mt-0.5">
                            ₹{qt.netCustomerCostInr.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => downloadQuotationPdf(qt, [], matchingLead?.leadNumber)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </button>

                      {qt.status === 'ISSUED' && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleApproveQuotation(qt.id, qt.quotationNumber, qt.ownerUid, qt.assignedStaffUids)
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve Quotation
                        </button>
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
