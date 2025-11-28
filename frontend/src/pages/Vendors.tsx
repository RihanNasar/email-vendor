import React, { useEffect, useState } from "react";
import {
  Users,
  Mail,
  Phone,
  MapPin,
  Plus,
  Edit,
  Trash2,
  X,
  Package,
  Eye,
} from "lucide-react";
import { vendorsApi, sessionsApi } from "../services/api";
import type { Vendor, ShipmentSession } from "../types";

const Vendors: React.FC = () => {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [sessions, setSessions] = useState<ShipmentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    vendor_type: "shipping" as
      | "shipping"
      | "logistics"
      | "freight"
      | "courier"
      | "warehouse",
    active: true,
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const [vendorsRes, sessionsRes] = await Promise.all([
        vendorsApi.getAll(),
        sessionsApi.getAll(),
      ]);
      setVendors(vendorsRes.data);
      setSessions(sessionsRes.data);
    } catch (error) {
      console.error("Failed to load vendors:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await vendorsApi.create({
        ...formData,
        // created_at and updated_at are handled by backend
      } as any);
      await loadVendors();
      setShowAddModal(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        address: "",
        vendor_type: "shipping",
        active: true,
      });
    } catch (error) {
      console.error("Failed to add vendor:", error);
      alert("Failed to add vendor. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor) return;
    try {
      setSaving(true);
      // FIX: Pass selectedVendor.id directly as number (removed .toString())
      await vendorsApi.update(selectedVendor.id, formData);
      await loadVendors();
      setShowEditModal(false);
      setSelectedVendor(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        address: "",
        vendor_type: "shipping",
        active: true,
      });
    } catch (error) {
      console.error("Failed to update vendor:", error);
      alert("Failed to update vendor. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVendor = async (id: number) => {
    if (!confirm("Are you sure you want to delete this vendor?")) return;
    try {
      // FIX: Pass id directly as number (removed .toString())
      await vendorsApi.delete(id);
      await loadVendors();
    } catch (error) {
      console.error("Failed to delete vendor:", error);
      alert("Failed to delete vendor. Please try again.");
    }
  };

  const getVendorSessions = (vendorId: number) => {
    return sessions.filter((s) => s.vendor_id === vendorId);
  };

  const getVendorSessionStats = (vendorId: number) => {
    const vendorSessions = getVendorSessions(vendorId);
    return {
      total: vendorSessions.length,
      pending: vendorSessions.filter(
        (s) => s.vendor_notified_at && !s.vendor_replied_at
      ).length,
      replied: vendorSessions.filter((s) => s.vendor_replied_at).length,
    };
  };

  const openEditModal = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setFormData({
      name: vendor.name,
      email: vendor.email,
      phone: vendor.phone || "",
      address: vendor.address || "",
      vendor_type: vendor.vendor_type,
      active: vendor.active,
    });
    setShowEditModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading vendors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Vendors</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your shipping vendor partners
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Vendor
        </button>
      </div>

      {vendors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Users className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No vendors found
          </h3>
          <p className="text-sm text-gray-600 text-center max-w-md mb-6">
            No vendors have been added yet. Click the "Add Vendor" button above
            to create your first vendor.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Add Your First Vendor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.map((vendor) => {
            const stats = getVendorSessionStats(vendor.id);
            return (
              <div
                key={vendor.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {vendor.name}
                      </h3>
                      <p className="text-xs text-gray-500">
                        Vendor #{vendor.id}
                      </p>
                    </div>
                  </div>
                  {stats.total > 0 && (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                      {stats.total} {stats.total === 1 ? "session" : "sessions"}
                    </span>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700 truncate">
                      {vendor.email}
                    </span>
                  </div>
                  {vendor.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-700">{vendor.phone}</span>
                    </div>
                  )}
                  {vendor.address && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                      <span className="text-gray-700">{vendor.address}</span>
                    </div>
                  )}
                </div>

                {stats.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-600">Sessions Overview</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 px-2 py-1.5 rounded-lg bg-blue-50 text-center">
                        <div className="text-xs text-blue-600 font-medium">
                          Total
                        </div>
                        <div className="text-lg font-bold text-blue-700">
                          {stats.total}
                        </div>
                      </div>
                      <div className="flex-1 px-2 py-1.5 rounded-lg bg-amber-50 text-center">
                        <div className="text-xs text-amber-600 font-medium">
                          Pending
                        </div>
                        <div className="text-lg font-bold text-amber-700">
                          {stats.pending}
                        </div>
                      </div>
                      <div className="flex-1 px-2 py-1.5 rounded-lg bg-green-50 text-center">
                        <div className="text-xs text-green-600 font-medium">
                          Replied
                        </div>
                        <div className="text-lg font-bold text-green-700">
                          {stats.replied}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedVendor(vendor);
                        setShowSessionsModal(true);
                      }}
                      className="w-full mt-3 px-3 py-2 border border-blue-300 rounded-lg text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4" />
                      View All Sessions
                    </button>
                  </div>
                )}

                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => openEditModal(vendor)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteVendor(vendor.id)}
                    className="px-3 py-2 border border-red-300 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Vendor Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                Add New Vendor
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setFormData({
                    name: "",
                    email: "",
                    phone: "",
                    address: "",
                    vendor_type: "shipping",
                    active: true,
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddVendor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Vendor name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="vendor@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+1 234 567 8900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full address"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setFormData({
                      name: "",
                      email: "",
                      phone: "",
                      address: "",
                      vendor_type: "shipping",
                      active: true,
                    });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Adding..." : "Add Vendor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Vendor Modal */}
      {showEditModal && selectedVendor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Edit Vendor</h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedVendor(null);
                  setFormData({
                    name: "",
                    email: "",
                    phone: "",
                    address: "",
                    vendor_type: "shipping",
                    active: true,
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditVendor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Vendor name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="vendor@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+1 234 567 8900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full address"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedVendor(null);
                    setFormData({
                      name: "",
                      email: "",
                      phone: "",
                      address: "",
                      vendor_type: "shipping",
                      active: true,
                    });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Sessions Modal */}
      {showSessionsModal && selectedVendor && (
        <div
          onClick={() => {
            setShowSessionsModal(false);
            setSelectedVendor(null);
          }}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">
                    {selectedVendor.name} - Sessions
                  </h3>
                  <p className="text-sm text-gray-600">
                    {getVendorSessions(selectedVendor.id).length} total sessions
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowSessionsModal(false);
                    setSelectedVendor(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {getVendorSessions(selectedVendor.id).length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">
                    No sessions assigned to this vendor yet.
                  </p>
                </div>
              ) : (
                getVendorSessions(selectedVendor.id).map((session) => (
                  <div
                    key={session.id}
                    className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Package className="w-5 h-5 text-blue-600" />
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
                      <div className="flex gap-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            session.status === "complete"
                              ? "bg-green-100 text-green-700"
                              : session.status === "pending_info"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {session.status}
                        </span>
                        {session.vendor_replied_at ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            Replied
                          </span>
                        ) : session.vendor_notified_at ? (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                            Pending Reply
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                            Assigned
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">From:</span>{" "}
                        <span className="text-gray-900">
                          {session.sender_name || "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">To:</span>{" "}
                        <span className="text-gray-900">
                          {session.recipient_name || "N/A"}
                        </span>
                      </div>
                    </div>

                    {session.package_description && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-700">
                        {session.package_description}
                      </div>
                    )}

                    {session.vendor_notified_at && (
                      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                        Notified:{" "}
                        {new Date(session.vendor_notified_at).toLocaleString()}
                        {session.vendor_replied_at && (
                          <span className="ml-4">
                            Replied:{" "}
                            {new Date(
                              session.vendor_replied_at
                            ).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Vendors;
