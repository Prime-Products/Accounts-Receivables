import { useAuth } from "@/_core/hooks/useAuth";
import MentionsInbox from "@/components/MentionsInbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import GlobalSearch from "@/components/GlobalSearch";
import { trpc } from "@/lib/trpc";
import { scrollPageToTop } from "@/lib/scrollToTop";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BarChart3,
  ChevronDown,
  Contact,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  LogOut,
  PanelLeft,
  Phone,
  Settings,
  Ship,
  TrendingUp,
  Users,
  UserCog,
  Banknote,
} from "lucide-react";
import {
  Briefcase,
  FileCheck2,
  Package,
  ShieldCheck,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

/*
 * Navigation is grouped by what the user is trying to do, not by data type:
 * chasing money (Collections), knowing who and what we deal with (CRM), and
 * running the operation (Management). Dashboard stands alone above the groups
 * because it is the landing view, not a category.
 */
const navSections: { label: string | null; items: { icon: typeof LayoutDashboard; label: string; path: string }[] }[] = [
  {
    label: null,
    items: [{ icon: LayoutDashboard, label: "Dashboard", path: "/" }],
  },
  {
    label: "Collections",
    items: [
      { icon: Users, label: "Collections Desk", path: "/customers" },
      { icon: FileText, label: "Invoices", path: "/invoices" },
      // "Remittances" covers every instrument the customer pays with: bank wire, cheque, credit card.
      { icon: Banknote, label: "Remittances", path: "/remittances" },
      // Tasks are part of the daily chase (follow-ups, promises, help requests),
      // so they belong next to the desk rather than under Management.
      { icon: ListChecks, label: "Tasks", path: "/tasks" },
    ],
  },
  {
    label: "CRM",
    items: [
      { icon: Contact, label: "Address Book", path: "/address-book" },
      { icon: Ship, label: "Vessels", path: "/vessels" },
    ],
  },
  {
    label: "Prime 247",
    items: [
      { icon: Briefcase, label: "Overview", path: "/ops" },
      { icon: FileCheck2, label: "Contracts", path: "/ops/contracts" },
      // Same destination as CRM → Vessels. Contract work starts from the fleet just as
      // often as from a contract, so the shortcut is repeated inside this section
      // instead of forcing a jump back up to CRM.
      { icon: Ship, label: "Vessels", path: "/vessels" },
      { icon: Package, label: "Equipment", path: "/ops/assets" },
      { icon: ShieldCheck, label: "Certificates", path: "/ops/certificates" },
      { icon: Settings, label: "Pricelist", path: "/ops/catalog" },
    ],
  },
  {
    label: "Management",
    items: [
      { icon: BarChart3, label: "Reports", path: "/reports" },
      { icon: UserCog, label: "Team", path: "/team" },
      { icon: Settings, label: "Settings", path: "/settings" },
    ],
  },
];

/**
 * Flat list for lookups (active item, page title) — the grouping is presentational.
 * A path may appear in more than one section (Vessels lives under both CRM and
 * Prime 247); lookups take the first match, which is enough because duplicates
 * share the same label.
 */
const menuItems = navSections.flatMap(s => s.items);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const SIDEBAR_SECTIONS_KEY = "sidebar-open-sections";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

/** Section labels that can be toggled (the ungrouped Dashboard row is always shown). */
const collapsibleSectionLabels = navSections
  .map(s => s.label)
  .filter((l): l is string => Boolean(l));

/*
 * Route matching. A bare `startsWith` is wrong for nested sections: "/ops" is a prefix of
 * "/ops/contracts", so the section index would light up on every child page and two menu
 * rows looked active at once. We require either an exact match or a "/" boundary, so
 * "/ops" only claims "/ops" itself while "/ops/contracts" still claims "/ops/contracts/1".
 */
export function matchesNavPath(currentPath: string, itemPath: string): boolean {
  if (itemPath === "/") return currentPath === "/";
  if (currentPath === itemPath) return true;
  // Index routes ("/ops") must not swallow their children — they get an exact match only.
  const isIndexRoute = itemPath.split("/").filter(Boolean).length === 1;
  if (isIndexRoute) return false;
  return currentPath.startsWith(`${itemPath}/`);
}

/** Which section a given route belongs to, so the current page is never hidden. */
function sectionOfPath(path: string): string | null {
  for (const section of navSections) {
    if (!section.label) continue;
    const match = section.items.some(item => matchesNavPath(path, item.path));
    if (match) return section.label;
  }
  return null;
}

function readOpenSections(): string[] {
  try {
    const raw = localStorage.getItem(SIDEBAR_SECTIONS_KEY);
    if (!raw) return collapsibleSectionLabels; // First visit: everything visible.
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return collapsibleSectionLabels;
    // Drop labels that no longer exist so a rename cannot resurrect a dead section.
    return parsed.filter((l: unknown): l is string =>
      typeof l === "string" && collapsibleSectionLabels.includes(l),
    );
  } catch {
    return collapsibleSectionLabels;
  }
}

/**
 * Shared row styling for a navigation entry. The active row gets a solid accent
 * background plus a left accent bar, so exactly one row reads as "you are here"
 * without relying on colour alone.
 */
const NAV_ROW = "relative h-8 rounded-md px-2 text-sm font-normal transition-colors";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Sign in to continue
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Access to this dashboard requires authentication. Continue to launch the login flow.
            </p>
          </div>
          <Button
            onClick={() => startLogin()}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar, isMobile: sidebarIsMobile, setOpenMobile } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => matchesNavPath(location, item.path));
  const activeSection = sectionOfPath(location);
  const [openSections, setOpenSections] = useState<string[]>(readOpenSections);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_SECTIONS_KEY, JSON.stringify(openSections));
  }, [openSections]);

  const toggleSection = (label: string) => {
    setOpenSections(prev =>
      prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label],
    );
  };
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <span className="font-semibold tracking-tight truncate">
                    AR Pro
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          {/*
           * The nav is the only scrolling region: `SidebarContent` is flex-1 with its own
           * overflow, and header/footer are shrink-0 siblings. That is what keeps the
           * footer (Mentions + user) from ever covering the last rows on a short screen.
           */}
          <SidebarContent className="gap-0 overflow-y-auto overscroll-contain py-1 group-data-[collapsible=icon]:overflow-y-auto">
            {navSections.map((section, i) => {
              /*
               * A section header is a control and it tells the truth: any section can be
               * collapsed, including the one holding the current page. To avoid hiding
               * where you are, a collapsed section that owns the active route still shows
               * that single row (and marks itself with a dot), so you never lose your
               * place but you do get the compact menu you asked for.
               */
              const hasHeader = Boolean(section.label);
              const holdsCurrentPage = section.label !== null && section.label === activeSection;
              const isOpen = !hasHeader || openSections.includes(section.label!);
              return (
                <SidebarGroup
                  key={section.label ?? `section-${i}`}
                  className={`shrink-0 px-0 py-0 ${section.label ? "mt-1.5" : ""}`}
                >
                  {/* In the icon rail there is no room for a header, so a hairline separates groups. */}
                  {section.label && i > 0 ? (
                    <SidebarSeparator className="my-1 hidden group-data-[collapsible=icon]:block" />
                  ) : null}
                  {section.label ? (
                    /*
                     * Deliberately NOT shadcn's `SidebarGroupLabel`: that component is a
                     * fixed `h-8` flex box which, in icon mode, pulls itself out of flow with
                     * `-mt-8`. Wrapping our toggle button in it made the header sit on top of
                     * the first menu row. A plain block keeps the header in normal flow.
                     */
                    <div className="px-2 group-data-[collapsible=icon]:hidden">
                      <button
                        type="button"
                        onClick={() => toggleSection(section.label!)}
                        aria-expanded={isOpen}
                        aria-controls={`nav-section-${section.label}`}
                        title={isOpen ? `Collapse ${section.label}` : `Expand ${section.label}`}
                        className="group/sec flex h-6 w-full items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/45 transition-colors hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                      >
                        <ChevronDown
                          className={`h-3 w-3 shrink-0 opacity-60 transition-transform duration-150 ${
                            isOpen ? "" : "-rotate-90"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="truncate">{section.label}</span>
                        {/* Closed but it owns the current page: say so instead of silently hiding it. */}
                        {!isOpen && holdsCurrentPage ? (
                          <span
                            className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-sidebar-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    </div>
                  ) : null}
                  <SidebarMenu
                    id={section.label ? `nav-section-${section.label}` : undefined}
                    className="gap-0.5 px-2 pt-0.5"
                  >
                    {section.items.map(item => {
                      const isActive = matchesNavPath(location, item.path);
                      /*
                       * A menu click always takes you to the top of the page. Deep in a
                       * 5,000-row invoice list the fastest way back to the filters is the
                       * menu entry you are already on, so clicking the active item must
                       * scroll up instead of doing nothing. On a different route we still
                       * reset the scroll, because wouter keeps the window position.
                       */
                      const handleClick = () => {
                        if (!isActive) setLocation(item.path);
                        if (sidebarIsMobile) setOpenMobile(false);
                        scrollPageToTop();
                      };
                      // Collapsed section: keep only the active row visible (and the whole
                      // group visible in the icon rail, where headers do not exist).
                      const hidden = !isOpen && !isActive;
                      return (
                        <SidebarMenuItem
                          key={`${section.label ?? "root"}-${item.path}`}
                          className={hidden ? "hidden group-data-[collapsible=icon]:block" : undefined}
                        >
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={handleClick}
                            tooltip={item.label}
                            className={NAV_ROW}
                          >
                            {isActive ? (
                              <span
                                className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-sidebar-primary group-data-[collapsible=icon]:hidden"
                                aria-hidden="true"
                              />
                            ) : null}
                            <item.icon className="h-4 w-4 shrink-0 opacity-80" />
                            <span className="truncate">{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroup>
              );
            })}
          </SidebarContent>

          <SidebarFooter className="shrink-0 gap-1 border-t border-sidebar-border p-2">
            <MentionsInbox collapsed={isCollapsed} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-sidebar-accent/60 group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Avatar className="h-7 w-7 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-xs font-medium leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="mt-1 truncate text-[10px] text-sidebar-foreground/60">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
          <GlobalSearch />
        </div>
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
