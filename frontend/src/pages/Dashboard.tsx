import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Package,
  CheckCircle,
  Clock,
  TrendingUp,
  Activity,
  Users,
} from "lucide-react";
import { dashboardApi, emailsApi, sessionsApi } from "../services/api";
import type { DashboardStats, Email, ShipmentSession } from "../types";

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    total_emails: 0,
    shipping_requests: 0,
    total_shipments: 0,
    complete_shipments: 0,
    incomplete_shipments: 0,
  });
  const [recentEmails, setRecentEmails] = useState<Email[]>([]);
  const [recentSessions, setRecentSessions] = useState<ShipmentSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadDashboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

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
    } catch (error: any) {
      console.error("Failed to load dashboard data:", error);
      console.error("Error details:", error.response?.data || error.message);
      // Set empty data on error so UI doesn't stay in loading state
      setStats({
        total_emails: 0,
        shipping_requests: 0,
        total_shipments: 0,
        complete_shipments: 0,
        incomplete_shipments: 0,
      });
    } finally {
      setLoading(false);
    }
  };
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Emails */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <Mail className="w-6 h-6 text-blue-600" />
            </div>
            <TrendingUp className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {stats.total_emails}
          </div>
          <div className="text-sm text-gray-600">Total Emails</div>
        </div>

        {/* Shipping Requests */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {stats.shipping_requests}
          </div>
          <div className="text-sm text-gray-600">Shipping Requests</div>
        </div>

        {/* Total Shipments */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Package className="w-6 h-6 text-indigo-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {stats.total_shipments}
          </div>
          <div className="text-sm text-gray-600">Total Shipments</div>
        </div>

        {/* Complete Shipments */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
            </div>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {stats.complete_shipments}
          </div>
          <div className="text-sm text-gray-600">Completed</div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pending Shipments */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">
                {stats.incomplete_shipments}
              </div>
              <div className="text-sm text-gray-600">Pending Shipments</div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Recent Activity
            </h3>
          </div>
          <div className="space-y-3">
            {recentEmails.length === 0 && recentSessions.length === 0 ? (
              <div className="text-center py-4 text-gray-500 text-sm">
                No recent activity
              </div>
            ) : (
              <>
                {recentEmails.slice(0, 2).map((email) => (
                  <div
                    key={email.message_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
                  >
                    <Mail className="w-5 h-5 text-blue-600" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {email.is_shipping_request
                          ? "New shipping request received"
                          : "Email received"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTimeAgo(email.received_at)}
                      </div>
                    </div>
                  </div>
                ))}
                {recentSessions.slice(0, 1).map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
                  >
                    <Package className="w-5 h-5 text-green-600" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {session.status === "complete"
                          ? "Shipment completed"
                          : "Shipment session created"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatTimeAgo(session.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <button
            onClick={() => navigate("/emails")}
            className="flex flex-col items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-600 hover:bg-blue-50 transition-all group"
          >
            <Mail className="w-8 h-8 text-gray-400 group-hover:text-blue-600" />
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">
              Check Emails
            </span>
          </button>
          <button
            onClick={() => navigate("/sessions")}
            className="flex flex-col items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-600 hover:bg-blue-50 transition-all group"
          >
            <Package className="w-8 h-8 text-gray-400 group-hover:text-blue-600" />
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">
              View Sessions
            </span>
          </button>
          <button
            onClick={() => navigate("/vendors")}
            className="flex flex-col items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-600 hover:bg-blue-50 transition-all group"
          >
            <Users className="w-8 h-8 text-gray-400 group-hover:text-blue-600" />
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">
              Manage Vendors
            </span>
          </button>
          <button
            onClick={() => navigate("/analytics")}
            className="flex flex-col items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-600 hover:bg-blue-50 transition-all group"
          >
            <Activity className="w-8 h-8 text-gray-400 group-hover:text-blue-600" />
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">
              View Analytics
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
