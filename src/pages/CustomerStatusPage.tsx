import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Moon,
  PhoneCall,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { db } from '../lib/firebase.ts';
import { PROJECT_STAGES, type PublicProjectTrackingDoc } from '../types/domain.ts';

export function CustomerStatusPage() {
  const { trackingToken } = useParams<{ trackingToken: string }>();
  const { theme, toggleTheme } = useAuthData();
  const [tracking, setTracking] = useState<PublicProjectTrackingDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadTracking = async () => {
      if (!trackingToken || trackingToken.length < 24) {
        setErrorMsg('Invalid or incomplete customer tracking token.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMsg(null);
      try {
        const snap = await getDoc(doc(db, 'public_tracking', trackingToken));
        if (!active) return;
        if (!snap.exists()) {
          setErrorMsg('No solar installation record found for this tracking link.');
        } else {
          setTracking(snap.data() as PublicProjectTrackingDoc);
        }
      } catch {
        if (!active) return;
        setErrorMsg('Unable to load project status right now. Please verify your tracking link.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadTracking();
    return () => {
      active = false;
    };
  }, [trackingToken]);

  const progressPct = tracking ? Math.min(100, Math.round((tracking.stageIndex / 10) * 100)) : 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Clean Public Brand Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <Link
            to="/login"
            className="text-lg font-bold tracking-tight text-emerald-950 dark:text-emerald-300 whitespace-nowrap shrink-0"
          >
            SuryaSetu
          </Link>

          <span className="hidden sm:inline text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Customer Installation Tracker · Vidarbha
          </span>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-slate-600" />
                  <span>Dark</span>
                </>
              )}
            </button>

            <Link
              to="/login"
              className="px-3.5 py-1.5 text-xs font-semibold text-emerald-950 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors whitespace-nowrap shrink-0"
            >
              Portal Login
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-8 py-8 space-y-6">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-sm text-slate-600 dark:text-slate-400">
            Loading verified rooftop solar installation status...
          </div>
        ) : errorMsg || !tracking ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center space-y-3">
            <div className="text-base font-bold text-slate-900 dark:text-slate-100">
              Tracking Link Unavailable
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">{errorMsg}</p>
            <Link
              to="/login"
              className="inline-block px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600"
            >
              Go to SuryaSetu Home
            </Link>
          </div>
        ) : (
          <>
            {/* Customer-Safe Summary Card */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-900 dark:text-emerald-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Verified Capability Link · Privacy Protected</span>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    Project {tracking.projectNumber}
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                    Homeowner:{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {tracking.customerMask}
                    </strong>{' '}
                    · {tracking.city} ·{' '}
                    <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {tracking.systemCapacityKw} kW Rooftop Solar
                    </span>
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Completion Progress
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-900 dark:text-emerald-400">
                    {progressPct}%
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Stage {tracking.stageIndex} of 10
                  </div>
                </div>
              </div>

              {/* Clean Progress Bar */}
              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-800 dark:bg-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Next Pending Activity Box */}
              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-lg p-4">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Next Scheduled Activity
                </div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1">
                  {tracking.pendingActivities}
                </div>
              </div>

              {/* Transparent Delay Update if Flagged */}
              {tracking.isDelayed && tracking.delaySummary && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950 dark:text-amber-200">
                    <div className="font-semibold">Schedule Advisory</div>
                    <p className="mt-0.5">{tracking.delaySummary}</p>
                  </div>
                </div>
              )}
            </section>

            {/* 10-Stage Milestone Checklist */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                10-Stage Solar Installation & Subsidy Lifecycle
              </h2>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {PROJECT_STAGES.map((stage) => {
                  const isCompleted =
                    tracking.completedStageIndices.includes(stage.index) &&
                    (stage.index < tracking.stageIndex ||
                      tracking.currentStage === 'PROJECT_COMPLETED');
                  const isCurrent =
                    stage.code === tracking.currentStage &&
                    tracking.currentStage !== 'PROJECT_COMPLETED';

                  return (
                    <div key={stage.code} className="py-3.5 flex items-start gap-3.5">
                      <div className="mt-0.5 shrink-0">
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
                        ) : isCurrent ? (
                          <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-700 flex items-center justify-center text-[11px] font-mono text-slate-400 dark:text-slate-500">
                            {stage.index}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              isCurrent
                                ? 'text-emerald-950 dark:text-emerald-300'
                                : isCompleted
                                  ? 'text-slate-900 dark:text-slate-100'
                                  : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {stage.index}. {stage.label}
                          </span>
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            {isCompleted ? 'Completed' : isCurrent ? 'In Progress' : 'Upcoming'}
                          </span>
                        </div>
                        <p
                          className={`text-xs mt-0.5 ${
                            isCompleted || isCurrent
                              ? 'text-slate-600 dark:text-slate-400'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {stage.customerSummary}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Support Contact Card */}
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2.5">
                <PhoneCall className="w-4 h-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
                <span>
                  Need assistance with MSEDCL net-metering or rooftop dispatch? Call Nagpur EPC Desk:{' '}
                  <strong className="font-mono text-slate-900 dark:text-slate-100">
                    +91-712-2248900
                  </strong>
                </span>
              </div>
              <span>Pratap Nagar, Nagpur 440022</span>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
