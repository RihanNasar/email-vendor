import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import { LayoutDashboard, Package, Users, Mail, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import Dashboard from "./pages/Dashboard";
import Vendors from "./pages/Vendors";
import Emails from "./pages/Emails";
import Sessions from "./pages/Sessions";
import Analytics from "./pages/Analytics";

const App: React.FC = () => {
  return (
    <Router>
      <div className="flex min-h-screen bg-white">
        <Sidebar />
        {/* Adjusted ml-64 to ml-56 to match the slimmer sidebar */}
        <main className="flex-1 flex flex-col ml-56 transition-all duration-300">
          <TopNav />
          <div className="flex-1 overflow-auto bg-gray-50/50">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/vendors" element={<Vendors />} />
              <Route path="/emails" element={<Emails />} />
              <Route path="/analytics" element={<Analytics />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
};

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navItems = [
    { path: "/", label: "Dashboard", icon: LayoutDashboard },
    { path: "/sessions", label: "Sessions", icon: Package },
    { path: "/vendors", label: "Vendors", icon: Users },
    { path: "/emails", label: "Emails", icon: Mail },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    // Changed w-64 to w-56 for a slimmer look
    <aside className="fixed left-0 top-0 h-screen w-56 bg-white border-r border-gray-100 flex flex-col py-8 z-50">
      {/* Logo Section */}
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Mail className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-bold text-gray-900 tracking-tight">
          EmailVendor
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "relative flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
                isActive
                  ? "bg-blue-50 text-blue-700 shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 mr-3 transition-colors duration-200",
                  isActive
                    ? "text-blue-600"
                    : "text-gray-400 group-hover:text-gray-600"
                )}
              />
              <span>{item.label}</span>

              {/* Active indicator dot */}
              {isActive && (
                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-blue-600" />
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};

const TopNav: React.FC = () => {
  const location = useLocation();
  const getPageTitle = () => {
    switch (location.pathname) {
      case "/":
        return "Dashboard";
      case "/sessions":
        return "Sessions";
      case "/vendors":
        return "Vendors";
      case "/emails":
        return "Emails";
      case "/analytics":
        return "Analytics";
      default:
        return "Dashboard";
    }
  };
  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-100">
      <div className="flex items-center justify-between px-8 py-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {getPageTitle()}
          </h1>
        </div>
      </div>
    </header>
  );
};

export default App;
