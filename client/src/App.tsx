import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Customers from "./pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import GroupDetail from "@/pages/GroupDetail";
import Invoices from "./pages/Invoices";
import Contracts from "./pages/Contracts";
import Tasks from "./pages/Tasks";
import OnHold from "./pages/OnHold";
import Forecast from "./pages/Forecast";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/customers"} component={Customers} />
        <Route path={"/customers/:id"} component={CustomerDetail} />
        <Route path={"/groups/:name"} component={GroupDetail} />
        <Route path={"/invoices"} component={Invoices} />
        <Route path={"/contracts"} component={Contracts} />
        <Route path={"/tasks"} component={Tasks} />
        <Route path={"/on-hold"} component={OnHold} />
        <Route path={"/forecast"} component={Forecast} />
        <Route path={"/reports"} component={Reports} />
        <Route path={"/settings"} component={Settings} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
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
