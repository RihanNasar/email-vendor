import axios from "axios";
import type {
  Vendor,
  ShipmentSession,
  Email,
  DashboardStats,
  ShipmentSessionCreate,
} from "../types";

const API_BASE_URL = "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ==========================================
// VENDORS API
// ==========================================
export const vendorsApi = {
  getAll: (vendorType?: string, active?: boolean) =>
    api.get<Vendor[]>("/vendors", {
      params: { vendor_type: vendorType, active },
    }),

  getById: (id: number) => api.get<Vendor>(`/vendors/${id}`),

  create: (vendor: Omit<Vendor, "id" | "created_at" | "updated_at">) =>
    api.post<Vendor>("/vendors", vendor),

  update: (id: number, vendor: Partial<Vendor>) =>
    api.put<Vendor>(`/vendors/${id}`, vendor),

  delete: (id: number) => api.delete(`/vendors/${id}`),

  search: (query: string, vendorType?: string) =>
    api.get<Vendor[]>("/vendors/search", {
      params: { query, vendor_type: vendorType },
    }),
};

// ==========================================
// SESSIONS API
// ==========================================
export const sessionsApi = {
  getAll: (
    status?: string,
    vendorId?: string,
    limit: number = 20,
    offset: number = 0
  ) =>
    api.get<ShipmentSession[]>("/sessions/", {
      params: { status, vendor_id: vendorId, limit, offset },
    }),

  getById: (id: number) => api.get<ShipmentSession>(`/sessions/${id}`),

  // Create a session manually (used in converting queries)
  create: (data: ShipmentSessionCreate) =>
    api.post<ShipmentSession>("/sessions/", data),

  assignVendor: (sessionId: number, vendorId: number) =>
    api.post(`/sessions/${sessionId}/assign`, { vendor_id: vendorId }),

  updateStatus: (sessionId: number, status: string) =>
    api.put(`/sessions/${sessionId}/status`, { status }),
};

// ==========================================
// EMAILS API
// ==========================================
export const emailsApi = {
  // FIXED: Changed to use 'category' parameter instead of 'is_shipping_request'
  getAll: (
    category?: string, // Changed parameter name
    limit: number = 20,
    offset: number = 0
  ) =>
    api.get<Email[]>("/emails/", {
      params: { category, limit, offset }, // Changed to 'category'
    }),

  getById: (id: number) => api.get<Email>(`/emails/${id}`),

  // UPDATED: Now includes `email?: Email` in the response type definition
  reply: (emailId: number, content: string) =>
    api.post<{ success: boolean; messageId?: string; email?: Email }>(
      `/emails/${emailId}/reply`,
      { content }
    ),

  process: () =>
    api.post<{ processed: number; emails: Email[] }>("/emails/process"),
};

// ==========================================
// DASHBOARD API
// ==========================================
export const dashboardApi = {
  getStats: () => api.get<DashboardStats>("/dashboard/stats"),
};

export default api;
