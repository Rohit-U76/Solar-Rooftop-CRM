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
    workspaceMode,
    language,
    unreadCount,
    switchWorkspaceMode,
    switchLanguage,
    signOutUser,
  } = useAuthData();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const dict = t(language);
  const isSales = workspaceMode === 'SALES';

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
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <Link
            to="/homeowner"
            className="text-lg font-bold tracking-tight text-emerald-950 whitespace-nowrap shrink-0"
          >
            {dict.brandTitle}
          </Link>

          {/* Zone 2: 4 concise single-line text links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {homeownerLinks.map((lnk) => {
              const active = location.pathname.startsWith(lnk.to);
              return (
                <Link
                  key={lnk.to}
                  to={lnk.to}
                  className={`whitespace-nowrap shrink-0 transition-colors hover:text-emerald-900 ${
                    active ? 'text-emerald-900 underline underline-offset-8 decoration-2' : ''
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
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors whitespace-nowrap shrink-0"
            >
              {dict.ctaNewEnquiry}
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Sub-toolbar below header for workspace switch, language & account */}
        <div className="bg-white border-b border-slate-200/80 px-4 sm:px-8 py-2.5">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800">{title}</span>
              <span aria-hidden="true">·</span>
              <span>Homeowner Portal ({profile?.displayName || firebaseUser?.email})</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Language Segmented Selector */}
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
                {(['en', 'mr', 'hi'] as SupportedLanguage[]).map((lng) => (
                  <button
                    key={lng}
                    type="button"
                    onClick={() => void switchLanguage(lng)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      language === lng ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lng === 'en' ? 'EN' : lng === 'mr' ? 'मराठी' : 'हिन्दी'}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => void handleRoleToggle('SALES')}
                className="px-2.5 py-1 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Switch to Sales Staff Console
              </button>

              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-2">
            {homeownerLinks.map((lnk) => (
              <Link
                key={lnk.to}
                to={lnk.to}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 text-sm font-medium text-slate-700 hover:text-emerald-900"
              >
                {lnk.label}
              </Link>
            ))}
          </div>
        )}

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 sm:px-8 py-4 text-xs text-slate-500">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span>SuryaSetu Solar EPC Solutions · Nagpur & Vidarbha Region</span>
            <span>DPDP Act 2023 Compliant Customer Data Protection</span>
          </div>
        </footer>
      </div>
    );
  }

  // ==========================================================================
  // Sales Staff & Admin Desktop-First SaaS Workspace (260px Sidebar + Top Bar)
  // ==========================================================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 bg-white border-r border-slate-200">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-900 text-white flex items-center justify-center shrink-0">
            <Sun className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-bold tracking-tight text-slate-900 truncate">
              {dict.brandTitle}
            </div>
            <div className="text-xs text-slate-500 truncate">Nagpur EPC Operations</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {salesLinks.map((item) => {
            const Icon = item.icon;
            const active =
              location.pathname === item.to ||
              (item.to !== '/dashboard' && location.pathname.startsWith(item.to.split('/').slice(0, 2).join('/')));
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-emerald-50 text-emerald-950 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-800' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="font-mono tabular-nums text-xs font-semibold text-emerald-900">
                    {item.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['en', 'mr', 'hi'] as SupportedLanguage[]).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => void switchLanguage(lng)}
                className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  language === lng ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lng === 'en' ? 'EN' : lng === 'mr' ? 'मराठी' : 'हिन्दी'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void handleRoleToggle('HOMEOWNER')}
            className="w-full px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors text-left whitespace-nowrap truncate cursor-pointer"
          >
            Switch to Homeowner View
          </button>

          <div className="flex items-center justify-between gap-2 pt-1 text-xs text-slate-500">
            <span className="truncate">{profile?.displayName || firebaseUser?.email}</span>
            <button
              type="button"
              onClick={() => void signOutUser()}
              title="Sign Out"
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* SaaS Top Bar Contract: Breadcrumb on Left, 1 Primary Action on Right */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Open navigation"
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="min-w-0 truncate text-sm text-slate-500">
              <span className="text-slate-400">{breadcrumb || 'Vidarbha Operations'}</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-semibold text-slate-900">{title}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/enquiry/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-900 rounded-lg hover:bg-emerald-950 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {dict.navEnquiry}
            </Link>
          </div>
        </header>

        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-1.5">
            {salesLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between py-2 text-sm font-medium text-slate-700 hover:text-emerald-900"
              >
                <span>{item.label}</span>
                {item.count ? <span className="font-mono text-xs">{item.count}</span> : null}
              </Link>
            ))}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void handleRoleToggle('HOMEOWNER');
                }}
                className="text-xs font-medium text-emerald-900"
              >
                Switch to Homeowner View
              </button>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="text-xs text-slate-500"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1380px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
