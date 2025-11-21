import axios from "axios";
import type { Vendor, ShipmentSession, Email, DashboardStats } from "../types";

const API_BASE_URL = "http://localhost:8000/api/v1";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Vendors API
export const vendorsApi = {
  getAll: (vendorType?: string, active?: boolean) =>
    api.get<Vendor[]>("/vendors", {
      params: { vendor_type: vendorType, active },
    }),

  getById: (id: string) => api.get<Vendor>(`/vendors/${id}`),

  create: (vendor: Omit<Vendor, "id" | "createdAt" | "updatedAt">) =>
    api.post<Vendor>("/vendors", vendor),

  update: (id: string, vendor: Partial<Vendor>) =>
    api.put<Vendor>(`/vendors/${id}`, vendor),

  delete: (id: string) => api.delete(`/vendors/${id}`),

  search: (query: string, vendorType?: string) =>
    api.get<Vendor[]>("/vendors/search", {
      params: { query, vendor_type: vendorType },
    }),
};

// Sessions API
export const sessionsApi = {
  getAll: (status?: string, vendorId?: string) =>
    api.get<ShipmentSession[]>("/sessions/", {
      params: { status, vendor_id: vendorId },
    }),

  getById: (id: string) => api.get<ShipmentSession>(`/sessions/${id}`),

  assignVendor: (sessionId: string, vendorId: string) =>
    api.post(`/sessions/${sessionId}/assign`, { vendor_id: vendorId }),

  updateStatus: (sessionId: string, status: string) =>
    api.patch(`/sessions/${sessionId}/status`, { status }),
};

// Emails API
export const emailsApi = {
  getAll: (isShippingRequest?: boolean) =>
    api.get<Email[]>("/emails/", {
      params: { is_shipping_request: isShippingRequest },
    }),

  getById: (id: string) => api.get<Email>(`/emails/${id}`),

  process: () => api.post("/emails/process"),
};

// Dashboard API
export const dashboardApi = {
  getStats: () => api.get<DashboardStats>("/dashboard/stats"),
};

export default api;
