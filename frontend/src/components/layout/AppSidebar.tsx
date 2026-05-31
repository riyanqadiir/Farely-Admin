import { Link, NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LogOut, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface SidebarNavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

interface AppSidebarProps {
  pathname: string;
  user: { avatar?: string; fullName?: string; role?: string } | null;
  navigation: SidebarNavItem[];
  secondaryNavigation: SidebarNavItem[];
  onLogout: () => void;
  /** Run after navigating (e.g. close mobile overlay); not used for logout except via button handler */
  afterNavAction?: () => void;
  showClose?: boolean;
  onClose?: () => void;
}

/**
 * Single sidebar body: core nav, secondary, sign-out, profile (Farely Admin).
 */
export function AppSidebar({
  pathname,
  user,
  navigation,
  secondaryNavigation,
  onLogout,
  afterNavAction,
  showClose,
  onClose,
}: AppSidebarProps) {
  const afterNav = () => afterNavAction?.();

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-emerald-100 bg-white/95 backdrop-blur-xl">
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-5 sm:px-6 border-b border-emerald-50">
        <Link to="/" className="flex min-w-0 items-center gap-2" onClick={afterNav}>
          <div className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold text-lg sm:text-xl italic shadow-md shadow-emerald-200">
            F
          </div>
          <span className="font-bold text-base sm:text-lg tracking-tight text-emerald-900 truncate">
            Farely<span className="text-emerald-600">Admin</span>
          </span>
        </Link>
        {showClose && onClose ? (
          <button type="button" onClick={onClose} className="-m-2.5 shrink-0 p-2.5 text-emerald-700" aria-label="Close menu">
            <X className="h-6 w-6" />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-4">
          <ul className="flex min-h-full flex-col gap-6 pb-6">
            <li>
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest px-2 mb-2">Core</div>
              <ul className="-mx-2 space-y-1">
                {navigation.map((item) => (
                  <li key={item.name}>
                    <NavLink
                      to={item.href}
                      onClick={afterNav}
                      className={({ isActive }) =>
                        cn(
                          'group flex gap-x-3 rounded-xl p-2.5 text-sm font-semibold leading-6 transition-all',
                          isActive
                            ? 'bg-emerald-100/70 text-emerald-700 shadow-sm border-r-4 border-emerald-600 rounded-r-none pr-4'
                            : 'text-emerald-900/50 hover:text-emerald-700 hover:bg-emerald-50/50',
                        )
                      }
                    >
                      <item.icon
                        className={cn(
                          'h-5 w-5 shrink-0 transition-colors',
                          pathname === item.href ? 'text-emerald-600' : 'text-emerald-300 group-hover:text-emerald-600',
                        )}
                      />
                      <span className="truncate">{item.name}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>

            <li className="mt-auto">
              <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest px-2 mb-2">Other</div>
              <ul className="-mx-2 space-y-1">
                {secondaryNavigation.map((item) => (
                  <li key={item.name}>
                    <NavLink
                      to={item.href}
                      onClick={afterNav}
                      className={({ isActive }) =>
                        cn(
                          'group flex gap-x-3 rounded-xl p-2.5 text-sm font-semibold leading-6 transition-all',
                          isActive ? 'bg-emerald-100/70 text-emerald-700 shadow-sm' : 'text-emerald-900/50 hover:text-emerald-700 hover:bg-emerald-50/50',
                        )
                      }
                    >
                      <item.icon className="h-5 w-5 shrink-0 text-emerald-300 group-hover:text-emerald-700" />
                      <span className="truncate">{item.name}</span>
                    </NavLink>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="group -mx-2 flex w-full gap-x-3 rounded-xl p-2.5 text-left text-sm font-semibold leading-6 text-emerald-900/50 hover:text-red-600 hover:bg-red-50/50 transition-all"
                    onClick={() => {
                      afterNav();
                      onLogout();
                    }}
                  >
                    <LogOut className="h-5 w-5 shrink-0 text-emerald-300 group-hover:text-red-600" />
                    Sign Out
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </nav>

        <div className="shrink-0 border-t border-emerald-100 px-4 py-4 flex items-center gap-3 bg-white/80">
          <div className="w-10 h-10 rounded-full border-2 border-emerald-200 p-0.5 bg-emerald-50 overflow-hidden shrink-0">
            {user?.avatar ? (
              <img
                className="h-full w-full rounded-full object-cover"
                src={user.avatar}
                alt={user.fullName ?? 'Profile'}
              />
            ) : (
              <div className="h-full w-full rounded-full flex items-center justify-center text-emerald-700 text-sm font-bold">
                {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-emerald-900 truncate">{user?.fullName ?? 'Signed in'}</div>
            <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-tighter truncate">{user?.role}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
