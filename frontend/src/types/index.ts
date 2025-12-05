// ==========================================
// VENDOR TYPES
// ==========================================

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

// ==========================================
// SHIPMENT SESSION TYPES
// ==========================================

export interface ShipmentSession {
  id: number;
  email_id: number;
  vendor_id?: number;

  // Tracking Timestamps
  vendor_notified_at?: string;
  vendor_replied_at?: string;
  vendor_reply_message_id?: string;
  vendor_reply_content?: string;
  missing_info_updated_at?: string;

  // Status
  status:
    | "incomplete"
    | "pending_info"
    | "complete"
    | "created"
    | "pending"
    | "in_progress"
    | "completed"
    | "assigned"
    | "cancelled";

  // Contact Info
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

  // Package Info
  package_weight?: string;
  package_dimensions?: string;
  package_description?: string;
  package_value?: string;

  // Service Info
  service_type?: string;
  pickup_date?: string;
  delivery_date?: string;

  // Metadata
  missing_fields?: string[];
  extracted_data?: Record<string, any>;
  created_at: string;
  updated_at: string;
  completed_at?: string;

  // Threading (New)
  thread_id?: string;
  subject?: string;
}

// Interface for creating a session manually (used in the Modal)
export interface ShipmentSessionCreate {
  email_id: number;
  sender_name?: string;
  sender_address?: string;
  sender_city?: string;
  sender_country?: string;
  recipient_name?: string;
  recipient_address?: string;
  recipient_city?: string;
  recipient_country?: string;
  package_description?: string;
  package_weight?: string;
  service_type?: string;
  [key: string]: any; // Allow dynamic fields if needed
}

// ==========================================
// EMAIL TYPES
// ==========================================

// Represents a nested reply inside an email thread (fetched from backend)
export interface EmailReply {
  id: string; // IDs are serialized as strings in JSON
  body: string;
  sent_at: string;
}

export interface Email {
  id: number;
  message_id: string;
  thread_id?: string;

  sender_email: string;
  sender_name?: string;
  subject?: string;
  body?: string;

  // Classification
  // Updated to include 'query' and 'spam'
  category:
    | "shipping_request"
    | "logistics_inquiry"
    | "query"
    | "spam"
    | "other";

  is_shipping_request: boolean;

  // Processing Status
  // Updated to include 'ignored'
  status: "unprocessed" | "processing" | "completed" | "failed" | "ignored"; // used for spam

  processed_at?: string;
  error_message?: string;

  // Threading Metadata
  is_forwarded?: boolean;
  is_reply?: boolean; // Used for UI styling (Blue bubble vs Gray bubble)

  // Nested Replies (Critical for Chat History persistence)
  responses?: EmailReply[];

  received_at: string;
  created_at: string;
  updated_at: string;
}

// Email Response (for logs/API calls)
export interface EmailResponse {
  id: string;
  emailId: string;
  responseContent: string;
  sentAt: string;
  status: "sent" | "failed";
}

// ==========================================
// DASHBOARD & UI TYPES
// ==========================================

export interface DashboardStats {
  total_emails: number;
  shipping_requests: number;
  total_shipments: number;
  complete_shipments: number;
  incomplete_shipments: number;
  vendor_replied_sessions: number;
}

// Helper interface for Frontend Thread Grouping
export interface EmailThread {
  threadId: string;
  emails: Email[];
  latestEmail: Email;
  firstEmail: Email;
}
