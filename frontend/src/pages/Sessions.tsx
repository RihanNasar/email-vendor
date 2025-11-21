import React, { useEffect, useState } from "react";
import {
  Package,
  User,
  MapPin,
  Calendar,
  Box,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  MessageSquare,
} from "lucide-react";
import { sessionsApi, vendorsApi } from "../services/api";
import type { ShipmentSession, Vendor } from "../types";

const Sessions: React.FC = () => {
  const [sessions, setSessions] = useState<ShipmentSession[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] =
    useState<ShipmentSession | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    loadData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Manual refresh handler
  const handleManualRefresh = () => {
    loadData();
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [sessionsRes, vendorsRes] = await Promise.all([
        sessionsApi.getAll(),
        vendorsApi.getAll(),
      ]);
      // Sort sessions by created_at descending (newest first)
      const sortedSessions = sessionsRes.data.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSessions(sortedSessions);
      setVendors(vendorsRes.data);
    } catch (error: any) {
      console.error("Failed to load data:", error);
      console.error("API Error:", error.response?.data || error.message);
      alert(
        "Failed to connect to backend. Make sure the backend server is running on http://localhost:8000"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAssignVendor = async () => {
    if (!selectedSession || !selectedVendor) return;

    try {
      setAssigning(true);
      await sessionsApi.assignVendor(
        selectedSession.id.toString(),
        selectedVendor
      );
      await loadData();
      setShowAssignModal(false);
      setSelectedVendor("");
      setSelectedSession(null);
      alert("Vendor assigned successfully!");
    } catch (error: any) {
      console.error("Failed to assign vendor:", error);
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to assign vendor. Please check if the backend is running.";
      alert(errorMessage);
    } finally {
      setAssigning(false);
    }
  };

  const getVendorName = (vendorId?: number) => {
    if (!vendorId) return null;
    return vendors.find((v) => v.id === vendorId)?.name;
  };

  const getSessionDisplayStatus = (session: ShipmentSession) => {
    if (!session.vendor_id) {
      return { label: "Incomplete", color: "bg-amber-100 text-amber-700" };
    }
    if (session.vendor_replied_at) {
      return { label: "Replied", color: "bg-green-100 text-green-700" };
    }
    if (session.vendor_notified_at) {
      return {
        label: "Assigned - Waiting for Reply",
        color: "bg-blue-100 text-blue-700",
      };
    }
    return { label: "Assigned", color: "bg-blue-100 text-blue-700" };
  };

  const filteredSessions = sessions.filter((session) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "replied") return session.vendor_replied_at;
    if (filterStatus === "pending_reply")
      return session.vendor_id && !session.vendor_replied_at;
    if (filterStatus === "unassigned") return !session.vendor_id;
    return session.status === filterStatus;
  });

  const counts = {
    all: sessions.length,
    unassigned: sessions.filter((s) => !s.vendor_id).length,
    pending_reply: sessions.filter((s) => s.vendor_id && !s.vendor_replied_at)
      .length,
    replied: sessions.filter((s) => s.vendor_replied_at).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Shipment Sessions
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage and track vendor assignments
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 pb-2 border-b border-gray-200 overflow-x-auto">
        {[
          { key: "all", label: "All" },
          { key: "unassigned", label: "Unassigned" },
          { key: "pending_reply", label: "Pending Reply" },
          { key: "replied", label: "Replied" },
        ].map((filter) => (
          <button
            key={filter.key}
            onClick={() => setFilterStatus(filter.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              filterStatus === filter.key
                ? "bg-blue-600 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {filter.label} ({counts[filter.key as keyof typeof counts]})
          </button>
        ))}
      </div>

      {filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Package className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No sessions found
          </h3>
          <p className="text-sm text-gray-600 text-center max-w-md">
            {filterStatus !== "all"
              ? `No sessions match the "${filterStatus.replace(
                  "_",
                  " "
                )}" filter.`
              : "No shipment sessions available yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredSessions.map((session) => (
            <div
              key={session.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">
                      Session #{session.id}
                    </div>
                    <div className="font-semibold text-gray-900">
                      {session.sender_name || "Unknown Sender"}
                    </div>
                  </div>
                </div>
                {(() => {
                  const displayStatus = getSessionDisplayStatus(session);
                  return (
                    <span
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold ${displayStatus.color}`}
                    >
                      {displayStatus.label}
                    </span>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-xs text-gray-500 mb-1">From</div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-900">
                      {session.sender_name || "N/A"}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500 mb-1">To</div>
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-900">
                      {session.recipient_name || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm mt-1">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">
                      {session.recipient_address || "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              {session.package_description && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 mb-4">
                  <Box className="w-4 h-4 text-gray-600" />
                  <span className="text-sm text-gray-700">
                    {session.package_description}
                  </span>
                </div>
              )}

              {session.missing_fields && session.missing_fields.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-4">
                  <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-amber-900">
                      Missing Information
                    </div>
                    <div className="text-xs text-amber-700 mt-1">
                      {session.missing_fields.join(", ")}
                    </div>
                    {session.missing_info_updated_at && (
                      <div className="text-xs text-amber-600 mt-1.5 font-medium">
                        Last updated:{" "}
                        {new Date(
                          session.missing_info_updated_at
                        ).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Vendor Status */}
              {session.vendor_id && (
                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <Truck className="w-4 h-4 text-blue-600" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-blue-900">
                        Assigned to {getVendorName(session.vendor_id)}
                      </div>
                      {session.vendor_notified_at && (
                        <div className="text-xs text-blue-700 mt-0.5">
                          Notified{" "}
                          {new Date(
                            session.vendor_notified_at
                          ).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                  </div>

                  {session.vendor_replied_at ? (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
                      <MessageSquare className="w-4 h-4 text-green-600 mt-0.5" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-green-900">
                          Vendor Replied
                        </div>
                        <div className="text-xs text-green-700 mt-0.5">
                          {new Date(session.vendor_replied_at).toLocaleString()}
                        </div>
                        {session.vendor_reply_content && (
                          <div className="mt-2 text-sm text-gray-700 bg-white p-2 rounded border border-green-200">
                            {session.vendor_reply_content.substring(0, 150)}
                            {session.vendor_reply_content.length > 150 && "..."}
                          </div>
                        )}
                      </div>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                  ) : session.vendor_notified_at ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <div className="text-sm text-amber-900">
                        Waiting for vendor reply...
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                {!session.vendor_id && (
                  <button
                    onClick={() => {
                      setSelectedSession(session);
                      setShowAssignModal(true);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <Truck className="w-4 h-4" />
                    Assign Vendor
                  </button>
                )}
                {session.vendor_id && <div className="flex-1"></div>}
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Calendar className="w-4 h-4" />
                  {new Date(session.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manual Refresh Button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={handleManualRefresh}
          className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors shadow"
        >
          Refresh
        </button>
      </div>

      {/* Assign Vendor Modal */}
      {showAssignModal && selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Assign Vendor
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Select a vendor for Session #{selectedSession.id}
            </p>

            <select
              value={selectedVendor}
              onChange={(e) => setSelectedVendor(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a vendor...</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name} - {vendor.email}
                </option>
              ))}
            </select>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedVendor("");
                  setSelectedSession(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignVendor}
                disabled={!selectedVendor || assigning}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assigning ? "Assigning..." : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sessions;
