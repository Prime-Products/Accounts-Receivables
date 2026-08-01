import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { lazy, Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Route-level code splitting: each page loads its own JS chunk on demand,
// keeping the initial bundle small and first paint fast.
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("@/pages/CustomerDetail"));
const GroupDetail = lazy(() => import("@/pages/GroupDetail"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Contracts = lazy(() => import("./pages/Contracts"));
const AddressBook = lazy(() => import("./pages/AddressBook"));
const Tasks = lazy(() => import("./pages/Tasks"));
const CallBack = lazy(() => import("./pages/CallBack"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const WireTransfersPage = lazy(() => import("./pages/WireTransfersPage"));
const Team = lazy(() => import("./pages/Team"));
const Vessels = lazy(() => import("./pages/Vessels"));
const VesselDetail = lazy(() => import("./pages/VesselDetail"));

function PageFallback() {
  return (
    /*
     * Route-level skeleton: mirrors the shared page shell (title block, filter
     * row, table card) so switching pages does not flash a bare "Loading…".
     */
    <div className="p-2 sm:p-4 space-y-4" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-10 w-44" />
      </div>
      <Card>
        <CardContent className="p-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Router() {
  return (
    <DashboardLayout>
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path={"/"} component={Home} />
          <Route path={"/customers"} component={Customers} />
          <Route path={"/customers/:id"} component={CustomerDetail} />
          <Route path={"/groups/:name"} component={GroupDetail} />
          <Route path={"/invoices"} component={Invoices} />
          <Route path={"/vessels"} component={Vessels} />
          <Route path={"/vessels/:id"} component={VesselDetail} />
          <Route path={"/contracts"} component={Contracts} />
          <Route path={"/address-book"} component={AddressBook} />
          {/* Legacy path kept so old links and bookmarks still land somewhere useful. */}
          <Route path={"/contacts"} component={AddressBook} />
          <Route path={"/tasks"} component={Tasks} />
          <Route path={"/call-back"} component={CallBack} />
          <Route path={"/wire-transfers"} component={WireTransfersPage} />
          {/* Forecast page removed — everything happens on Customers now */}
          <Route path={"/forecast"}>{() => <Redirect to="/customers" />}</Route>
          <Route path={"/reports"} component={Reports} />
          <Route path={"/team"} component={Team} />
          <Route path={"/settings"} component={Settings} />
          <Route path={"/404"} component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </DashboardLayout>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
