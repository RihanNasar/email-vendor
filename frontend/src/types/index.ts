export interface Vendor {
  id: number;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  vendor_type: "shipping" | "logistics" | "freight" | "courier" | "warehouse";
  description?: string;
  address?: string;
  rating?: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShipmentSession {
  id: number;
  email_id: number;
  vendor_id?: number;
  vendor_notified_at?: string;
  vendor_replied_at?: string;
  vendor_reply_message_id?: string;
  vendor_reply_content?: string;
  missing_info_updated_at?: string;
  status: "incomplete" | "pending_info" | "complete" | "created";
  sender_name?: string;
  sender_address?: string;
  sender_city?: string;
  sender_state?: string;
  sender_zipcode?: string;
  sender_country?: string;
  sender_phone?: string;
  recipient_name?: string;
  recipient_address?: string;
  recipient_city?: string;
  recipient_state?: string;
  recipient_zipcode?: string;
  recipient_country?: string;
  recipient_phone?: string;
  package_weight?: string;
  package_dimensions?: string;
  package_description?: string;
  package_value?: string;
  service_type?: string;
  pickup_date?: string;
  delivery_date?: string;
  missing_fields?: string[];
  extracted_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface Email {
  id: number;
  message_id: string;
  thread_id?: string;
  sender_email: string;
  sender_name?: string;
  subject?: string;
  body?: string;
  category: "shipping_request" | "logistics_inquiry" | "other";
  is_shipping_request: boolean;
  status: "unprocessed" | "processing" | "completed" | "failed";
  processed_at?: string;
  error_message?: string;
  received_at: string;
  created_at: string;
  updated_at: string;
}

export interface EmailResponse {
  id: string;
  emailId: string;
  responseContent: string;
  sentAt: string;
  status: "sent" | "failed";
}

export interface DashboardStats {
  total_emails: number;
  shipping_requests: number;
  total_shipments: number;
  complete_shipments: number;
  incomplete_shipments: number;
}
