import { useEffect, useMemo, useState } from 'react';
import { useLocation, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  FileText,
  Inbox,
  Settings,
  Menu,
  Search,
  Bell,
  Star,
  Users,
  UserCog,
  Navigation,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../api/mocks';
import { cn, formatDate } from '../../lib/utils';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { AppSidebar } from './AppSidebar';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Trip routes', href: '/rides/journeys', icon: Navigation },
  { name: 'Ride logs', href: '/rides/logs', icon: FileText },
  { name: 'Hotspots', href: '/rides/hotspots', icon: Map },
  { name: 'Mobile Users', href: '/users/mobile', icon: Users },
  { name: 'Support Inbox', href: '/support/inbox', icon: Inbox },
  { name: 'Feedback', href: '/feedback', icon: Star },
];

export function Shell() {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  const sidebarExpanded = isDesktop ? !desktopCollapsed : mobileOpen;

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: supportData } = useQuery({
    queryKey: ['shell-notifications-support'],
    queryFn: () => api.support.getThreads({ limit: 8 }),
    refetchInterval: 30000,
  });
  const { data: feedbackData } = useQuery({
    queryKey: ['shell-notifications-feedback'],
    queryFn: () => api.feedback.list({ limit: 8 }),
    refetchInterval: 45000,
  });
  const { data: activeUsersData } = useQuery({
    queryKey: ['shell-notifications-active-users'],
    queryFn: () => api.metrics.getActiveUsers({ hours: 24 }),
    refetchInterval: 60000,
  });

  const notifications = useMemo(() => {
    const items: Array<{ id: string; title: string; body: string; route: string; ts?: string }> = [];
    const threads = supportData?.success ? supportData.data.items : [];
    const openThreads = threads.filter((t) => t.status === 'open').slice(0, 3);
    openThreads.forEach((t) =>
      items.push({
        id: `thread:${t.id}`,
        title: 'Open support thread',
        body: `${t.customer.name || t.customer.email || 'User'} · ${t.subject}`,
        route: '/support/inbox',
        ts: t.lastMessageAt,
      }),
    );

    const feedbacks = feedbackData?.success ? feedbackData.data.items : [];
    const recentFeedback = feedbacks
      .filter((f) => Date.now() - new Date(f.createdAt).getTime() < 24 * 60 * 60 * 1000)
      .slice(0, 2);
    recentFeedback.forEach((f) =>
      items.push({
        id: `feedback:${f.id}`,
        title: `New ${f.stars}★ feedback`,
        body: (f.appExperience || f.timeSavingNote || 'User left feedback').slice(0, 90),
        route: '/feedback',
        ts: f.createdAt,
      }),
    );

    const active = activeUsersData?.success ? activeUsersData.data.displayCount : 0;
    items.push({
      id: 'active-users',
      title: 'Active users (24h)',
      body: `${active} users active in the last 24 hours`,
      route: '/dashboard',
    });
    return items.slice(0, 8);
  }, [supportData, feedbackData, activeUsersData]);

  const unreadCount = notifications.filter((n) => n.id !== 'active-users').length;
  const secondaryNavigation = [
    ...(user?.role === 'super_admin' ? [{ name: 'Admin Users', href: '/settings/admin-users', icon: UserCog }] : []),
    { name: 'Settings', href: '/settings/profile', icon: Settings },
  ];

  const backdropVisible = !isDesktop && mobileOpen;

  const toggleSidebar = () => {
    if (isDesktop) setDesktopCollapsed((c) => !c);
    else setMobileOpen((o) => !o);
  };

  const closeMobile = () => setMobileOpen(false);
  const afterNav = () => {
    if (!isDesktop) closeMobile();
  };

  return (
    <div className="min-h-screen bg-[#f0fdf4] selection:bg-emerald-200 overflow-hidden isolate">
      {/* Decorative background blurs */}
      <div className="fixed -top-24 -right-24 w-[500px] h-[500px] bg-emerald-200 rounded-full blur-[120px] opacity-20 -z-10" />
      <div className="fixed top-1/2 -left-24 w-[400px] h-[400px] bg-teal-100 rounded-full blur-[100px] opacity-20 -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[300px] h-[300px] bg-emerald-100 rounded-full blur-[80px] opacity-20 -z-10" />

      {backdropVisible ? (
        <button
          type="button"
          className="fixed inset-0 z-[45] cursor-default bg-emerald-950/40 backdrop-blur-md lg:hidden"
          aria-label="Close menu"
          onClick={closeMobile}
        />
      ) : null}

      {/* Single sidebar for all breakpoints */}
      <aside
        id="farely-admin-sidebar"
        aria-hidden={!sidebarExpanded}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col shadow-xl shadow-emerald-900/10 transition-transform duration-300 ease-out lg:shadow-none lg:rounded-none',
          sidebarExpanded ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <AppSidebar
          pathname={location.pathname}
          user={user}
          navigation={navigation}
          secondaryNavigation={secondaryNavigation}
          onLogout={logout}
          afterNavAction={afterNav}
          showClose={!isDesktop}
          onClose={closeMobile}
        />
      </aside>

      <div className={cn('min-h-screen min-w-0 transition-[padding] duration-300 ease-out', isDesktop && !desktopCollapsed ? 'pl-72' : '')}>
        <div className="sticky top-0 z-40 flex h-16 min-w-0 shrink-0 items-center gap-x-2 border-b border-emerald-100 bg-white/40 backdrop-blur-xl px-3 sm:gap-x-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={sidebarExpanded}
            aria-controls="farely-admin-sidebar"
            className={cn(
              'shrink-0 flex-shrink-0 -m-2.5 p-2.5 text-emerald-700 hover:bg-emerald-50 rounded-lg outline-none ring-emerald-500/30 focus-visible:ring-4',
              isDesktop && !desktopCollapsed && 'rounded-lg border border-emerald-100/80 bg-white/70',
            )}
            title={isDesktop ? (desktopCollapsed ? 'Expand navigation' : 'Collapse navigation') : 'Menu'}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="h-6 w-px shrink-0 bg-emerald-100" aria-hidden />

          <div className="flex min-w-0 flex-1 gap-x-2 self-stretch sm:gap-x-4 lg:gap-x-6">
            <div className="flex min-w-0 flex-1 items-center">
              <div className="relative min-w-0 w-full max-w-md">
                <Search className="pointer-events-none absolute inset-y-0 left-0 h-full w-5 text-emerald-300 ml-3 sm:ml-4" />
                <input
                  className="block h-10 w-full rounded-full border-none bg-white/50 pl-10 sm:pl-11 pr-2 sm:pr-3 text-xs sm:text-sm placeholder:text-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all shadow-sm"
                  placeholder="Ask anything..."
                  type="search"
                  aria-label="Search"
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-x-2 sm:gap-x-4 lg:gap-x-6">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((p) => !p)}
                  className="-m-2.5 shrink-0 flex-shrink-0 p-2.5 text-emerald-400 hover:text-emerald-600 transition-colors relative"
                  aria-expanded={notificationsOpen}
                >
                  <Bell className="h-6 w-6" />
                  {unreadCount > 0 ? (
                    <span className="absolute top-2 right-1 min-w-4 h-4 px-1 text-[10px] leading-4 text-white text-center bg-red-500 rounded-full border border-white shadow-sm">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  ) : null}
                </button>
                {notificationsOpen ? (
                  <div className="absolute right-0 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-xl z-50">
                    <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">Notifications</p>
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs text-slate-500 hover:text-slate-700 shrink-0"
                      >
                        Close
                      </button>
                    </div>
                    <div className="max-h-80 overflow-auto">
                      {notifications.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-slate-500">No notifications right now.</p>
                      ) : (
                        notifications.map((n) => (
                          <button
                            type="button"
                            key={n.id}
                            onClick={() => {
                              setNotificationsOpen(false);
                              navigate(n.route);
                            }}
                            className="w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-emerald-50/40 transition-colors"
                          >
                            <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                            <p className="text-xs text-slate-600 mt-1">{n.body}</p>
                            {n.ts ? <p className="text-[10px] text-slate-400 mt-1">{formatDate(n.ts)}</p> : null}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <main className="py-8 px-4 sm:px-6 lg:px-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
