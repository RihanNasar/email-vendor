import React from "react";
import "./StatusBadge.css";

interface StatusBadgeProps {
  status:
    | "pending"
    | "in_progress"
    | "assigned"
    | "completed"
    | "cancelled"
    | "new"
    | "processing"
    | "responded";
  children: React.ReactNode;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, children }) => {
  return <span className={`status-badge status-${status}`}>{children}</span>;
};

export default StatusBadge;
