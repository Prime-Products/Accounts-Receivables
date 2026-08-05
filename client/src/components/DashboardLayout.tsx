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
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
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
 * chasing money (Receivables), knowing who and what we deal with (CRM), and
 * running the operation (Management). Dashboard stands alone above the groups
 * because it is the landing view, not a category.
 */
const navSections: { label: string | null; items: { icon: typeof LayoutDashboard; label: string; path: string }[] }[] = [
  {
    label: null,
    items: [{ icon: LayoutDashboard, label: "Dashboard", path: "/" }],
  },
  {
    label: "Receivables",
    items: [
      { icon: Users, label: "Customers", path: "/customers" },
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

/** Flat list for lookups (active item, page title) — the grouping is presentational. */
const menuItems = navSections.flatMap(s => s.items);

const SIDEBAR_WIDTH_KEY = "sidebar-width";
// Version the preference whenever the information architecture changes so an
// old collapsed state cannot hide the newly aligned Manus navigation.
const SIDEBAR_SECTIONS_KEY = "sidebar-open-sections-v2";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

/** Section labels that can be toggled (the ungrouped Dashboard row is always shown). */
const collapsibleSectionLabels = navSections
  .map(s => s.label)
  .filter((l): l is string => Boolean(l));

/** Which section a given route belongs to, so the current page is never hidden. */
function sectionOfPath(path: string): string | null {
  for (const section of navSections) {
    if (!section.label) continue;
    const match = section.items.some(item =>
      item.path === "/" ? path === "/" : path.startsWith(item.path),
    );
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
  const activeMenuItem = menuItems.find(item =>
    item.path === "/" ? location === "/" : location.startsWith(item.path),
  );
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

          <SidebarContent className="gap-0 px-1">
            {navSections.map((section, i) => {
              /*
               * A section header is a control: clicking it expands or collapses the
               * items below. Two rules keep it from getting in the way — the section
               * holding the current page cannot be closed (you must always see where
               * you are), and when the sidebar is icon-only every item stays visible
               * because there is no header left to click.
               */
              const hasHeader = Boolean(section.label);
              const holdsCurrentPage = section.label !== null && section.label === activeSection;
              const isOpen =
                !hasHeader || isCollapsed || holdsCurrentPage || openSections.includes(section.label!);
              return (
              <SidebarGroup
                key={section.label ?? `section-${i}`}
                className={section.label ? "px-0 pb-1 pt-2" : "px-0 pb-1 pt-0"}
              >
                {section.label ? (
                  <SidebarGroupLabel
                    asChild
                    className="h-7 px-0 group-data-[collapsible=icon]:hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSection(section.label!)}
                      aria-expanded={isOpen}
                      aria-controls={`nav-section-${section.label}`}
                      title={
                        holdsCurrentPage
                          ? `${section.label} — contains the page you are on`
                          : isOpen
                            ? `Collapse ${section.label}`
                            : `Expand ${section.label}`
                      }
                      className="flex w-fit items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60 transition-colors hover:text-sidebar-accent-foreground focus:outline-none"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                          isOpen ? "" : "-rotate-90"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{section.label}</span>
                    </button>
                  </SidebarGroupLabel>
                ) : null}
                <SidebarMenu
                  id={section.label ? `nav-section-${section.label}` : undefined}
                  className={`px-0 py-1 ${isOpen ? "" : "hidden"}`}
                >
                  {section.items.map(item => {
                    const isActive = item.path === "/" ? location === "/" : location.startsWith(item.path);
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
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={handleClick}
                          tooltip={item.label}
                          className={`h-10 transition-all font-normal`}
                        >
                          <item.icon
                            className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                          />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
              );
            })}
          </SidebarContent>

          <SidebarFooter className="p-3">
            <MentionsInbox collapsed={isCollapsed} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
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
