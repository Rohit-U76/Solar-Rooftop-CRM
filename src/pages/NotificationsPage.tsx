import React, { useMemo, useState } from 'react';
import { Bell, CheckCheck, MessageSquare, Smartphone } from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { useAuthData } from '../context/AuthDataContext.tsx';
import { t } from '../lib/i18n.ts';
import type { NotificationDoc } from '../types/domain.ts';

export function NotificationsPage() {
  const { notifications, unreadCount, language, markNotificationRead } = useAuthData();
  const dict = t(language);

  const [channelFilter, setChannelFilter] = useState<'ALL' | NotificationDoc['channel']>('ALL');

  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (channelFilter !== 'ALL' && n.channel !== channelFilter) return false;
      return true;
    });
  }, [notifications, channelFilter]);

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.isRead);
    for (const item of unread) {
      await markNotificationRead(item.id);
    }
  };

  return (
    <AppShell title={dict.navNotifications} breadcrumb="Customer & EPC Communication Log">
      <div className="space-y-5">
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-950">
          <strong>Simulation Disclosure:</strong> Outbound WhatsApp and SMS alerts shown below are
          recorded in-app as <strong>Simulations</strong> for demonstration and audit purposes. No
          external telecom or WhatsApp gateway messages are transmitted.
        </div>

        <section className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'ALL', label: `All Logs (${notifications.length})` },
                { key: 'WHATSAPP_SIMULATION', label: 'Simulated WhatsApp' },
                { key: 'SMS_SIMULATION', label: 'Simulated SMS' },
                { key: 'IN_APP', label: 'In-App Alerts' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setChannelFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  channelFilter === tab.key
                    ? 'bg-emerald-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark All Read ({unreadCount})
            </button>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No notifications recorded for this channel filter.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon =
                item.channel === 'WHATSAPP_SIMULATION'
                  ? MessageSquare
                  : item.channel === 'SMS_SIMULATION'
                    ? Smartphone
                    : Bell;

              return (
                <div
                  key={item.id}
                  className={`p-4 sm:p-5 flex items-start justify-between gap-4 ${
                    item.isRead ? 'bg-white' : 'bg-emerald-50/30'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-emerald-900">
                          {item.channel === 'WHATSAPP_SIMULATION'
                            ? 'WhatsApp (Simulation)'
                            : item.channel === 'SMS_SIMULATION'
                              ? 'SMS (Simulation)'
                              : 'In-App Notification'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{item.referenceCode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{item.maskedRecipientPhone}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                      <p className="text-xs text-slate-600 leading-relaxed">{item.message}</p>
                    </div>
                  </div>

                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={() => void markNotificationRead(item.id)}
                      className="px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Mark Read
                    </button>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>
    </AppShell>
  );
}
