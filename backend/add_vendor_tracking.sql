-- Add vendor tracking fields to shipment_sessions table
-- Run this in your PostgreSQL database

ALTER TABLE shipment_sessions 
ADD COLUMN IF NOT EXISTS vendor_notified_at TIMESTAMP;

ALTER TABLE shipment_sessions 
ADD COLUMN IF NOT EXISTS vendor_replied_at TIMESTAMP;

ALTER TABLE shipment_sessions 
ADD COLUMN IF NOT EXISTS vendor_reply_message_id VARCHAR(255);

ALTER TABLE shipment_sessions 
ADD COLUMN IF NOT EXISTS vendor_reply_content TEXT;
