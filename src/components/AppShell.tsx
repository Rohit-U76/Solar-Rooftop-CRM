import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Calculator,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { t } from '../lib/i18n.ts';
import type { SupportedLanguage } from '../types/domain.ts';

export function AppShell({
  title,
  breadcrumb,
  children,
}: {
  title: string;
  breadcrumb?: string;
  children: React.ReactNode;
}) {
  const {
    firebaseUser,
    profile,
    isBootstrappedAdmin,
    workspaceMode,
    language,
    theme,
    unreadCount,
    switchWorkspaceMode,
    switchLanguage,
    setThemeMode,
    toggleTheme,
    signOutUser,
  } = useAuthData();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dict = t(language);
  const isSales = workspaceMode === 'SALES';
  const isAuthorizedAdmin = isBootstrappedAdmin || profile?.role === 'ADMIN';
  const roleLabel = isAuthorizedAdmin
    ? dict.roleAdmin
    : isSales
      ? dict.roleSales
      : dict.roleHomeowner;

  const salesLinks = [
    { to: '/dashboard', label: dict.navDashboard, icon: LayoutDashboard },
    { to: '/leads', label: dict.navLeads, icon: ClipboardList },
    { to: '/quotations/builder', label: dict.navQuotations, icon: Calculator },
    { to: '/projects', label: dict.navProjects, icon: FolderKanban },
    { to: '/notifications', label: dict.navNotifications, icon: Bell, count: unreadCount },
    { to: '/admin/rules', label: dict.navConfig, icon: Settings },
  ];

  const homeownerLinks = [
    { to: '/homeowner', label: dict.navMySolar },
    { to: '/enquiry/new', label: dict.navEnquiry },
    { to: '/quotations/my', label: dict.navQuotations },
    { to: '/notifications', label: dict.navNotifications },
  ];

  const handleRoleToggle = async (nextMode: 'HOMEOWNER' | 'SALES') => {
    await switchWorkspaceMode(nextMode);
    if (nextMode === 'SALES') {
      navigate('/dashboard');
    } else {
      navigate('/homeowner');
    }
  };

  // ==========================================================================
  // Homeowner Layout: Clean Mobile-First Top Bar Contract (3 Zones, <=15% sticky)
  // ==========================================================================
  if (!isSales) {
    return (
      <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
        <header className="sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <Link
            to="/homeowner"
            className="text-lg font-bold tracking-tight text-emerald-950 dark:text-emerald-300 whitespace-nowrap shrink-0"
          >
            {dict.brandTitle}
          </Link>

          {/* Zone 2: 4 concise single-line text links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
            {homeownerLinks.map((lnk) => {
              const active = location.pathname.startsWith(lnk.to);
              return (
                <Link
                  key={lnk.to}
                  to={lnk.to}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-emerald-900 dark:hover:text-emerald-300 ${
                    active
                      ? 'text-emerald-900 dark:text-emerald-300 underline underline-offset-8 decoration-2'
                      : ''
                  }`}
                >
                  {lnk.label}
                  {lnk.to === '/notifications' && unreadCount > 0 ? ` (${unreadCount})` : ''}
                </Link>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action (+ mobile menu trigger on narrow viewports) */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/enquiry/new"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors whitespace-nowrap shrink-0"
            >
              {dict.ctaNewEnquiry}
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Sub-toolbar below header for workspace switch, language, theme & account */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-8 py-2.5">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{title}</span>
              <span aria-hidden="true">·</span>
              <span>{dict.homeownerPortalLabel}</span>
              <span aria-hidden="true">·</span>
              <span className="text-sky-800 dark:text-sky-300 font-medium">
                {profile?.displayName || firebaseUser?.email}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Light / Dark Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={
                  theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>{dict.themeLightLabel}</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-slate-600" />
                    <span>{dict.themeDarkLabel}</span>
                  </>
                )}
              </button>

              {/* Language Segmented Selector */}
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                {(['en', 'mr', 'hi'] as SupportedLanguage[]).map((lng) => (
                  <button
                    key={lng}
                    type="button"
                    onClick={() => void switchLanguage(lng)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      language === lng
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {lng === 'en' ? 'EN' : lng === 'mr' ? 'मराठी' : 'हिन्दी'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleRoleToggle('SALES')}
                className="px-2.5 py-1 text-xs font-medium text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-md hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {dict.switchToSales}
              </button>

              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                {dict.signOut}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2">
            {homeownerLinks.map((lnk) => (
              <Link
                key={lnk.to}
                to={lnk.to}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-emerald-900 dark:hover:text-emerald-300"
              >
                {lnk.label}
              </Link>
            ))}
          </div>
        )}

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-8 py-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span>SuryaSetu Solar EPC Solutions · Nagpur & Vidarbha Region</span>
            <span>DPDP Act 2023 Protected Customer Data & Capability Links</span>
          </div>
        </footer>
      </div>
    );
  }

  // ==========================================================================
  // Sales Staff & Admin Desktop-First SaaS Workspace (256px Sidebar + Top Bar)
  // ==========================================================================
  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-900 dark:bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <Sun className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {dict.brandTitle}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Nagpur EPC ·{' '}
              <span className="text-sky-800 dark:text-sky-300 font-medium">{roleLabel}</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {salesLinks.map((item) => {
            const Icon = item.icon;
            const active =
              location.pathname === item.to ||
              (item.to !== '/dashboard' &&
                location.pathname.startsWith(item.to.split('/').slice(0, 2).join('/')));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active
                        ? 'text-emerald-800 dark:text-emerald-400'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="font-mono tabular-nums text-xs font-semibold text-sky-800 dark:text-sky-300">
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          {/* Segmented Light / Dark Mode Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setThemeMode('light')}
              className={`inline-flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Sun className="w-3.5 h-3.5" />
              <span>{dict.themeLightLabel}</span>
            </button>
            <button
              type="button"
              onClick={() => setThemeMode('dark')}
              className={`inline-flex items-center justify-center gap-1.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                theme === 'dark'
                  ? 'bg-slate-900 text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Moon className="w-3.5 h-3.5" />
              <span>{dict.themeDarkLabel}</span>
            </button>
          </div>

          {/* Language Segmented Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['en', 'mr', 'hi'] as SupportedLanguage[]).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => void switchLanguage(lng)}
                className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  language === lng
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {lng === 'en' ? 'EN' : lng === 'mr' ? 'मराठी' : 'हिन्दी'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleRoleToggle('HOMEOWNER')}
            className="w-full px-3 py-2 text-xs font-medium text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors text-left whitespace-nowrap truncate cursor-pointer"
          >
            {dict.switchToHomeowner}
          </button>

          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate" title={firebaseUser?.email || ''}>
              {profile?.displayName || firebaseUser?.email}
            </span>
            <button
              type="button"
              onClick={() => void signOutUser()}
              title={dict.signOut}
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* SaaS Top Bar Contract: Breadcrumb on Left, 1 Primary Action on Right */}
        <header className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Open navigation"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="min-w-0 truncate text-sm text-slate-500 dark:text-slate-400">
              <span className="text-slate-400 dark:text-slate-500">
                {breadcrumb || 'Vidarbha Operations'}
              </span>
              <span className="mx-2 text-slate-300 dark:text-slate-700">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{title}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/enquiry/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 dark:bg-emerald-700 rounded-lg hover:bg-emerald-950 dark:hover:bg-emerald-600 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {dict.navEnquiry}
            </Link>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 space-y-2">
            <div className="pb-2 mb-1 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-sky-800 dark:text-sky-300">
                {roleLabel}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-3 h-3 text-amber-400" />
                      <span>{dict.themeLightLabel}</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3 h-3" />
                      <span>{dict.themeDarkLabel}</span>
                    </>
                  )}
                </button>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded">
                  {(['en', 'mr', 'hi'] as SupportedLanguage[]).map((lng) => (
                    <button
                      key={lng}
                      type="button"
                      onClick={() => void switchLanguage(lng)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded cursor-pointer ${
                        language === lng
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {lng === 'en' ? 'EN' : lng === 'mr' ? 'मराठी' : 'हिन्दी'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {salesLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-emerald-900 dark:hover:text-emerald-300"
              >
                <span>{item.label}</span>
                {item.count ? (
                  <span className="font-mono tabular-nums text-xs text-sky-800 dark:text-sky-300">
                    {item.count}
                  </span>
                ) : null}
              </Link>
            ))}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleRoleToggle('HOMEOWNER');
                }}
                className="text-xs font-medium text-sky-900 dark:text-sky-300"
              >
                {dict.switchToHomeowner}
              </button>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="text-xs text-slate-500 dark:text-slate-400"
              >
                {dict.signOut}
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1380px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
