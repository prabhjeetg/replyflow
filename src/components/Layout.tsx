import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Contact2,
  FlaskConical,
  Link2,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  PauseCircle,
  PlayCircle,
  ScrollText,
  Settings,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { t } from '../i18n/translations';
import type { AppNotification, Language, ThemeMode } from '../types';
import { OfflineIndicator } from './OfflineIndicator';
import { PWAInstallButton } from './PWAInstallButton';

export type PageId =
  | 'analytics'
  | 'rules'
  | 'testMode'
  | 'logs'
  | 'leads'
  | 'contacts'
  | 'accounts'
  | 'settings'
  | 'help';

interface LayoutProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
  language: Language;
  onToggleLanguage: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  pausedAll: boolean;
  onTogglePauseAll: () => void;
  notifications: AppNotification[];
  onMarkNotificationRead: (id: string) => void;
  userEmail?: string;
  onSignOut: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activePage,
  onNavigate,
  language,
  onToggleLanguage,
  theme,
  onToggleTheme,
  pausedAll,
  onTogglePauseAll,
  notifications,
  onMarkNotificationRead,
  userEmail,
  onSignOut,
  children,
}) => {
  const copy = t(language);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const navItems: Array<{ id: PageId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'analytics', label: copy.nav.analytics, icon: BarChart3 },
    { id: 'rules', label: copy.nav.rules, icon: ListChecks },
    { id: 'testMode', label: copy.nav.testMode, icon: FlaskConical },
    { id: 'logs', label: copy.nav.logs, icon: ScrollText },
    { id: 'leads', label: copy.nav.leads, icon: UserCheck },
    { id: 'contacts', label: copy.nav.contacts, icon: Contact2 },
    { id: 'accounts', label: copy.nav.accounts, icon: Link2 },
    { id: 'settings', label: copy.nav.settings, icon: Settings },
    { id: 'help', label: copy.nav.help, icon: BookOpen },
  ];

  const primaryMobileTabs: PageId[] = ['analytics', 'rules', 'testMode', 'logs'];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 z-30">
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            {copy.appName}
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onToggleLanguage}
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              {copy.header.languageLabel}
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle dark mode"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate">{userEmail || 'Creator Account'}</span>
            <button
              type="button"
              onClick={onSignOut}
              title={copy.header.signOut}
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{copy.header.signOut}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top Header */}
        <header className="sticky top-0 z-20 h-14 lg:h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              {copy.appName}
            </span>
            <span className="hidden lg:inline text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
              {navItems.find((i) => i.id === activePage)?.label}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton />

            {notifications.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotifOpen(!notifOpen)}
                  aria-label="Notifications"
                  className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-rose-600 text-white rounded-md">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg p-3 z-50">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">Alerts</span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => onMarkNotificationRead(n.id)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer ${
                            n.read
                              ? 'border-slate-100 dark:border-slate-800 text-slate-500'
                              : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <div className="font-semibold">{n.title}</div>
                          <div className="mt-0.5 text-slate-600 dark:text-slate-400">{n.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Global Kill Switch */}
            <button
              type="button"
              onClick={onTogglePauseAll}
              className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
                pausedAll
                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                  : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90'
              }`}
            >
              {pausedAll ? (
                <>
                  <PlayCircle className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{copy.header.resumeAll}</span>
                  <span className="sm:hidden">Resume</span>
                </>
              ) : (
                <>
                  <PauseCircle className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{copy.header.pauseAll}</span>
                  <span className="sm:hidden">Pause All</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Global Kill Switch Banner when active */}
        {pausedAll && (
          <div className="bg-rose-600 text-white px-4 lg:px-8 py-2.5 text-xs font-medium flex items-center justify-between">
            <span>{copy.header.pausedStatus}</span>
            <button
              type="button"
              onClick={onTogglePauseAll}
              className="underline font-semibold hover:opacity-90 whitespace-nowrap"
            >
              {copy.header.resumeAll}
            </button>
          </div>
        )}

        {/* Main Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Thumb Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe">
        <div className="grid grid-cols-5 h-16 items-center">
          {primaryMobileTabs.map((id) => {
            const item = navItems.find((n) => n.id === id)!;
            const Icon = item.icon;
            const active = activePage === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onNavigate(id);
                }}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-1 px-1 ${
                  active
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-1 px-1 ${
              !primaryMobileTabs.includes(activePage)
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Sheet Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end">
          <div className="w-full rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-5 pb-safe max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-semibold">{copy.appName}</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`min-h-[48px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onToggleLanguage}
                className="min-h-[44px] flex-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                {copy.header.languageLabel}
              </button>
              <button
                type="button"
                onClick={onToggleTheme}
                className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[44px] px-4 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-medium"
              >
                {copy.header.signOut}
              </button>
            </div>
          </div>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
};
