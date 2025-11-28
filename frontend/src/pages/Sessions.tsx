import React, { useEffect, useState, useMemo } from "react";
import {
  Package,
  User,
  MapPin,
  Box,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle,
  MessageSquare,
  ArrowRight,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { sessionsApi, vendorsApi } from "../services/api";
import type { ShipmentSession, Vendor } from "../types";

// --- Sub-Component: Smart Pagination ---
interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
}) => {
  const totalPages = Math.ceil(totalItems / pageSize);

  // Logic to show page numbers with ... (ellipses)
  const paginationRange = useMemo(() => {
    const delta = 1; // How many pages to show around the current page
    const range = [];

    // Always show first page, last page, and pages around current
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        range.push(i);
      } else if (range[range.length - 1] !== "...") {
        range.push("...");
      }
    }
    return range;
  }, [currentPage, totalPages]);

  if (totalItems === 0) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-gray-200 pt-4 mt-6">
      <div className="text-sm text-gray-500">
        Showing <span className="font-medium text-gray-900">{startItem}</span>{" "}
        to <span className="font-medium text-gray-900">{endItem}</span> of{" "}
        <span className="font-medium text-gray-900">{totalItems}</span> results
      </div>

      <div className="flex items-center gap-1">
        {/* First / Prev Buttons */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="p-2 rounded-md hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-md hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Numbered Buttons */}
        <div className="flex items-center gap-1 mx-2">
          {paginationRange.map((page, idx) =>
            typeof page === "number" ? (
              <button
                key={idx}
                onClick={() => onPageChange(page)}
                className={`min-w-[32px] h-8 px-2 flex items-center justify-center text-sm font-medium rounded-md transition-all ${
                  currentPage === page
                    ? "bg-blue-600 text-white shadow-sm" // Matches your blue theme
                    : "text-gray-600 hover:bg-gray-100 hover:text-blue-600 border border-transparent hover:border-gray-200"
                }`}
              >
                {page}
              </button>
            ) : (
              <span key={idx} className="px-1 text-gray-400 text-sm">
                ...
              </span>
            )
          )}
        </div>

        {/* Next / Last Buttons */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-md hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-md hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// --- Main Component ---
const Sessions: React.FC = () => {
  const [sessions, setSessions] = useState<ShipmentSession[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0); // Added for pagination
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] =
    useState<ShipmentSession | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const loadData = async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * pageSize;
      const [sessionsRes, vendorsRes] = await Promise.all([
        sessionsApi.getAll(undefined, undefined, pageSize, offset),
        vendorsApi.getAll(),
      ]);

      // Sort sessions by created_at descending (newest first)
      const sortedSessions = sessionsRes.data.sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSessions(sortedSessions);
      setVendors(vendorsRes.data);

      // Estimate total if API doesn't provide it directly
      // Use a simple fallback: if less than pageSize, it's the last page
      const calculatedTotal =
        sessionsRes.data.length < pageSize
          ? offset + sessionsRes.data.length
          : offset + pageSize * page;
      setTotalItems(calculatedTotal);
    } catch (error: any) {
      console.error("Failed to load data:", error);
      alert(
        "Failed to connect to backend. Make sure the backend server is running."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = () => {
    loadData();
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [page, pageSize]);

  const handleAssignVendor = async () => {
    if (!selectedSession || !selectedVendor) return;
    try {
      setAssigning(true);
      // FIX: Ensure ID is passed as a number, and vendor string is parsed to int
      await sessionsApi.assignVendor(
        selectedSession.id,
        parseInt(selectedVendor)
      );
      setShowAssignModal(false);
      setSelectedSession(null);
      setSelectedVendor("");
      loadData(); // Refresh data
    } catch (error) {
      console.error("Failed to assign vendor:", error);
      alert("Failed to assign vendor");
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
      return {
        label: "Incomplete",
        classes: "bg-gray-100 text-gray-700 ring-gray-600/20",
        icon: AlertCircle,
      };
    }
    if (session.vendor_replied_at) {
      return {
        label: "Replied",
        classes: "bg-green-50 text-green-700 ring-green-600/20",
        icon: CheckCircle,
      };
    }
    if (session.vendor_notified_at) {
      return {
        label: "Pending Reply",
        classes: "bg-blue-50 text-blue-700 ring-blue-700/10",
        icon: Clock,
      };
    }
    return {
      label: "Assigned",
      classes: "bg-blue-50 text-blue-700 ring-blue-700/10",
      icon: Truck,
    };
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

  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 font-medium">Syncing sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
            Shipment Sessions
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage incoming quotes and vendor assignments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleManualRefresh}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6 overflow-x-auto pb-px">
          {[
            { key: "all", label: "All Sessions" },
            { key: "unassigned", label: "Action Required" },
            { key: "pending_reply", label: "Awaiting Vendor" },
            { key: "replied", label: "Completed" },
          ].map((filter) => {
            const isActive = filterStatus === filter.key;
            return (
              <button
                key={filter.key}
                onClick={() => setFilterStatus(filter.key)}
                className={`pb-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {filter.label}
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    isActive
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {counts[filter.key as keyof typeof counts]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Grid */}
      {filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">
            No sessions found
          </h3>
          <p className="text-gray-500 text-sm mt-1">
            Current filter returned no results.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredSessions.map((session) => {
            const status = getSessionDisplayStatus(session);
            const StatusIcon = status.icon;

            return (
              <div
                key={session.id}
                className="group bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                {/* Card Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm text-blue-600 font-bold text-xs">
                      #{session.id}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          {session.sender_name || "Unknown Shipper"}
                        </span>
                        <span className="text-gray-300">•</span>
                        <span className="text-xs text-gray-500 font-medium">
                          {new Date(session.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {/* Email field isn't directly on session, handled via sender_name logic usually */}
                        Session ID: {session.id}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.classes}`}
                  >
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.label}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-6">
                  {/* Route Info */}
                  <div className="flex flex-col md:flex-row gap-6 mb-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        <MapPin className="w-3.5 h-3.5" /> Origin
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {session.sender_city || "N/A"}, {session.sender_country}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {session.sender_address}
                      </p>
                    </div>

                    <div className="hidden md:flex items-center justify-center px-4">
                      <ArrowRight className="w-5 h-5 text-gray-300" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                        <MapPin className="w-3.5 h-3.5" /> Destination
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {session.recipient_city || "N/A"},{" "}
                        {session.recipient_country}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {session.recipient_address}
                      </p>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-100 flex items-start gap-3">
                      <Box className="w-4 h-4 text-gray-400 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">Package</p>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {session.package_description || "Standard Package"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Action Area / Missing Info */}
                  <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                    <div className="flex-1 w-full">
                      {session.missing_fields &&
                      session.missing_fields.length > 0 ? (
                        <div className="flex items-start gap-2 bg-gray-300 text-gray-800 text-xs px-3 py-2 rounded-md border border-orange-100">
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">Missing Info:</span>{" "}
                            {session.missing_fields.join(", ")}
                          </div>
                        </div>
                      ) : session.vendor_id ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md border border-gray-100 w-fit">
                          <User className="w-4 h-4 text-gray-400" />
                          Vendor:{" "}
                          <span className="font-medium text-gray-900">
                            {getVendorName(session.vendor_id)}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    {!session.vendor_id && (
                      <button
                        onClick={() => {
                          setSelectedSession(session);
                          setShowAssignModal(true);
                        }}
                        className="w-full lg:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 active:bg-blue-800 transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Truck className="w-4 h-4" />
                        Assign Vendor
                      </button>
                    )}
                  </div>

                  {/* Vendor Reply Content */}
                  {session.vendor_replied_at &&
                    session.vendor_reply_content && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-start gap-3">
                          <MessageSquare className="w-4 h-4 text-blue-500 mt-1" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-gray-900 mb-1">
                              Latest Reply
                            </p>
                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg rounded-tl-none border border-gray-200">
                              "{session.vendor_reply_content.substring(0, 200)}
                              {session.vendor_reply_content.length > 200 &&
                                "..."}
                              "
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Pagination Footer */}
      <Pagination
        currentPage={page}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={(p) => setPage(p)}
      />

      {/* Assign Vendor Modal */}
      {showAssignModal && selectedSession && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Assign Vendor</h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-100">
                <p className="text-xs text-blue-600 uppercase font-semibold mb-1">
                  Target Shipment
                </p>
                <p className="text-sm font-medium text-blue-900">
                  Session #{selectedSession.id}
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  {selectedSession.package_description || "No description"}
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Partner
              </label>
              <div className="relative">
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 pr-8 shadow-sm transition-shadow"
                >
                  <option value="">Choose a vendor...</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name} • {vendor.company || "Freelance"}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end border-t border-gray-100">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedVendor("");
                  setSelectedSession(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignVendor}
                disabled={!selectedVendor || assigning}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-2"
              >
                {assigning ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>Confirm Assignment</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sessions;
