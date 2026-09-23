import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { NAV } from "./nav";
import { Mark } from "./Mark";
import { UpdatePrompt } from "./UpdatePrompt";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-casing">
      <div className="flex items-center gap-2.5 px-5 pt-6 pb-5">
        <Mark className="size-8" />
        <span className="text-[1.0625rem] font-bold tracking-[-0.02em] text-slate-900">Aurum</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map(({ to, label, icon: Icon, phase, group }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150",
                group && "mt-4",
                isActive ? "bg-face text-slate-900 shadow-key" : "text-slate-600 hover:bg-slate-900/5 hover:text-slate-900",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={clsx("size-4 shrink-0", isActive ? "text-slate-900" : "text-slate-500")} strokeWidth={isActive ? 2.25 : 2} />
                <span className="flex-1">{label}</span>
                {phase && <span className="text-[11px] font-medium text-slate-500">brzy</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mx-3 mb-3 rounded-lg px-3 py-3">
        <div className="grille mb-3 h-5 rounded-sm" aria-hidden />
        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
          <span className="lamp mt-1 bg-income" aria-hidden />
          Data jsou uložena pouze v tomto prohlížeči.
        </p>
      </div>
    </div>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-full items-start">
      <aside className="sticky top-0 hidden h-screen w-58 shrink-0 border-r border-slate-900/8 lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/45" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-[8px_0_32px_-8px_rgb(20_20_18/0.35)]">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-900/8 bg-casing/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label={mobileOpen ? "Zavřít menu" : "Otevřít menu"}
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex size-9 items-center justify-center rounded-full bg-face text-slate-700 shadow-key ring-1 ring-slate-300/70"
          >
            {mobileOpen ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
          </button>
          <Mark className="size-6" />
          <span className="font-bold tracking-[-0.02em]">Aurum</span>
        </div>
        <main key={pathname} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
          <Outlet />
        </main>
        <UpdatePrompt />
      </div>
    </div>
  );
}
