import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Package,
  CheckCircle,
  Clock,
  Activity,
  Users,
  ArrowRight,
  BarChart3,
  MoreHorizontal,
  LayoutDashboard,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { dashboardApi, emailsApi, sessionsApi } from "../services/api";
import type { DashboardStats, Email, ShipmentSession } from "../types";

// ==========================================
// 1. SUB-COMPONENTS (For Clean Architecture)
// ==========================================

const MetricCard = ({ title, value, icon: Icon, colorClass, trend }: any) => (
  <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition-all duration-300 group">
    <div className="flex justify-between items-start mb-4">
      <div
        className={`p-3.5 rounded-2xl ${colorClass} bg-opacity-10 group-hover:scale-110 transition-transform duration-300`}
      >
        <Icon
          className={`w-6 h-6 ${colorClass.replace("bg-", "text-")}`}
          strokeWidth={2}
        />
      </div>
      {trend && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
          {trend}
        </span>
      )}
    </div>
    <div>
      <h3 className="text-3xl font-bold text-[#1A1C21] tracking-tight">
        {value}
      </h3>
      <p className="text-sm font-medium text-gray-500 mt-1 ml-0.5">{title}</p>
    </div>
  </div>
);

const ActivityItem = ({
  title,
  subtitle,
  time,
  icon: Icon,
  colorClass,
}: any) => (
  <div className="flex items-start gap-4 p-4 rounded-2xl hover:bg-gray-50/80 transition-colors border border-transparent hover:border-gray-100 group cursor-default">
    <div
      className={`mt-1 w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${colorClass} bg-opacity-10`}
    >
      <Icon className={`w-5 h-5 ${colorClass.replace("bg-", "text-")}`} />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex justify-between items-start">
        <p className="text-sm font-bold text-gray-900 truncate pr-2 group-hover:text-blue-600 transition-colors">
          {title}
        </p>
        <span className="text-[10px] font-semibold text-gray-400 whitespace-nowrap bg-white px-2 py-0.5 rounded-md border border-gray-100">
          {time}
        </span>
      </div>
      <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
    </div>
  </div>
);

const ActionTile = ({ title, subtitle, icon: Icon, onClick }: any) => (
  <button
    onClick={onClick}
    className="flex flex-col items-start justify-between p-5 bg-white rounded-3xl border border-gray-100 shadow-sm hover:border-blue-200 hover:shadow-md hover:-translate-y-1 transition-all duration-300 group h-36 w-full text-left"
  >
    <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center group-hover:bg-blue-600 transition-colors duration-300">
      <Icon className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors duration-300" />
    </div>
    <div>
      <h4 className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
        {title}
      </h4>
      <p className="text-xs text-gray-400 group-hover:text-blue-400 transition-colors mt-1">
        {subtitle}
      </p>
    </div>
  </button>
);

// ==========================================
// 2. MAIN DASHBOARD COMPONENT
// ==========================================

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  // --- State ---
  const [stats, setStats] = useState<DashboardStats>({
    total_emails: 0,
    shipping_requests: 0,
    total_shipments: 0,
    complete_shipments: 0,
    incomplete_shipments: 0,
    vendor_replied_sessions: 0,
  });
  const [recentEmails, setRecentEmails] = useState<Email[]>([]);
  const [recentSessions, setRecentSessions] = useState<ShipmentSession[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Effects ---
  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000); // 30s Auto-refresh
    return () => clearInterval(interval);
  }, []);

  // --- Data Fetching ---
  const loadDashboardData = async () => {
    try {
      const [statsRes, emailsRes, sessionsRes] = await Promise.all([
        dashboardApi.getStats(),
        emailsApi.getAll(),
        sessionsApi.getAll(),
      ]);
      setStats(statsRes.data);
      setRecentEmails(emailsRes.data.slice(0, 3));
      setRecentSessions(sessionsRes.data.slice(0, 3));
    } catch (error) {
      console.error("Failed to load dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Helpers ---
  const formatTimeAgo = (dateString: string) => {
    const diff = new Date().getTime() - new Date(dateString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // --- Loading View ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8F9FB]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium font-poppins text-sm tracking-wide">
            INITIALIZING...
          </p>
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-[#F8F9FB] p-8 font-poppins text-[#1A1C21]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'); .font-poppins { font-family: 'Poppins', sans-serif; }`}</style>

      <div className="max-w-[1600px] mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-[#1A1C21] tracking-tight">
            Overview
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            Welcome back, here's what's happening today.
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Total Emails"
            value={stats.total_emails.toLocaleString()}
            icon={Mail}
            colorClass="bg-blue-600 text-blue-600"
            trend="Inbound"
          />
          <MetricCard
            title="Valid Requests"
            value={stats.shipping_requests.toLocaleString()}
            icon={Package}
            colorClass="bg-indigo-600 text-indigo-600"
            trend="Filtered"
          />
          <MetricCard
            title="Active Sessions"
            value={stats.total_shipments.toLocaleString()}
            icon={Activity}
            colorClass="bg-violet-500 text-violet-500"
            trend="Processing"
          />
          <MetricCard
            title="Completed"
            value={stats.complete_shipments.toLocaleString()}
            icon={CheckCircle}
            colorClass="bg-emerald-500 text-emerald-500"
            trend="Success"
          />
        </div>

        {/* Content Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
          {/* Left: Activity Feed (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex-1">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-lg font-bold text-[#1A1C21]">
                    Activity Feed
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Real-time system events
                  </p>
                </div>
                <button className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                {recentEmails.length === 0 && recentSessions.length === 0 ? (
                  <div className="h-64 flex flex-col items-center justify-center text-gray-400 text-sm border-2 border-dashed border-gray-50 rounded-2xl">
                    <LayoutDashboard className="w-8 h-8 mb-2 opacity-20" />
                    No recent activity detected.
                  </div>
                ) : (
                  <>
                    {recentSessions.map((session) => (
                      <ActivityItem
                        key={`s-${session.id}`}
                        title={
                          session.status === "complete"
                            ? "Shipment Completed"
                            : "New Shipment Session"
                        }
                        subtitle={`Session ID: ${session.id
                          .toString()
                          .substring(0, 18)}...`}
                        time={formatTimeAgo(session.created_at)}
                        icon={Package}
                        colorClass={
                          session.status === "complete"
                            ? "bg-emerald-500"
                            : "bg-violet-500"
                        }
                      />
                    ))}
                    {recentEmails.map((email) => (
                      <ActivityItem
                        key={`e-${email.message_id}`}
                        title={
                          email.is_shipping_request
                            ? "Shipping Request Detected"
                            : "Email Received"
                        }
                        subtitle={email.subject || "No Subject"}
                        time={formatTimeAgo(email.received_at)}
                        icon={Mail}
                        colorClass={
                          email.is_shipping_request
                            ? "bg-blue-600"
                            : "bg-gray-500"
                        }
                      />
                    ))}
                  </>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-gray-50 flex justify-center">
                <button
                  onClick={() => navigate("/analytics")}
                  className="text-sm font-semibold text-gray-400 hover:text-blue-600 transition-colors flex items-center gap-1"
                >
                  View Full History <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Control Panel (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            {/* 1. Focus Card (Subtle & Elegant Replacement for Blue Card) */}
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-[100px] -mr-4 -mt-4 z-0"></div>

              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Pending Tasks
                  </span>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-[#1A1C21]">
                      {stats.incomplete_shipments}
                    </span>
                    <span className="text-sm font-medium text-gray-400 mb-1">
                      items
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Shipments awaiting processing or vendor assignment.
                  </p>
                </div>

                {stats.incomplete_shipments > 0 ? (
                  <button
                    onClick={() => navigate("/sessions")}
                    className="w-full py-3.5 bg-[#1A1C21] text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-gray-200"
                  >
                    Process Queue <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="w-full py-3.5 bg-gray-50 text-gray-400 rounded-xl font-medium text-sm text-center border border-gray-100">
                    You're all caught up
                  </div>
                )}
              </div>
            </div>

            {/* 2. Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-4">
              <ActionTile
                title="Inbox"
                subtitle="View Emails"
                icon={Mail}
                onClick={() => navigate("/emails")}
              />
              <ActionTile
                title="Sessions"
                subtitle="Manage Jobs"
                icon={Package}
                onClick={() => navigate("/sessions")}
              />
              <ActionTile
                title="Vendors"
                subtitle="Database"
                icon={Users}
                onClick={() => navigate("/vendors")}
              />
              <ActionTile
                title="Analytics"
                subtitle="Reports"
                icon={BarChart3}
                onClick={() => navigate("/analytics")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
