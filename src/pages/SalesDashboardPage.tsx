import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Filter,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { t } from '../lib/i18n.ts';
import { evaluateProjectDelay } from '../shared/solarEngine.ts';
import { PROJECT_STAGES, type QualificationCategory } from '../types/domain.ts';

export function SalesDashboardPage() {
  const { leads, quotations, projects, dataLoading, language, theme, reseedDemoData } =
    useAuthData();
  const dict = t(language);
  const isDark = theme === 'dark';

  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [locationFilter, setLocationFilter] = useState<string>('ALL');
  const [scoreFilter, setScoreFilter] = useState<'ALL' | QualificationCategory>('ALL');
  const [projectStatusFilter, setProjectStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'DELAYED' | 'COMPLETED'
  >('ALL');
  const [reseeding, setReseeding] = useState(false);

  // Dynamic Recharts Light/Dark Palette
  const chartColors = useMemo(
    () => ({
      grid: isDark ? '#1E293B' : '#E2E8F0',
      axisMuted: isDark ? '#94A3B8' : '#64748B',
      axisPrimary: isDark ? '#CBD5E1' : '#334155',
      tooltipBg: isDark ? '#0F172A' : '#FFFFFF',
      tooltipBorder: isDark ? '#334155' : '#E2E8F0',
      tooltipText: isDark ? '#F1F5F9' : '#0F172A',
      legendText: isDark ? '#CBD5E1' : '#475569',
      high: isDark ? '#22C55E' : '#14532D',
      medium: isDark ? '#38BDF8' : '#0284C7',
      low: isDark ? '#64748B' : '#94A3B8',
      funnelBar: isDark ? '#38BDF8' : '#0369A1',
      delayed: isDark ? '#EF4444' : '#DC2626',
      areaStroke: isDark ? '#22C55E' : '#14532D',
      areaFill: isDark ? 'rgba(34, 197, 94, 0.2)' : '#DCFCE7',
    }),
    [isDark]
  );

  const scoreColorMap: Record<QualificationCategory, string> = {
    HIGH: chartColors.high,
    MEDIUM: chartColors.medium,
    LOW: chartColors.low,
  };

  const tooltipContentStyle = {
    backgroundColor: chartColors.tooltipBg,
    borderColor: chartColors.tooltipBorder,
    color: chartColors.tooltipText,
    borderRadius: '8px',
    fontSize: '12px',
  };

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.monthKey) set.add(l.monthKey);
    });
    projects.forEach((p) => {
      if (p.completionMonthKey) set.add(p.completionMonthKey);
    });
    return Array.from(set).sort();
  }, [leads, projects]);

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.city) set.add(l.city);
    });
    projects.forEach((p) => {
      if (p.city) set.add(p.city);
    });
    return Array.from(set).sort();
  }, [leads, projects]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (monthFilter !== 'ALL' && lead.monthKey !== monthFilter) return false;
      if (locationFilter !== 'ALL' && lead.city !== locationFilter) return false;
      if (scoreFilter !== 'ALL' && lead.qualificationCategory !== scoreFilter) return false;
      return true;
    });
  }, [leads, monthFilter, locationFilter, scoreFilter]);

  const filteredLeadIds = useMemo(() => new Set(filteredLeads.map((l) => l.id)), [filteredLeads]);

  const filteredQuotations = useMemo(() => {
    return quotations.filter((q) => {
      if (monthFilter !== 'ALL' && !q.quotationDate.startsWith(monthFilter)) return false;
      if (locationFilter !== 'ALL' && q.city !== locationFilter) return false;
      if (scoreFilter !== 'ALL' && !filteredLeadIds.has(q.leadId)) return false;
      return true;
    });
  }, [quotations, monthFilter, locationFilter, scoreFilter, filteredLeadIds]);

  const enrichedProjects = useMemo(() => {
    return projects.map((proj) => {
      const slaCheck = evaluateProjectDelay(proj.currentStage, proj.stageStartedAt);
      const effectiveDelayed =
        proj.currentStage !== 'PROJECT_COMPLETED' && (proj.isDelayed || slaCheck.isDelayed);
      return {
        ...proj,
        effectiveDelayed,
        daysInStage: slaCheck.daysInStage,
        slaDays: slaCheck.slaDays,
      };
    });
  }, [projects]);

  const filteredProjects = useMemo(() => {
    return enrichedProjects.filter((proj) => {
      if (locationFilter !== 'ALL' && proj.city !== locationFilter) return false;
      if (
        monthFilter !== 'ALL' &&
        proj.completionMonthKey &&
        proj.completionMonthKey !== monthFilter
      ) {
        return false;
      }
      if (projectStatusFilter === 'ACTIVE' && proj.currentStage === 'PROJECT_COMPLETED') {
        return false;
      }
      if (projectStatusFilter === 'DELAYED' && !proj.effectiveDelayed) {
        return false;
      }
      if (projectStatusFilter === 'COMPLETED' && proj.currentStage !== 'PROJECT_COMPLETED') {
        return false;
      }
      return true;
    });
  }, [enrichedProjects, locationFilter, monthFilter, projectStatusFilter]);

  // ==========================================================================
  // 10 Required Executive KPIs
  // ==========================================================================
  const kpis = useMemo(() => {
    const totalLeads = filteredLeads.length;
    const qualifiedLeads = filteredLeads.filter(
      (l) => l.qualificationCategory === 'HIGH' || l.qualificationCategory === 'MEDIUM'
    ).length;
    const highPriorityLeads = filteredLeads.filter(
      (l) => l.qualificationCategory === 'HIGH'
    ).length;
    const lowPriorityLeads = filteredLeads.filter((l) => l.qualificationCategory === 'LOW').length;
    const pendingSurveys = filteredLeads.filter(
      (l) =>
        l.surveyStatus === 'PENDING_REVIEW' ||
        l.surveyStatus === 'CALL_SCHEDULED' ||
        l.surveyStatus === 'SURVEY_SCHEDULED'
    ).length;

    const quotationsGenerated = filteredQuotations.length;
    const approvedQuotations = filteredQuotations.filter(
      (q) => q.status === 'APPROVED' || q.status === 'CONVERTED'
    ).length;

    const activeProjects = filteredProjects.filter(
      (p) => p.currentStage !== 'PROJECT_COMPLETED'
    ).length;
    const completedInstallations = filteredProjects.filter(
      (p) => p.currentStage === 'PROJECT_COMPLETED'
    ).length;
    const delayedProjects = filteredProjects.filter((p) => p.effectiveDelayed).length;

    return [
      { label: 'Total Leads', value: totalLeads, sub: 'Vidarbha enquiries' },
      { label: 'Qualified Leads', value: qualifiedLeads, sub: 'High & Medium score' },
      { label: 'High-Priority Leads', value: highPriorityLeads, sub: 'Survey-ready owners' },
      { label: 'Low-Priority Leads', value: lowPriorityLeads, sub: 'Phone call / NOC' },
      { label: 'Pending Site Surveys', value: pendingSurveys, sub: 'Awaiting field visit' },
      { label: 'Quotations Generated', value: quotationsGenerated, sub: 'Deterministic proposals' },
      { label: 'Approved Quotations', value: approvedQuotations, sub: 'Ready for execution' },
      { label: 'Active Projects', value: activeProjects, sub: 'Stages 1–9 in flight' },
      { label: 'Completed Installations', value: completedInstallations, sub: 'Commissioned plants' },
      {
        label: 'Stuck / Delayed Projects',
        value: delayedProjects,
        sub: 'Exceeding stage SLA',
        alert: delayedProjects > 0,
      },
    ];
  }, [filteredLeads, filteredQuotations, filteredProjects]);

  // ==========================================================================
  // 5 Recharts Visualizations (Restrained Green & Slate Blue Palette)
  // ==========================================================================
  const leadsByMonthData = useMemo(() => {
    const map = new Map<string, { month: string; High: number; Medium: number; Low: number }>();
    filteredLeads.forEach((l) => {
      const m = l.monthKey || '2025-02';
      const entry = map.get(m) || { month: m, High: 0, Medium: 0, Low: 0 };
      if (l.qualificationCategory === 'HIGH') entry.High += 1;
      else if (l.qualificationCategory === 'MEDIUM') entry.Medium += 1;
      else entry.Low += 1;
      map.set(m, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredLeads]);

  const qualificationPieData = useMemo(() => {
    const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    filteredLeads.forEach((l) => {
      counts[l.qualificationCategory] += 1;
    });
    return [
      { name: 'High Priority', key: 'HIGH' as const, value: counts.HIGH },
      { name: 'Medium Priority', key: 'MEDIUM' as const, value: counts.MEDIUM },
      { name: 'Low Priority', key: 'LOW' as const, value: counts.LOW },
    ].filter((d) => d.value > 0);
  }, [filteredLeads]);

  const conversionFunnelData = useMemo(() => {
    const total = filteredLeads.length;
    const billVerified = filteredLeads.filter(
      (l) => l.leadStage !== 'NEW' && l.leadStage !== 'BILL_UPLOADED'
    ).length;
    const qualified = filteredLeads.filter(
      (l) => l.qualificationCategory === 'HIGH' || l.qualificationCategory === 'MEDIUM'
    ).length;
    const quoted = filteredQuotations.length;
    const approved = filteredQuotations.filter(
      (q) => q.status === 'APPROVED' || q.status === 'CONVERTED'
    ).length;
    const converted = filteredProjects.length;

    return [
      { stage: 'Enquiries', count: total },
      { stage: 'Bill Verified', count: billVerified },
      { stage: 'Qualified', count: qualified },
      { stage: 'Quoted', count: quoted },
      { stage: 'Approved', count: approved },
      { stage: 'Projects', count: converted },
    ];
  }, [filteredLeads, filteredQuotations, filteredProjects]);

  const projectCompletionStatusData = useMemo(() => {
    const onTrack = filteredProjects.filter(
      (p) => p.currentStage !== 'PROJECT_COMPLETED' && !p.effectiveDelayed
    ).length;
    const delayed = filteredProjects.filter((p) => p.effectiveDelayed).length;
    const completed = filteredProjects.filter(
      (p) => p.currentStage === 'PROJECT_COMPLETED'
    ).length;

    return [
      { status: 'Active (On SLA)', projects: onTrack, fill: chartColors.medium },
      { status: 'Delayed / Stuck', projects: delayed, fill: chartColors.delayed },
      { status: 'Completed', projects: completed, fill: chartColors.high },
    ];
  }, [filteredProjects, chartColors]);

  const monthlyInstallationPerformanceData = useMemo(() => {
    const map = new Map<string, { month: string; capacityKw: number; installations: number }>();
    const baselineMonths = ['2024-11', '2024-12', '2025-01', '2025-02'];
    baselineMonths.forEach((m) => {
      map.set(m, { month: m, capacityKw: 0, installations: 0 });
    });

    filteredProjects.forEach((p) => {
      const m =
        p.completionMonthKey ||
        (p.stageStartedAt ? p.stageStartedAt.slice(0, 7) : '2025-02');
      const curr = map.get(m) || { month: m, capacityKw: 0, installations: 0 };
      curr.capacityKw = Number((curr.capacityKw + p.systemCapacityKw).toFixed(1));
      curr.installations += 1;
      map.set(m, curr);
    });

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredProjects]);

  const delayedProjectList = useMemo(
    () => filteredProjects.filter((p) => p.effectiveDelayed),
    [filteredProjects]
  );

  const handleResetFilters = () => {
    setMonthFilter('ALL');
    setLocationFilter('ALL');
    setScoreFilter('ALL');
    setProjectStatusFilter('ALL');
  };

  const handleReseed = async () => {
    setReseeding(true);
    try {
      await reseedDemoData();
    } finally {
      setReseeding(false);
    }
  };

  return (
    <AppShell title={dict.navDashboard} breadcrumb="Vidarbha Analytics & EPC Pipeline">
      <div className="space-y-6">
        {/* Top Filter Bar */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
              <Filter className="w-4 h-4 text-sky-700 dark:text-sky-400" />
              <span>{dict.pipelineFiltersTitle}</span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                Nagpur, Kamptee, Wardha, Amravati & Vidarbha Feeders
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <select
                  aria-label="Filter by month"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
                >
                  <option value="ALL">All Months</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <select
                  aria-label="Filter by location"
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
                >
                  <option value="ALL">All Locations</option>
                  {availableCities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <select
                aria-label="Filter by lead score"
                value={scoreFilter}
                onChange={(e) => setScoreFilter(e.target.value as 'ALL' | QualificationCategory)}
                className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
              >
                <option value="ALL">All Lead Scores</option>
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Medium Priority</option>
                <option value="LOW">Low Priority</option>
              </select>

              <select
                aria-label="Filter by project status"
                value={projectStatusFilter}
                onChange={(e) =>
                  setProjectStatusFilter(
                    e.target.value as 'ALL' | 'ACTIVE' | 'DELAYED' | 'COMPLETED'
                  )
                }
                className="text-xs font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-700 dark:focus:border-emerald-500"
              >
                <option value="ALL">All Project States</option>
                <option value="ACTIVE">Active Installations</option>
                <option value="DELAYED">Delayed / Stuck</option>
                <option value="COMPLETED">Completed Plants</option>
              </select>

              {(monthFilter !== 'ALL' ||
                locationFilter !== 'ALL' ||
                scoreFilter !== 'ALL' ||
                projectStatusFilter !== 'ALL') && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1.5 text-xs font-medium text-sky-800 dark:text-sky-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Reset Filters
                </button>
              )}

              {!dataLoading && leads.length === 0 && (
                <button
                  type="button"
                  disabled={reseeding}
                  onClick={() => void handleReseed()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${reseeding ? 'animate-spin' : ''}`} />
                  Load Vidarbha Sample Cohort
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 10 Executive KPI Cards Grid */}
        {dataLoading ? (
          <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 h-[106px] animate-pulse"
              >
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="mt-3 h-7 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
                <div className="mt-2 h-2.5 w-28 bg-slate-100 dark:bg-slate-800/70 rounded" />
              </div>
            ))}
          </section>
        ) : (
          <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className={`rounded-xl p-4 border transition-colors ${
                  kpi.alert
                    ? 'bg-red-50/40 dark:bg-red-950/30 border-red-300 dark:border-red-800/80'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                  {kpi.label}
                </div>
                <div
                  className={`mt-2 text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight ${
                    kpi.alert
                      ? 'text-red-700 dark:text-red-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {kpi.value.toLocaleString('en-IN')}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                  {kpi.sub}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Row 1 Charts: Leads by Month + Lead Qualification Distribution */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Leads by Month
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Monthly solar enquiry intake segmented by deterministic qualification score
                </p>
              </div>
              <Link
                to="/leads"
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 dark:text-sky-300 hover:underline whitespace-nowrap shrink-0"
              >
                Open Lead Table
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="h-64 w-full">
              {leadsByMonthData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={leadsByMonthData}
                    margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: chartColors.axisMuted }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: chartColors.axisMuted }}
                    />
                    <Tooltip contentStyle={tooltipContentStyle} />
                    <Legend wrapperStyle={{ fontSize: '12px', color: chartColors.legendText }} />
                    <Bar dataKey="High" stackId="a" fill={chartColors.high} radius={[0, 0, 0, 0]} />
                    <Bar
                      dataKey="Medium"
                      stackId="a"
                      fill={chartColors.medium}
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar dataKey="Low" stackId="a" fill={chartColors.low} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>No monthly enquiries match the active filter criteria.</span>
                  <Link
                    to="/enquiry/new"
                    className="font-semibold text-emerald-900 dark:text-emerald-400 hover:underline whitespace-nowrap"
                  >
                    Submit New Solar Enquiry
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Lead Qualification Distribution
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Share of High, Medium & Low priority enquiries across selected region
              </p>
            </div>
            <div className="h-64 w-full">
              {qualificationPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={qualificationPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="48%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={3}
                      stroke={isDark ? '#0F172A' : '#FFFFFF'}
                    >
                      {qualificationPieData.map((entry) => (
                        <Cell key={entry.key} fill={scoreColorMap[entry.key]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipContentStyle} />
                    <Legend wrapperStyle={{ fontSize: '12px', color: chartColors.legendText }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                  No leads match the active filter criteria.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Row 2 Charts: Quotation Conversion Funnel + Project Completion Status + Monthly Installation Performance */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Quotation Conversion Funnel
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Progression from raw enquiry to approved solar project
              </p>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={conversionFunnelData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 12, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chartColors.grid}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: chartColors.axisMuted }}
                  />
                  <YAxis
                    type="category"
                    dataKey="stage"
                    width={78}
                    tick={{ fontSize: 11, fill: chartColors.axisPrimary }}
                  />
                  <Tooltip contentStyle={tooltipContentStyle} />
                  <Bar
                    dataKey="count"
                    name="Records"
                    fill={chartColors.funnelBar}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Project Completion Status
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active on-SLA installations vs delayed & commissioned plants
              </p>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={projectCompletionStatusData}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis dataKey="status" tick={{ fontSize: 11, fill: chartColors.axisPrimary }} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: chartColors.axisMuted }}
                  />
                  <Tooltip contentStyle={tooltipContentStyle} />
                  <Bar dataKey="projects" name="Projects" radius={[4, 4, 0, 0]}>
                    {projectCompletionStatusData.map((entry) => (
                      <Cell key={entry.status} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Monthly Installation Performance
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deployed & scheduled rooftop solar capacity (kW) by month
              </p>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={monthlyInstallationPerformanceData}
                  margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: chartColors.axisMuted }} />
                  <YAxis tick={{ fontSize: 11, fill: chartColors.axisMuted }} />
                  <Tooltip contentStyle={tooltipContentStyle} />
                  <Area
                    type="monotone"
                    dataKey="capacityKw"
                    name="Capacity (kW)"
                    stroke={chartColors.areaStroke}
                    fill={chartColors.areaFill}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Delayed & Stuck Projects Operational Watchlist */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {dict.delayedWatchlistTitle}
              </h2>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                ·
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {delayedProjectList.length} requiring escalation
              </span>
            </div>
            <Link
              to="/projects"
              className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 dark:text-sky-300 hover:underline whitespace-nowrap shrink-0"
            >
              Manage All Projects
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {delayedProjectList.length === 0 ? (
            <div className="p-6 text-sm text-slate-600 dark:text-slate-400">
              All active Vidarbha rooftop installations are operating within their stage SLA window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <th className="py-3 px-5">Project</th>
                    <th className="py-3 px-4">Customer & Location</th>
                    <th className="py-3 px-4">Capacity</th>
                    <th className="py-3 px-4">Stuck Stage</th>
                    <th className="py-3 px-4">Bottleneck / Delay Reason</th>
                    <th className="py-3 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {delayedProjectList.map((proj) => {
                    const stageLabel =
                      PROJECT_STAGES.find((s) => s.code === proj.currentStage)?.label ||
                      proj.currentStage;
                    return (
                      <tr
                        key={proj.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 px-5 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {proj.projectNumber}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {proj.customerName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {proj.city} · {proj.pincode}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {proj.systemCapacityKw} kW
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-red-700 dark:text-red-400">
                            Stage {proj.stageIndex}/10 · {stageLabel}
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                            {proj.daysInStage}d in stage (SLA {proj.slaDays}d)
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300 max-w-sm">
                          {proj.delayReason || proj.pendingActivities}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <Link
                            to={`/projects?projectId=${encodeURIComponent(proj.id)}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-emerald-950 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors whitespace-nowrap shrink-0"
                          >
                            Resolve Stage
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </Link>
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
