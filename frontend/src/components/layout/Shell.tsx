import { ReactNode, useState } from 'react';
import { NavLink, Link, useLocation, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Map, 
  FileText, 
  Inbox, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Search,
  Bell,
  ArrowRightLeft,
  Star,
  Users,
  UserCog
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Ride Logs', href: '/rides/logs', icon: FileText },
  { name: 'Hotspots', href: '/rides/hotspots', icon: Map },
  { name: 'Mobile Users', href: '/users/mobile', icon: Users },
  { name: 'Support Inbox', href: '/support/inbox', icon: Inbox },
  { name: 'Feedback', href: '/feedback', icon: Star },
];

export function Shell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const secondaryNavigation = [
    ...(user?.role === 'super_admin' ? [{ name: 'Admin Users', href: '/settings/admin-users', icon: UserCog }] : []),
    { name: 'Settings', href: '/settings/profile', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#f0fdf4] selection:bg-emerald-200 overflow-hidden isolate">
      {/* Decorative background blurs */}
      <div className="fixed -top-24 -right-24 w-[500px] h-[500px] bg-emerald-200 rounded-full blur-[120px] opacity-20 -z-10" />
      <div className="fixed top-1/2 -left-24 w-[400px] h-[400px] bg-teal-100 rounded-full blur-[100px] opacity-20 -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[300px] h-[300px] bg-emerald-100 rounded-full blur-[80px] opacity-20 -z-10" />

      {/* Mobile sidebar */}
      <div className={cn(
        "fixed inset-0 z-50 flex lg:hidden transition-opacity duration-300 ease-linear",
        sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <div className="fixed inset-0 bg-emerald-950/40 backdrop-blur-md" onClick={() => setSidebarOpen(false)} />
        <div className={cn(
          "relative flex flex-col w-full max-w-xs flex-1 bg-white/90 backdrop-blur-2xl transition duration-300 ease-in-out transform border-r border-emerald-100",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex h-16 items-center justify-between px-6 border-b border-emerald-50">
             <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-600 rounded flex items-center justify-center text-white font-bold text-xl italic">F</div>
              <span className="font-bold text-xl tracking-tight text-emerald-900">Farely</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5 text-emerald-700">
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col p-4">
            <ul className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul className="-mx-2 space-y-1">
                  {navigation.map((item) => (
                    <li key={item.name}>
                      <NavLink
                        to={item.href}
                        className={({ isActive }) => cn(
                          "group flex gap-x-3 rounded-xl p-2.5 text-sm font-semibold leading-6 transition-all",
                          isActive ? "bg-emerald-100/80 text-emerald-700 shadow-sm" : "text-emerald-900/60 hover:text-emerald-700 hover:bg-emerald-50/50"
                        )}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <item.icon className="h-6 w-6 shrink-0" />
                        {item.name}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-emerald-100 bg-white/40 backdrop-blur-xl px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl italic shadow-lg shadow-emerald-200">F</div>
              <span className="font-bold text-xl tracking-tight text-emerald-900">Farely<span className="text-emerald-600">Admin</span></span>
            </Link>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul className="flex flex-1 flex-col gap-y-7">
               <li>
                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest px-2 mb-2">Core</div>
                <ul className="-mx-2 space-y-1">
                  {navigation.map((item) => (
                    <li key={item.name}>
                      <NavLink
                        to={item.href}
                        className={({ isActive }) => cn(
                          "group flex gap-x-3 rounded-xl p-2.5 text-sm font-semibold leading-6 transition-all",
                          isActive 
                            ? "bg-emerald-100/60 text-emerald-700 shadow-sm border-r-4 border-emerald-600 rounded-r-none" 
                            : "text-emerald-900/50 hover:text-emerald-700 hover:bg-emerald-50/50"
                        )}
                      >
                        <item.icon className={cn("h-5 w-5 shrink-0 transition-colors", location.pathname === item.href ? "text-emerald-600" : "text-emerald-300 group-hover:text-emerald-600")} />
                        {item.name}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </li>
              <li className="mt-auto">
                <ul className="-mx-2 space-y-1">
                  {secondaryNavigation.map((item) => (
                    <li key={item.name}>
                      <NavLink
                        to={item.href}
                        className={({ isActive }) => cn(
                          "group flex gap-x-3 rounded-xl p-2.5 text-sm font-semibold leading-6 text-emerald-900/50 hover:text-emerald-700 hover:bg-emerald-50/50"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0 text-emerald-300 group-hover:text-emerald-700" />
                        {item.name}
                      </NavLink>
                    </li>
                  ))}
                  <li>
                    <button
                      onClick={logout}
                      className="group -mx-2 flex w-full gap-x-3 rounded-xl p-2.5 text-sm font-semibold leading-6 text-emerald-900/50 hover:text-red-600 hover:bg-red-50/50 transition-all"
                    >
                      <LogOut className="h-5 w-5 shrink-0 text-emerald-300 group-hover:text-red-600" />
                      Sign Out
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
          </nav>
           <div className="pt-4 border-t border-emerald-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-200 p-0.5">
                 <img
                  className="h-full w-full rounded-full object-cover"
                  src={user?.avatar}
                  alt={user?.fullName}
                />
              </div>
              <div>
                 <div className="text-sm font-bold text-emerald-900">{user?.fullName}</div>
                 <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-tighter">{user?.role}</div>
              </div>
           </div>
        </div>
      </div>

      <div className="lg:pl-72">
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-emerald-100 bg-white/40 backdrop-blur-xl px-4 sm:gap-x-6 sm:px-6 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} className="-m-2.5 p-2.5 text-emerald-700 lg:hidden">
            <Menu className="h-6 w-6" />
          </button>
          
          <div className="h-6 w-px bg-emerald-100 lg:hidden" />

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1 items-center">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute inset-y-0 left-0 h-full w-5 text-emerald-300 ml-4" />
                <input
                  className="block h-10 w-full rounded-full border border-emerald-100 bg-white/50 pl-11 pr-3 text-sm placeholder:text-emerald-400 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all border-none shadow-sm"
                  placeholder="Ask anything..."
                  type="search"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              <button className="-m-2.5 p-2.5 text-emerald-400 hover:text-emerald-600 transition-colors relative">
                <Bell className="h-6 w-6" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white shadow-sm" />
              </button>
            </div>
          </div>
        </div>

        <main className="py-8 px-4 sm:px-6 lg:px-8">
           <Outlet />
        </main>
      </div>
    </div>
  );
}
