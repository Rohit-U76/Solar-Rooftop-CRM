import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { calculateSolarQuotation } from '../shared/solarEngine.ts';
import { SAMPLE_BILL_ASSETS, type WorkspaceMode } from '../types/domain.ts';

type AuthTabMode = 'SIGN_IN' | 'SIGN_UP' | 'FORGOT_PASSWORD';

function formatFirebaseAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not enabled yet in your Firebase project. Open Firebase Console → Authentication → Sign-in method → enable Email/Password, or use Continue with Google below.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Switch to Sign In or use Continue with Google.';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'Invalid email or password. Please verify your credentials or reset your password.';
  }
  if (code === 'auth/weak-password') {
    return 'Password is too weak. Please choose a password with at least 6 characters.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many authentication attempts. Please wait a minute before trying again.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before completing.';
  }
  return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
}

function GoogleBrandMark() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.86c2.26-2.09 3.56-5.17 3.56-8.8z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-2.98c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.31c-.24-.72-.38-1.49-.38-2.31s.14-1.59.38-2.31V6.6H1.29C.47 8.23 0 10.06 0 12s.47 3.77 1.29 5.4l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.6l3.98 3.09c.95-2.85 3.6-4.94 6.73-4.94z"
      />
    </svg>
  );
}

export function LoginPage() {
  const {
    firebaseUser,
    needsEmailVerification,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerificationEmail,
    refreshEmailVerificationStatus,
    sendPasswordReset,
    signOutUser,
  } = useAuthData();
  const navigate = useNavigate();
  const authPanelRef = useRef<HTMLDivElement | null>(null);

  const [authTab, setAuthTab] = useState<AuthTabMode>('SIGN_IN');
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceMode>('HOMEOWNER');

  // Form state
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const [submittingEmail, setSubmittingEmail] = useState<boolean>(false);
  const [submittingGoogle, setSubmittingGoogle] = useState<boolean>(false);
  const [checkingVerify, setCheckingVerify] = useState<boolean>(false);
  const [resendingVerify, setResendingVerify] = useState<boolean>(false);

  const [authError, setAuthError] = useState<string>('');
  const [authNotice, setAuthNotice] = useState<string>('');
  const [trackingInput, setTrackingInput] = useState<string>('');
  const [heroImgFailed, setHeroImgFailed] = useState<boolean>(false);

  // Quick interactive deterministic calculator on public landing
  const [estBill, setEstBill] = useState<number>(3200);
  const estUnits = Math.round(estBill / 9.0);
  const estKw = Math.max(1, Math.min(10, Math.round((estUnits * 12) / 1400)));
  const estQuote = calculateSolarQuotation({
    systemCapacityKw: estKw,
    ownershipType: 'OWNER',
    isResidentialTariff: true,
    panelPricePerKwInr: 43000,
    annualGenPerKw: 1400,
    installationPerKwInr: 11000,
    bosAndNetMeteringFlatInr: 12000,
    electricityTariffInr: 9.0,
    subsidyRule: {
      firstTierMaxKw: 2,
      firstTierRateInr: 30000,
      secondTierMaxKw: 3,
      secondTierRateInr: 18000,
      maxSubsidyCapInr: 78000,
      residentialOnly: true,
    },
  });

  const focusAuthCard = (tab: AuthTabMode, workspace?: WorkspaceMode) => {
    setAuthError('');
    setAuthNotice('');
    setAuthTab(tab);
    if (workspace) {
      setSelectedWorkspace(workspace);
    }
    authPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleGoogleAuth = async (overrideMode?: WorkspaceMode) => {
    const targetMode = overrideMode ?? selectedWorkspace;
    setAuthError('');
    setAuthNotice('');
    setSubmittingGoogle(true);
    try {
      await signInWithGoogle(targetMode);
      navigate(targetMode === 'SALES' ? '/dashboard' : '/homeowner');
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setSubmittingGoogle(false);
    }
  };

  const handleEmailFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthNotice('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (authTab === 'FORGOT_PASSWORD') {
      setSubmittingEmail(true);
      try {
        await sendPasswordReset(cleanEmail);
        setAuthNotice(
          `Password reset instructions have been sent to ${cleanEmail}. Check your inbox and spam folder.`
        );
        setAuthTab('SIGN_IN');
      } catch (err: unknown) {
        setAuthError(formatFirebaseAuthError(err));
      } finally {
        setSubmittingEmail(false);
      }
      return;
    }

    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    if (authTab === 'SIGN_UP') {
      if (fullName.trim().length < 2) {
        setAuthError('Please enter your full name (minimum 2 characters).');
        return;
      }
      if (password !== confirmPassword) {
        setAuthError('Passwords do not match. Please re-enter your confirmation password.');
        return;
      }

      setSubmittingEmail(true);
      try {
        const res = await signUpWithEmail({
          fullName: fullName.trim(),
          email: cleanEmail,
          password,
          preferredMode: selectedWorkspace,
        });
        if (res.emailVerified) {
          navigate(selectedWorkspace === 'SALES' ? '/dashboard' : '/homeowner');
        } else {
          setAuthNotice(
            `Account created! We sent a verification link to ${cleanEmail}. Verify your email to activate your solar workspace.`
          );
        }
      } catch (err: unknown) {
        setAuthError(formatFirebaseAuthError(err));
      } finally {
        setSubmittingEmail(false);
      }
      return;
    }

    // SIGN_IN flow
    setSubmittingEmail(true);
    try {
      const res = await signInWithEmail(cleanEmail, password, selectedWorkspace);
      if (res.emailVerified) {
        navigate(selectedWorkspace === 'SALES' ? '/dashboard' : '/homeowner');
      } else {
        setAuthNotice(
          `Signed in as ${cleanEmail}. Please verify your email link to open your workspace.`
        );
      }
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setSubmittingEmail(false);
    }
  };

  const handleCheckEmailVerified = async () => {
    setAuthError('');
    setAuthNotice('');
    setCheckingVerify(true);
    try {
      const verified = await refreshEmailVerificationStatus();
      if (verified) {
        navigate(selectedWorkspace === 'SALES' ? '/dashboard' : '/homeowner');
      } else {
        setAuthError(
          'Your email is not marked verified yet. Click the verification link in your inbox first, then press "I\'ve Verified My Email" again.'
        );
      }
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setCheckingVerify(false);
    }
  };

  const handleResendVerification = async () => {
    setAuthError('');
    setAuthNotice('');
    setResendingVerify(true);
    try {
      await resendVerificationEmail();
      setAuthNotice(
        `A fresh verification email was sent to ${firebaseUser?.email || 'your inbox'}.`
      );
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setResendingVerify(false);
    }
  };

  const handleSwitchAccountOrGoogle = async () => {
    setAuthError('');
    setAuthNotice('');
    await signOutUser();
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = trackingInput.trim();
    if (clean.length >= 24) {
      navigate(`/track/${encodeURIComponent(clean)}`);
    } else {
      setAuthError(
        'Enter a valid 24+ character secure project tracking token from your SMS/WhatsApp link.'
      );
      authPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const isBusy = submittingEmail || submittingGoogle || checkingVerify || resendingVerify;

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 px-6 lg:px-12 py-4 flex items-center justify-between gap-8">
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-emerald-950 whitespace-nowrap shrink-0"
        >
          SuryaSetu
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#workflow"
            className="hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0"
          >
            Workflow
          </a>
          <a
            href="#estimator"
            className="hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0"
          >
            Subsidy Estimator
          </a>
          <a
            href="#track"
            className="hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0"
          >
            Track Installation
          </a>
          <a
            href="#coverage"
            className="hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0"
          >
            Vidarbha Coverage
          </a>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => focusAuthCard('SIGN_IN')}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => focusAuthCard('SIGN_UP')}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Sign Up
          </button>
        </div>
      </header>

      {/* Hero Split Section: Left Editorial + Visual | Right Unified Auth Card */}
      <section id="top" className="max-w-7xl w-full mx-auto px-6 lg:px-12 pt-10 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left 7 Columns: Value Proposition, Quick Role Triggers & Nagpur Solar Showcase */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
            <div>
              <p className="text-xs font-medium text-emerald-900 mb-3">
                Nagpur & Vidarbha Rooftop Solar EPC Platform · MNRE Turnkey Workflow
              </p>
              <h1
                className="text-3xl sm:text-4xl lg:text-[2.6rem] font-bold text-slate-900 leading-[1.15] mb-4 max-w-2xl"
                style={{ textWrap: 'balance' }}
              >
                AI Electricity Bill Reading, Transparent Sizing & Solar Project Tracking
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                Digitizing rooftop solar enquiries across Nagpur, Wardha, Amravati, Akola, and
                Chandrapur. Homeowners receive instant consumption verification and deterministic
                subsidy proposals; sales teams qualify 1,400+ monthly leads without spreadsheet
                bottlenecks.
              </p>
            </div>

            {/* Rooftop Installation Visual */}
            {!heroImgFailed ? (
              <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 h-64 sm:h-72">
                <img
                  src={SAMPLE_BILL_ASSETS.hero}
                  alt="Modern residential RCC rooftop solar plant installed in Nagpur, Maharashtra"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-5 text-white">
                  <div className="text-xs font-medium text-emerald-200 mb-1">
                    Shankar Nagar, Nagpur · 3 kW Mono PERC Installation
                  </div>
                  <div className="text-sm font-semibold">
                    4,200 kWh Estimated Yearly Generation · 3.1 Year Simple Payback
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full rounded-xl border border-slate-200 bg-emerald-950 text-white p-7 flex flex-col justify-between h-60">
                <Sun className="w-9 h-9 text-emerald-300" />
                <div>
                  <div className="text-lg font-semibold mb-1">
                    Vidarbha Rooftop Solar Engineering
                  </div>
                  <p className="text-xs text-emerald-100/80">
                    High-irradiance 1,400 kWh/kW/year design standard across Nagpur & surrounding
                    districts.
                  </p>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Email/Password & Google Sign-In</span>
              <span aria-hidden="true">·</span>
              <span>Deterministic Backend Subsidy Math</span>
              <span aria-hidden="true">·</span>
              <span>DPDP Act 2023 PII Isolation</span>
            </div>
          </div>

          {/* Right 5 Columns: Commercial Auth Card (Sign In / Sign Up + Continue with Google) */}
          <div
            id="auth-panel"
            ref={authPanelRef}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-7"
          >
            {needsEmailVerification && firebaseUser ? (
              /* Email Verification Gate View */
              <div className="space-y-5">
                <div className="flex items-center gap-2.5 text-emerald-900">
                  <MailCheck className="w-5 h-5 shrink-0" />
                  <h2 className="text-lg font-bold text-slate-900">Verify Your Email Address</h2>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  We sent a verification link to{' '}
                  <span className="font-semibold text-slate-900">{firebaseUser.email}</span>.
                  SuryaSetu enforces verified-email security rules to protect customer electricity
                  bills and subsidy quotations.
                </p>

                {authNotice && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                    {authNotice}
                  </div>
                )}

                {authError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                    {authError}
                  </div>
                )}

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleCheckEmailVerified()}
                    disabled={isBusy}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {checkingVerify ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    I&apos;ve Verified My Email — Continue
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleResendVerification()}
                    disabled={isBusy}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {resendingVerify ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                </div>

                <div className="pt-4 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={() => void handleSwitchAccountOrGoogle()}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
                  >
                    Sign out or use Continue with Google instead
                  </button>
                </div>
              </div>
            ) : (
              /* Standard Sign In / Sign Up / Password Reset + Google OAuth View */
              <div>
                {/* Segmented Sign In / Sign Up Tabs */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('SIGN_IN');
                      setAuthError('');
                      setAuthNotice('');
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      authTab !== 'SIGN_UP'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('SIGN_UP');
                      setAuthError('');
                      setAuthNotice('');
                    }}
                    className={`py-2 px-3 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      authTab === 'SIGN_UP'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sign Up
                  </button>
                </div>

                {/* Workspace Role Selector */}
                {authTab !== 'FORGOT_PASSWORD' && (
                  <div className="mb-5">
                    <div className="text-xs font-semibold text-slate-700 mb-2">
                      Select Portal Workspace
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedWorkspace('HOMEOWNER')}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          selectedWorkspace === 'HOMEOWNER'
                            ? 'border-emerald-900 bg-emerald-50/70 text-emerald-950'
                            : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Homeowner Portal
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedWorkspace('SALES')}
                        className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                          selectedWorkspace === 'SALES'
                            ? 'border-emerald-900 bg-emerald-50/70 text-emerald-950'
                            : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Sales Staff Console
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">
                      {selectedWorkspace === 'HOMEOWNER'
                        ? 'Submit MSEDCL bills, verify units, download quotes, and track installation.'
                        : 'Manage Vidarbha leads, verify AI scans, issue PDF quotes, and update 10 stages.'}
                    </p>
                  </div>
                )}

                {authNotice && (
                  <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                    {authNotice}
                  </div>
                )}

                {authError && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                    {authError}
                  </div>
                )}

                {/* Email / Password Form */}
                <form onSubmit={(e) => void handleEmailFormSubmit(e)} className="space-y-3.5">
                  {authTab === 'SIGN_UP' && (
                    <div>
                      <label
                        htmlFor="auth-fullname"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Full Name
                      </label>
                      <input
                        id="auth-fullname"
                        type="text"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Prashant Wankhede"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-800"
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="auth-email"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Email Address
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-800"
                    />
                  </div>

                  {authTab !== 'FORGOT_PASSWORD' && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="auth-password"
                          className="block text-xs font-medium text-slate-700"
                        >
                          Password
                        </label>
                        {authTab === 'SIGN_IN' && (
                          <button
                            type="button"
                            onClick={() => {
                              setAuthTab('FORGOT_PASSWORD');
                              setAuthError('');
                              setAuthNotice('');
                            }}
                            className="text-xs font-medium text-emerald-900 hover:underline cursor-pointer"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <input
                          id="auth-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={
                            authTab === 'SIGN_UP' ? 'new-password' : 'current-password'
                          }
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            authTab === 'SIGN_UP'
                              ? 'Minimum 6 characters'
                              : 'Enter your password'
                          }
                          className="w-full pl-3.5 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-800"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {authTab === 'SIGN_UP' && (
                    <div>
                      <label
                        htmlFor="auth-confirm-password"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Confirm Password
                      </label>
                      <input
                        id="auth-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-emerald-800"
                      />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {submittingEmail && <Loader2 className="w-4 h-4 animate-spin" />}
                    {authTab === 'SIGN_IN' &&
                      (selectedWorkspace === 'SALES'
                        ? 'Sign In to Sales Console'
                        : 'Sign In to Homeowner Portal')}
                    {authTab === 'SIGN_UP' && 'Create SuryaSetu Account'}
                    {authTab === 'FORGOT_PASSWORD' && 'Send Password Reset Link'}
                    {!submittingEmail && <ArrowRight className="w-3.5 h-3.5" />}
                  </button>

                  {authTab === 'FORGOT_PASSWORD' && (
                    <div className="text-center pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAuthTab('SIGN_IN');
                          setAuthError('');
                        }}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
                      >
                        Back to Sign In
                      </button>
                    </div>
                  )}
                </form>

                {/* Divider + Continue with Google */}
                {authTab !== 'FORGOT_PASSWORD' && (
                  <>
                    <div className="relative my-5">
                      <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-slate-200" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-white px-3 text-slate-400">or continue with</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleGoogleAuth()}
                      disabled={isBusy}
                      className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {submittingGoogle ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                      ) : (
                        <GoogleBrandMark />
                      )}
                      <span>
                        {submittingGoogle ? 'Connecting Google...' : 'Continue with Google'}
                      </span>
                    </button>

                    <p className="text-[11px] text-slate-500 text-center mt-4">
                      {authTab === 'SIGN_IN' ? (
                        <>
                          New to SuryaSetu?{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setAuthTab('SIGN_UP');
                              setAuthError('');
                              setAuthNotice('');
                            }}
                            className="font-semibold text-emerald-900 hover:underline cursor-pointer"
                          >
                            Create an account
                          </button>
                        </>
                      ) : (
                        <>
                          Already have an account?{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setAuthTab('SIGN_IN');
                              setAuthError('');
                              setAuthNotice('');
                            }}
                            className="font-semibold text-emerald-900 hover:underline cursor-pointer"
                          >
                            Sign in
                          </button>
                        </>
                      )}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Full-Width 4-Column Operational Proof Row */}
        <div
          id="workflow"
          className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-8 border-t border-slate-200"
        >
          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="font-mono tabular-nums text-2xl font-bold text-emerald-900 mb-1">
              &lt; 15%
            </div>
            <div className="text-xs font-semibold text-slate-900">
              Unqualified Physical Surveys
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Reduced from 40% baseline by screening tenant NOC & low-consumption bills upfront.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="font-mono tabular-nums text-2xl font-bold text-emerald-900 mb-1">
              90%+
            </div>
            <div className="text-xs font-semibold text-slate-900">Same-Day PDF Quotations</div>
            <p className="text-xs text-slate-500 mt-1">
              Versioned panel, BOS, and sample subsidy rules generate locked proposals in seconds.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="font-mono tabular-nums text-2xl font-bold text-emerald-900 mb-1">
              -50%
            </div>
            <div className="text-xs font-semibold text-slate-900">Status Follow-Up Calls</div>
            <p className="text-xs text-slate-500 mt-1">
              Customers track 10 installation, DISCOM net-meter, and subsidy stages via token link.
            </p>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="font-mono tabular-nums text-2xl font-bold text-emerald-900 mb-1">
              1,400 kWh
            </div>
            <div className="text-xs font-semibold text-slate-900">Per kW Annual Yield</div>
            <p className="text-xs text-slate-500 mt-1">
              Calibrated for central Indian solar insolation across Nagpur & Vidarbha rooftops.
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Deterministic Subsidy & Payback Preview + Token Tracker */}
      <section id="estimator" className="bg-slate-50 border-y border-slate-200 py-12 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center gap-2 text-emerald-900 text-xs font-semibold mb-2">
              <Calculator className="w-4 h-4" />
              Instant Deterministic Sizing & Sample Subsidy Preview
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">
              Check Recommended Rooftop Capacity Before Signing In
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Uses SuryaSetu’s exact deterministic formulas (1,400 units/kW/year; configurable
              sample slab up to ₹78,000).
            </p>

            <div className="mb-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <label htmlFor="bill-slider" className="font-medium text-slate-700">
                  Average Monthly Electricity Bill
                </label>
                <span className="font-mono tabular-nums font-bold text-emerald-900 text-base">
                  ₹{estBill.toLocaleString('en-IN')} / month
                </span>
              </div>
              <input
                id="bill-slider"
                type="range"
                min={600}
                max={10000}
                step={100}
                value={estBill}
                onChange={(e) => setEstBill(Number(e.target.value))}
                className="w-full accent-emerald-900 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-400 font-mono tabular-nums mt-1">
                <span>₹600</span>
                <span>₹3,200 (Typical 3BHK)</span>
                <span>₹10,000</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              <div>
                <div className="text-xs text-slate-500">Recommended Size</div>
                <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-0.5">
                  {estKw} kW
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Sample Subsidy*</div>
                <div className="font-mono tabular-nums text-lg font-bold text-emerald-800 mt-0.5">
                  ₹{estQuote.applicableSubsidyInr.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Est. Net Cost</div>
                <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-0.5">
                  ₹{estQuote.netCustomerCostInr.toLocaleString('en-IN')}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Est. Payback</div>
                <div className="font-mono tabular-nums text-lg font-bold text-slate-900 mt-0.5">
                  {estQuote.estimatedPaybackYears} yrs
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-4">
              *Sample subsidy rule shown for illustration (₹30,000/kW first 2 kW + ₹18,000 3rd kW,
              max ₹78,000). Actual government DBT rules are verified by date at quotation issuance.
            </p>
          </div>

          {/* Secure Customer Project Status Lookup */}
          <div
            id="track"
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-2 text-slate-700 text-xs font-semibold mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-800" />
                Zero-Login Customer Status Link
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                Track Existing Rooftop Installation
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed mb-5">
                Received a secure tracking token via SuryaSetu WhatsApp or SMS? Enter your token
                below to view authorized milestone progress without exposing personal billing data.
              </p>

              <form onSubmit={handleTrackSubmit} className="space-y-3">
                <input
                  type="text"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="e.g. trk_ngp30881_..."
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-800"
                />
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-900 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Open Secure Project Status
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>

            <div
              id="coverage"
              className="pt-5 mt-6 border-t border-slate-100 text-xs text-slate-500 space-y-1.5"
            >
              <div className="font-semibold text-slate-700">Active Vidarbha EPC Service Clusters</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800 shrink-0" />
                <span>
                  Nagpur Urban & Hingna (440xxx / 441xxx) · Wardha · Amravati · Akola · Chandrapur
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mt-auto px-6 lg:px-12 py-6 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>© 2026 SuryaSetu Solar EPC Solutions · Nagpur, Maharashtra</span>
        <span>Protected by Zero-Trust Access Controls & DPDP Act 2023 Data Minimization</span>
      </footer>
    </div>
  );
}
