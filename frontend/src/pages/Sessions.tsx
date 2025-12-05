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
  FileText,
  Calendar,
} from "lucide-react";
import { sessionsApi, vendorsApi } from "../services/api";
import type { ShipmentSession, Vendor } from "../types";

// ==========================================
// 1. SUB-COMPONENT: SMART PAGINATION
// ==========================================

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

  const paginationRange = useMemo(() => {
    const delta = 1;
    const range = [];

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
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-t border-gray-200 pt-6 mt-2">
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
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors"
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
                className={`min-w-[32px] h-8 px-2 flex items-center justify-center text-sm font-medium rounded-lg transition-all ${
                  currentPage === page
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                    : "text-gray-600 hover:bg-gray-50 hover:text-blue-600 border border-transparent hover:border-gray-200"
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
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30 transition-colors"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 2. MAIN COMPONENT
// ==========================================

const Sessions: React.FC = () => {
  // --- Data State ---
  const [sessions, setSessions] = useState<ShipmentSession[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Pagination State ---
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);

  // --- Filter State ---
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // --- Modal States ---
  // 1. Assign Vendor Modal
  const [selectedSession, setSelectedSession] =
    useState<ShipmentSession | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  // 2. View Details Modal (For long text)
  const [viewSession, setViewSession] = useState<ShipmentSession | null>(null);

  // --- Data Loading ---
  const loadData = async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * pageSize;
      const [sessionsRes, vendorsRes] = await Promise.all([
        sessionsApi.getAll(undefined, undefined, pageSize, offset),
        vendorsApi.getAll(),
      ]);

      const sortedSessions = sessionsRes.data.sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setSessions(sortedSessions);
      setVendors(vendorsRes.data);

      // Estimate total items for pagination
      const calculatedTotal =
        sessionsRes.data.length < pageSize
          ? offset + sessionsRes.data.length
          : offset + pageSize * page;
      setTotalItems(calculatedTotal);
    } catch (error: any) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefresh = () => {
    loadData();
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [page, pageSize]);

  // --- Assignment Logic ---
  const handleAssignVendor = async () => {
    if (!selectedSession || !selectedVendor) return;
    try {
      setAssigning(true);
      await sessionsApi.assignVendor(
        selectedSession.id,
        parseInt(selectedVendor)
      );
      setShowAssignModal(false);
      setSelectedSession(null);
      setSelectedVendor("");
      loadData();
    } catch (error) {
      console.error("Failed to assign vendor:", error);
      alert("Failed to assign vendor");
    } finally {
      setAssigning(false);
    }
  };

  // --- Helpers ---
  const getVendorName = (vendorId?: number) => {
    if (!vendorId) return null;
    return vendors.find((v) => v.id === vendorId)?.name;
  };

  const getSessionDisplayStatus = (session: ShipmentSession) => {
    if (!session.vendor_id) {
      return {
        label: "Action Required",
        classes: "bg-gray-100 text-gray-700 ring-gray-600/20",
        icon: AlertCircle,
      };
    }
    if (session.vendor_replied_at) {
      return {
        label: "Completed",
        classes: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
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
          <p className="text-gray-500 font-medium font-poppins">
            Loading Sessions...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-8 font-poppins text-[#1A1C21]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'); .font-poppins { font-family: 'Poppins', sans-serif; }`}</style>

      {/* Header */}
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
            className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-white bg-gray-50 border border-transparent hover:border-gray-200 rounded-xl transition-all shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-8 overflow-x-auto pb-px">
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
                className={`pb-4 text-sm font-medium border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {filter.label}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
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
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="text-lg font-bold text-gray-900">No sessions found</h3>
          <p className="text-gray-500 text-sm mt-1">
            There are no shipments matching this filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {filteredSessions.map((session) => {
            const status = getSessionDisplayStatus(session);
            const StatusIcon = status.icon;

            return (
              <div
                key={session.id}
                className="group bg-white rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.04)] transition-all duration-300 overflow-hidden"
              >
                {/* Card Header */}
                <div className="px-6 py-4 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/30">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm text-blue-600 font-bold text-xs">
                      #{session.id}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">
                          {session.sender_name || "Unknown Shipper"}
                        </span>
                        <span className="text-gray-300">•</span>
                        <span className="text-xs text-gray-500 font-medium">
                          {new Date(session.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">
                        ID: {session.id}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${status.classes}`}
                  >
                    <StatusIcon className="w-3.5 h-3.5" />
                    {status.label}
                  </span>
                </div>

                {/* Card Body */}
                <div className="p-6">
                  {/* Route Info */}
                  <div className="flex flex-col md:flex-row gap-8 mb-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                        <MapPin className="w-3.5 h-3.5" /> Origin
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {session.sender_city || "N/A"}, {session.sender_country}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {session.sender_address}
                      </p>
                    </div>

                    <div className="hidden md:flex items-center justify-center px-2">
                      <ArrowRight className="w-5 h-5 text-gray-200" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                        <MapPin className="w-3.5 h-3.5" /> Destination
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {session.recipient_city || "N/A"},{" "}
                        {session.recipient_country}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {session.recipient_address}
                      </p>
                    </div>
                  </div>

                  {/* Package Description (With Truncation Handling) */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-start gap-4 mb-6">
                    <Box className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-bold text-gray-500 uppercase">
                          Package Details
                        </p>
                        <button
                          onClick={() => setViewSession(session)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline transition-all"
                        >
                          View Full Details
                        </button>
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {session.package_description || "Standard Package"}
                      </p>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mt-4">
                    <div className="flex-1 w-full">
                      {session.missing_fields &&
                      session.missing_fields.length > 0 ? (
                        <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-800 text-xs px-3 py-2 rounded-lg border border-amber-100 font-medium">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>
                            Missing: {session.missing_fields.join(", ")}
                          </span>
                        </div>
                      ) : session.vendor_id ? (
                        <div className="inline-flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100">
                          <Truck className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-500">Assigned to:</span>
                          <span className="font-bold text-gray-900">
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
                        className="w-full lg:w-auto px-6 py-2.5 bg-[#1A1C21] text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Truck className="w-4 h-4" />
                        Assign Vendor
                      </button>
                    )}
                  </div>

                  {/* Vendor Reply Preview */}
                  {session.vendor_replied_at &&
                    session.vendor_reply_content && (
                      <div className="mt-6 pt-4 border-t border-gray-100">
                        <div className="flex items-start gap-3">
                          <MessageSquare className="w-4 h-4 text-blue-500 mt-1" />
                          <div className="flex-1">
                            <p className="text-xs font-bold text-gray-900 mb-1">
                              Latest Reply
                            </p>
                            <p className="text-sm text-gray-600 bg-blue-50/50 p-3 rounded-xl rounded-tl-none border border-blue-100 italic">
                              "{session.vendor_reply_content.substring(0, 180)}
                              {session.vendor_reply_content.length > 180 &&
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

      {/* Pagination Footer */}
      <Pagination
        currentPage={page}
        totalItems={totalItems}
        pageSize={pageSize}
        onPageChange={(p) => setPage(p)}
      />

      {/* ========================================== */}
      {/* 3. MODALS */}
      {/* ========================================== */}

      {/* --- View Details Modal (For Long Text) --- */}
      {viewSession && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] scale-100 transition-all">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Package className="w-6 h-6 text-blue-600" />
                  Shipment Details
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-1">
                  Session ID: {viewSession.id}
                </p>
              </div>
              <button
                onClick={() => setViewSession(null)}
                className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-8 overflow-y-auto">
              {/* Status Banner */}
              <div
                className={`p-5 rounded-2xl mb-8 flex items-start gap-4 border ${
                  viewSession.status === "complete"
                    ? "bg-emerald-50 border-emerald-100"
                    : "bg-blue-50 border-blue-100"
                }`}
              >
                <div
                  className={`mt-0.5 p-1.5 rounded-full ${
                    viewSession.status === "complete"
                      ? "bg-emerald-200 text-emerald-700"
                      : "bg-blue-200 text-blue-700"
                  }`}
                >
                  {viewSession.status === "complete" ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Clock className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h4
                    className={`text-base font-bold ${
                      viewSession.status === "complete"
                        ? "text-emerald-900"
                        : "text-blue-900"
                    }`}
                  >
                    Status:{" "}
                    {viewSession.status === "complete"
                      ? "Completed"
                      : "In Progress"}
                  </h4>
                  <p
                    className={`text-sm mt-1 ${
                      viewSession.status === "complete"
                        ? "text-emerald-700"
                        : "text-blue-700"
                    }`}
                  >
                    Created on{" "}
                    {new Date(viewSession.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Package Description (Full View) */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3 text-gray-900 font-bold text-sm uppercase tracking-wide">
                  <FileText className="w-4 h-4 text-gray-400" />
                  Package Description
                </div>
                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap font-medium">
                  {viewSession.package_description ||
                    "No description provided."}
                </div>
              </div>

              {/* Route Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div className="p-5 rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Origin
                  </h5>
                  <p className="font-bold text-gray-900 text-lg">
                    {viewSession.sender_city}, {viewSession.sender_country}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {viewSession.sender_address}
                  </p>
                  <div className="mt-4 pt-4 border-t border-gray-50 text-xs font-medium text-gray-400 flex justify-between">
                    <span>Sender:</span>
                    <span className="text-gray-900">
                      {viewSession.sender_name}
                    </span>
                  </div>
                </div>
                <div className="p-5 rounded-2xl border border-gray-100 bg-white shadow-sm">
                  <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> Destination
                  </h5>
                  <p className="font-bold text-gray-900 text-lg">
                    {viewSession.recipient_city},{" "}
                    {viewSession.recipient_country}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {viewSession.recipient_address}
                  </p>
                  <div className="mt-4 pt-4 border-t border-gray-50 text-xs font-medium text-gray-400 flex justify-between">
                    <span>Recipient:</span>
                    <span className="text-gray-900">
                      {viewSession.recipient_name}
                    </span>
                  </div>
                </div>
              </div>

              {/* Vendor Info (If Assigned) */}
              {viewSession.vendor_id && (
                <div className="border-t border-gray-100 pt-8">
                  <div className="flex items-center gap-2 mb-4 text-gray-900 font-bold text-sm uppercase tracking-wide">
                    <Truck className="w-4 h-4 text-gray-400" />
                    Assigned Partner
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 border border-gray-200 font-bold text-lg shadow-sm">
                      {getVendorName(viewSession.vendor_id)?.charAt(0)}
                    </div>
                    <div>
                      <p className="text-base font-bold text-gray-900">
                        {getVendorName(viewSession.vendor_id)}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        ID: {viewSession.vendor_id}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end">
              <button
                onClick={() => setViewSession(null)}
                className="px-8 py-3 bg-white border border-gray-200 text-gray-700 font-bold text-sm rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Assign Vendor Modal --- */}
      {showAssignModal && selectedSession && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Assign Vendor</h3>
              <button
                onClick={() => setShowAssignModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-blue-50 rounded-2xl p-5 mb-6 border border-blue-100">
                <p className="text-xs text-blue-600 uppercase font-bold mb-1">
                  Target Shipment
                </p>
                <p className="text-sm font-bold text-blue-900">
                  Session #{selectedSession.id}
                </p>
                <p className="text-sm text-blue-700 mt-1 line-clamp-2">
                  {selectedSession.package_description || "No description"}
                </p>
              </div>

              <label className="block text-sm font-bold text-gray-700 mb-2">
                Select Partner
              </label>
              <div className="relative">
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="w-full appearance-none bg-white border border-gray-200 text-gray-900 text-sm rounded-xl focus:ring-blue-500 focus:border-blue-500 block p-3.5 pr-8 shadow-sm transition-shadow font-medium"
                >
                  <option value="">Choose a vendor...</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name} • {vendor.company || "Freelance"}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-500">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div className="px-6 py-5 bg-gray-50 flex gap-3 justify-end border-t border-gray-100">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedVendor("");
                  setSelectedSession(null);
                }}
                className="px-5 py-2.5 text-sm font-bold text-gray-600 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignVendor}
                disabled={!selectedVendor || assigning}
                className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-200 transition-all flex items-center gap-2"
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
