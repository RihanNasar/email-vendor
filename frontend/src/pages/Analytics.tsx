import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Mail,
  Package,
  CheckCircle,
  Clock,
  BarChart3,
  Users,
  Truck,
  Box,
  Target,
} from "lucide-react";
import { dashboardApi, sessionsApi, vendorsApi } from "../services/api";
import type { DashboardStats, ShipmentSession, Vendor } from "../types";

const Analytics: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    total_emails: 0,
    shipping_requests: 0,
    total_shipments: 0,
    complete_shipments: 0,
    incomplete_shipments: 0,
  });
  const [sessions, setSessions] = useState<ShipmentSession[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

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

  const completionRate =
    stats.total_shipments > 0
      ? Math.round((stats.complete_shipments / stats.total_shipments) * 100)
      : 0;

  const processingRate =
    stats.total_emails > 0
      ? Math.round((stats.shipping_requests / stats.total_emails) * 100)
      : 0;

  // Vendor Analytics
  const getVendorStats = () => {
    return vendors
      .map((vendor) => {
        const vendorSessions = sessions.filter(
          (s) => s.vendor_id === vendor.id
        );
        const repliedSessions = vendorSessions.filter(
          (s) => s.vendor_replied_at
        );
        const responseRate =
          vendorSessions.length > 0
            ? Math.round((repliedSessions.length / vendorSessions.length) * 100)
            : 0;

        return {
          ...vendor,
          totalSessions: vendorSessions.length,
          repliedSessions: repliedSessions.length,
          pendingSessions: vendorSessions.filter(
            (s) => s.vendor_notified_at && !s.vendor_replied_at
          ).length,
          responseRate,
        };
      })
      .sort((a, b) => b.totalSessions - a.totalSessions);
  };

  // Shipping Category Analytics
  const getShippingCategories = () => {
    const categories: Record<
      string,
      { count: number; value: string; percentage: number }
    > = {};

    sessions.forEach((session) => {
      const category = session.service_type || "Standard Shipping";
      if (!categories[category]) {
        categories[category] = { count: 0, value: category, percentage: 0 };
      }
      categories[category].count++;
    });

    const total = sessions.length;
    Object.keys(categories).forEach((key) => {
      categories[key].percentage =
        total > 0 ? Math.round((categories[key].count / total) * 100) : 0;
    });

    return Object.values(categories).sort((a, b) => b.count - a.count);
  };

  // AI-powered insights
  const generateInsights = () => {
    const insights = [];

    if (sessions.length > 0) {
      const avgResponseTime =
        sessions
          .filter((s) => s.vendor_notified_at && s.vendor_replied_at)
          .reduce((acc, s) => {
            const diff =
              new Date(s.vendor_replied_at!).getTime() -
              new Date(s.vendor_notified_at!).getTime();
            return acc + diff;
          }, 0) / sessions.filter((s) => s.vendor_replied_at).length;

      if (avgResponseTime) {
        const hours = Math.round(avgResponseTime / (1000 * 60 * 60));
        insights.push({
          type: "success",
          text: `Average vendor response time is ${hours} hours`,
        });
      }
    }

    const topVendor = getVendorStats()[0];
    if (topVendor && topVendor.totalSessions > 0) {
      insights.push({
        type: "info",
        text: `${topVendor.name} is your most active vendor with ${topVendor.totalSessions} sessions`,
      });
    }

    const unassignedCount = sessions.filter((s) => !s.vendor_id).length;
    if (unassignedCount > 0) {
      insights.push({
        type: "warning",
        text: `${unassignedCount} sessions are waiting to be assigned to vendors`,
      });
    }

    return insights;
  };

  const vendorStats = getVendorStats();
  const shippingCategories = getShippingCategories();
  const insights = generateInsights();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const hasData = stats.total_emails > 0 || stats.total_shipments > 0;

  return (
    <div className="p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
        <p className="text-sm text-gray-600 mt-1">
          Monitor performance and track key metrics
        </p>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <BarChart3 className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No analytics data available
          </h3>
          <p className="text-sm text-gray-600 text-center max-w-md">
            Analytics data will appear here once emails are processed and
            shipment sessions are created. Start by checking your emails to
            begin collecting data.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Emails */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  12%
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {stats.total_emails}
              </div>
              <div className="text-sm text-gray-600">Total Emails</div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-500">This month</div>
              </div>
            </div>

            {/* Shipping Requests */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  8%
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {stats.shipping_requests}
              </div>
              <div className="text-sm text-gray-600">Shipping Requests</div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-500">
                  {processingRate}% of total emails
                </div>
              </div>
            </div>

            {/* Total Shipments */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Package className="w-6 h-6 text-indigo-600" />
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  15%
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {stats.total_shipments}
              </div>
              <div className="text-sm text-gray-600">Active Sessions</div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-500">In progress</div>
              </div>
            </div>

            {/* Completion Rate */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-emerald-600" />
                </div>
                <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  5%
                </span>
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-1">
                {completionRate}%
              </div>
              <div className="text-sm text-gray-600">Completion Rate</div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-500">
                  {stats.complete_shipments} of {stats.total_shipments}{" "}
                  completed
                </div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Email Processing Overview */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Email Processing Overview
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">
                      Shipping Requests
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {stats.shipping_requests}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${processingRate}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Other Emails</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {stats.total_emails - stats.shipping_requests}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${100 - processingRate}%` }}
                    ></div>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      Total Emails
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {stats.total_emails}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Shipment Status */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Shipment Status
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-sm text-gray-600">Completed</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {stats.complete_shipments}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${completionRate}%` }}
                    ></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span className="text-sm text-gray-600">Pending</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      {stats.incomplete_shipments}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-amber-600 h-2 rounded-full"
                      style={{ width: `${100 - completionRate}%` }}
                    ></div>
                  </div>
                </div>
                <div className="pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      Total Sessions
                    </span>
                    <span className="text-lg font-bold text-gray-900">
                      {stats.total_shipments}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Performance Metrics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {stats.total_emails}
                  </div>
                  <div className="text-sm text-gray-600">Emails Processed</div>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600 font-semibold">
                      +12% from last month
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {completionRate}%
                  </div>
                  <div className="text-sm text-gray-600">Success Rate</div>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600 font-semibold">
                      +5% improvement
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">2.4h</div>
                  <div className="text-sm text-gray-600">Avg Response Time</div>
                  <div className="flex items-center gap-1 mt-1">
                    <TrendingDown className="w-3 h-3 text-green-600" />
                    <span className="text-xs text-green-600 font-semibold">
                      -18% faster
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Insights */}
          {insights.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  AI-Powered Insights
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {insights.map((insight, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      insight.type === "success"
                        ? "bg-green-50 border-green-200"
                        : insight.type === "warning"
                        ? "bg-amber-50 border-amber-200"
                        : "bg-blue-50 border-blue-200"
                    }`}
                  >
                    <p className="text-sm text-gray-700">{insight.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vendor Performance */}
          {vendorStats.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Vendor Performance
                </h3>
              </div>
              <div className="space-y-4">
                {vendorStats.slice(0, 5).map((vendor) => (
                  <div
                    key={vendor.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Truck className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">
                          {vendor.name}
                        </div>
                        <div className="text-sm text-gray-600">
                          {vendor.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-gray-900">
                          {vendor.totalSessions}
                        </div>
                        <div className="text-xs text-gray-600">Sessions</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">
                          {vendor.repliedSessions}
                        </div>
                        <div className="text-xs text-gray-600">Replied</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-600">
                          {vendor.pendingSessions}
                        </div>
                        <div className="text-xs text-gray-600">Pending</div>
                      </div>
                      <div className="text-center min-w-[80px]">
                        <div className="text-lg font-bold text-blue-600">
                          {vendor.responseRate}%
                        </div>
                        <div className="text-xs text-gray-600">
                          Response Rate
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {vendorStats.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No vendor data available yet
                </div>
              )}
            </div>
          )}

          {/* Shipping Categories */}
          {shippingCategories.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Box className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Shipping Categories
                </h3>
              </div>
              <div className="space-y-4">
                {shippingCategories.map((category, index) => (
                  <div key={index}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        {category.value}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          {category.count} shipments
                        </span>
                        <span className="text-sm font-semibold text-gray-900">
                          {category.percentage}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${
                          index === 0
                            ? "bg-blue-600"
                            : index === 1
                            ? "bg-green-600"
                            : index === 2
                            ? "bg-indigo-600"
                            : "bg-purple-600"
                        }`}
                        style={{ width: `${category.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
              {shippingCategories.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No shipping category data available yet
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Analytics;
