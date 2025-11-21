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
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main className="flex-1 flex flex-col ml-20">
          <TopNav />
          <div className="flex-1 overflow-auto">
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
    <aside className="fixed left-0 top-0 h-screen w-20 bg-white border-r border-gray-200 flex flex-col items-center py-6 hover:w-64 transition-all duration-300 ease-in-out group overflow-hidden shadow-sm z-50">
      {/* Logo Section */}
      <div className="mb-8 flex items-center gap-3 px-2 w-full">
        <div className="min-w-[40px] h-10 rounded-2xl bg-blue-600 flex items-center justify-center rotate-[-8deg] group-hover:rotate-0 transition-transform duration-300 shadow-md">
          <Mail className="w-5 h-5 text-white" />
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
          <h2 className="text-lg font-bold text-gray-900">EmailVendor</h2>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 w-full space-y-1 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "relative flex items-center gap-4 px-3 py-3 rounded-2xl text-sm font-medium transition-all duration-200 w-full overflow-hidden",
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <div
                className={cn(
                  "min-w-[24px] flex items-center justify-center transition-transform group-hover:scale-110",
                  isActive
                    ? "rotate-[-8deg]"
                    : "rotate-0 group-hover:rotate-[-4deg]"
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
                {item.label}
              </span>
              {isActive && (
                <div className="absolute left-0 w-1 h-6 bg-white rounded-r-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
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
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
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
