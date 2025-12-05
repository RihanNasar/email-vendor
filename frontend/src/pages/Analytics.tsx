import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  MoreHorizontal,
  Mail,
  Package,
  Target,
  BarChart3,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Filter,
  Activity,
} from "lucide-react";
import { dashboardApi, sessionsApi, vendorsApi } from "../services/api";
import type { DashboardStats, ShipmentSession, Vendor } from "../types";

// --- Internal Components for Styling ---

/**
 * Custom Progress Bar Component
 * Replicates the "Session by Country" style:
 * A thin background track with a thicker, floating colored bar on top.
 */
const ElegantProgressBar = ({
  percentage,
  colorClass = "bg-blue-600",
  trackClass = "bg-gray-100",
}: {
  percentage: number;
  colorClass?: string;
  trackClass?: string;
}) => {
  const safePercentage = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className="relative h-3 flex items-center mt-3 mb-1">
      {/* Thin background track */}
      <div className={`absolute w-full h-1 ${trackClass} rounded-full`}></div>
      {/* Thicker foreground bar */}
      <div
        className={`absolute h-2.5 ${colorClass} rounded-full shadow-sm z-10 transition-all duration-700 ease-out`}
        style={{ width: `${safePercentage}%` }}
      ></div>
    </div>
  );
};

const Analytics: React.FC = () => {
  // --- State Management (From Source A) ---
  const [stats, setStats] = useState<DashboardStats>({
    total_emails: 0,
    shipping_requests: 0,
    total_shipments: 0,
    complete_shipments: 0,
    incomplete_shipments: 0,
    vendor_replied_sessions: 0,
  });
  const [sessions, setSessions] = useState<ShipmentSession[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Data Loading ---
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [statsRes, sessionsRes, vendorsRes] = await Promise.all([
        dashboardApi.getStats(),
        sessionsApi.getAll(),
        vendorsApi.getAll(),
      ]);
      setStats(statsRes.data);
      setSessions(sessionsRes.data);
      setVendors(vendorsRes.data);
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- Calculations (From Source A) ---

  // 1. Shipment Metrics
  const completionRate =
    stats.total_shipments > 0
      ? Math.round((stats.complete_shipments / stats.total_shipments) * 100)
      : 0;

  // 2. Email / Traffic Metrics
  const processingRate =
    stats.total_emails > 0
      ? Math.round((stats.shipping_requests / stats.total_emails) * 100)
      : 0;

  // Separating Shipping from Non-Shipping (Queries/Spam)
  const nonShippingCount = stats.total_emails - stats.shipping_requests;
  const noiseRate = 100 - processingRate;

  // 3. Vendor Metrics
  const vendorStats = vendors
    .map((vendor) => {
      const vSessions = sessions.filter((s) => s.vendor_id === vendor.id);
      const replies = vSessions.filter((s) => s.vendor_replied_at);
      const rate =
        vSessions.length > 0
          ? Math.round((replies.length / vSessions.length) * 100)
          : 0;
      return { ...vendor, totalSessions: vSessions.length, rate };
    })
    .sort((a, b) => b.totalSessions - a.totalSessions);

  // 4. Category Metrics
  const categories = sessions.reduce((acc, s) => {
    const type = s.service_type || "Standard";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categoryData = Object.entries(categories)
    .map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / sessions.length) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const unassignedCount = sessions.filter((s) => !s.vendor_id).length;
  const overallResponseRate =
    stats.total_shipments > 0
      ? Math.round(
          (stats.vendor_replied_sessions / stats.total_shipments) * 100
        )
      : 0;

  const hasData = stats.total_emails > 0;

  // --- Loading State ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8F9FB]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium font-poppins">
            Loading Analytics...
          </p>
        </div>
      </div>
    );
  }

  // --- Main Render ---
  return (
    <div className="min-h-screen bg-[#F8F9FB] p-8 font-poppins text-[#1A1C21]">
      {/* Inject Poppins Font */}
      <style>
        {`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
          .font-poppins { font-family: 'Poppins', sans-serif; }`}
      </style>

      <div className="max-w-[1600px] mx-auto space-y-8 font-poppins">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Analytics Overview
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Performance metrics and operational insights
            </p>
          </div>
        </div>

        {!hasData ? (
          <div className="bg-white rounded-3xl border border-gray-100 p-16 flex flex-col items-center justify-center text-center shadow-[0_2px_20px_rgba(0,0,0,0.02)]">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
              <BarChart3 className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              No Data Available
            </h3>
            <p className="text-gray-500 max-w-md">
              Analytics will populate once email processing begins. Check your
              connection or start a new session.
            </p>
          </div>
        ) : (
          <>
            {/* Top Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Card 1: Inbound Emails */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_25px_rgba(0,0,0,0.04)] transition-shadow duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-50 rounded-2xl">
                    <Mail className="w-6 h-6 text-blue-600" />
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                    <TrendingUp className="w-3 h-3" />
                    +12%
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-3xl font-bold text-gray-900">
                    {stats.total_emails.toLocaleString()}
                  </h3>
                  <p className="text-sm font-medium text-gray-400">
                    Inbound Emails
                  </p>
                </div>
              </div>

              {/* Card 2: Valid Requests */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_25px_rgba(0,0,0,0.04)] transition-shadow duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-gray-50 rounded-2xl">
                    <Target className="w-6 h-6 text-gray-700" />
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                    <TrendingUp className="w-3 h-3" />
                    {processingRate}% Rate
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-3xl font-bold text-gray-900">
                    {stats.shipping_requests.toLocaleString()}
                  </h3>
                  <p className="text-sm font-medium text-gray-400">
                    Valid Requests
                  </p>
                </div>
              </div>

              {/* Card 3: Queries & Spam (Replaced Active Sessions slot) */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_25px_rgba(0,0,0,0.04)] transition-shadow duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-gray-50 rounded-2xl">
                    <ShieldAlert className="w-6 h-6 text-gray-700" />
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
                    {noiseRate}% Filtered
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-3xl font-bold text-gray-900">
                    {nonShippingCount.toLocaleString()}
                  </h3>
                  <p className="text-sm font-medium text-gray-400">
                    Queries & Spam
                  </p>
                </div>
              </div>

              {/* Card 4: Efficiency/Completed */}
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_25px_rgba(0,0,0,0.04)] transition-shadow duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-200">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <span className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                    {completionRate}% Rate
                  </span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-3xl font-bold text-gray-900">
                    {stats.complete_shipments}
                  </h3>
                  <p className="text-sm font-medium text-gray-400">
                    Completed Jobs
                  </p>
                </div>
              </div>
            </div>

            {/* Middle Section: Detailed Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Traffic & Categories */}
              <div className="lg:col-span-8 bg-white p-8 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Traffic Composition
                    </h3>
                    <p className="text-sm text-gray-400">
                      Analysis of inbound communication
                    </p>
                  </div>
                  <button className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                    <Filter className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="space-y-8">
                  {/* Metric 1: Shipping Requests */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                          <Target className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">
                            Shipping Requests
                          </h4>
                          <p className="text-xs text-gray-400">
                            Quote requests
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-gray-900">
                          {stats.shipping_requests}
                        </span>
                        <span className="text-xs text-gray-400 ml-2">
                          ({processingRate}%)
                        </span>
                      </div>
                    </div>
                    <ElegantProgressBar
                      percentage={processingRate}
                      colorClass="bg-blue-600"
                    />
                  </div>

                  {/* Metric 2: Spam/Queries */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                          <ShieldAlert className="w-5 h-5 text-gray-500" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">
                            General Inquiries
                          </h4>
                          <p className="text-xs text-gray-400">
                            Filtered traffic
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-gray-900">
                          {nonShippingCount}
                        </span>
                        <span className="text-xs text-gray-400 ml-2">
                          ({noiseRate}%)
                        </span>
                      </div>
                    </div>
                    <ElegantProgressBar
                      percentage={noiseRate}
                      colorClass="bg-gray-400"
                    />
                  </div>

                  {/* Categories Section (Integrated cleanly) */}
                  <div className="pt-6 border-t border-gray-50">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                      Service Categories
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                      {categoryData.slice(0, 4).map((cat, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-gray-700">
                              {cat.name}
                            </span>
                            <span className="text-gray-500">{cat.count}</span>
                          </div>
                          <ElegantProgressBar
                            percentage={cat.percentage}
                            colorClass="bg-blue-400"
                            trackClass="bg-gray-50"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Pipeline Health */}
              <div className="lg:col-span-4 bg-white p-8 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Pipeline Health
                    </h3>
                    <p className="text-sm text-gray-400">Shipment Status</p>
                  </div>
                  <button className="p-2 hover:bg-gray-50 rounded-full transition-colors">
                    <Activity className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Completed */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-bold text-gray-900">Completed</span>
                      <span className="font-bold text-blue-600">
                        {completionRate}%
                      </span>
                    </div>
                    <ElegantProgressBar
                      percentage={completionRate}
                      colorClass="bg-blue-600"
                    />
                    <p className="text-xs text-gray-400 mt-1 text-right">
                      {stats.complete_shipments} sessions
                    </p>
                  </div>

                  {/* Pending */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-bold text-gray-900">
                        Pending Action
                      </span>
                      <span className="font-bold text-gray-500">
                        {100 - completionRate}%
                      </span>
                    </div>
                    <ElegantProgressBar
                      percentage={100 - completionRate}
                      colorClass="bg-gray-300"
                    />
                    <p className="text-xs text-gray-400 mt-1 text-right">
                      {stats.incomplete_shipments} sessions
                    </p>
                  </div>

                  {/* Vendor Response Rate */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-bold text-gray-900">
                        Vendor Response
                      </span>
                      <span className="font-bold text-blue-500">
                        {overallResponseRate}%
                      </span>
                    </div>
                    <ElegantProgressBar
                      percentage={overallResponseRate}
                      colorClass="bg-blue-500"
                    />
                  </div>

                  {/* Action Needed Alert (Styled to match theme) */}
                  <div
                    className={`mt-6 p-4 rounded-2xl flex items-start gap-3 border ${
                      unassignedCount > 0
                        ? "bg-blue-50 border-blue-100"
                        : "bg-gray-50 border-gray-100"
                    }`}
                  >
                    <div
                      className={`mt-0.5 ${
                        unassignedCount > 0 ? "text-blue-600" : "text-gray-400"
                      }`}
                    >
                      <AlertCircle size={18} />
                    </div>
                    <div>
                      <p
                        className={`text-sm font-bold ${
                          unassignedCount > 0
                            ? "text-gray-900"
                            : "text-gray-500"
                        }`}
                      >
                        {unassignedCount > 0 ? "Action Needed" : "All Clear"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {unassignedCount > 0
                          ? `${unassignedCount} sessions waiting for vendor assignment.`
                          : "No unassigned sessions at this time."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Section: Vendor Table */}
            <div className="grid grid-cols-1">
              <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      Top Vendors
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Performance by session volume and response time
                    </p>
                  </div>
                  <button className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                    See All Vendors
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="pb-4 pl-2">Vendor Name</th>
                        <th className="pb-4 text-center">Sessions</th>
                        <th className="pb-4 text-center">Response Rate</th>
                        <th className="pb-4 text-right pr-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {vendorStats.slice(0, 5).map((vendor) => (
                        <tr
                          key={vendor.id}
                          className="hover:bg-gray-50/50 transition-colors"
                        >
                          <td className="py-4 pl-2">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                                {vendor.name.charAt(0)}
                              </div>
                              <span className="font-bold text-sm text-gray-900">
                                {vendor.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-4 text-center text-sm font-semibold text-gray-600">
                            {vendor.totalSessions}
                          </td>
                          <td className="py-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                vendor.rate > 80
                                  ? "bg-blue-50 text-blue-600"
                                  : vendor.rate > 50
                                  ? "bg-gray-100 text-gray-600"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {vendor.rate}%
                            </span>
                          </td>
                          <td className="py-4 text-right pr-2">
                            <div className="inline-flex items-center gap-2">
                              <div
                                className={`w-2 h-2 rounded-full ${
                                  vendor.rate > 50
                                    ? "bg-blue-600"
                                    : "bg-gray-300"
                                }`}
                              ></div>
                              <span className="text-xs font-medium text-gray-500">
                                Active
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {vendorStats.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="py-8 text-center text-gray-400 text-sm"
                          >
                            No vendor activity recorded
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Analytics;
