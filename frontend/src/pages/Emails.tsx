import React, { useEffect, useState } from "react";
import { Mail, Clock } from "lucide-react";
import { emailsApi } from "../services/api";
import type { Email } from "../types";

const Emails: React.FC = () => {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "shipping" | "other">("all");
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);

  useEffect(() => {
    loadEmails();
  }, []);

  const loadEmails = async () => {
    try {
      const response = await emailsApi.getAll();
      // Sort emails by received_at descending (newest first)
      const sortedEmails = response.data.sort(
        (a, b) =>
          new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
      );
      setEmails(sortedEmails);
    } catch (error) {
      console.error("Failed to load emails:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEmails = emails.filter((email) => {
    if (filter === "shipping") return email.is_shipping_request;
    if (filter === "other") return !email.is_shipping_request;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading emails...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Emails</h2>
          <p className="text-sm text-gray-600 mt-1">
            All incoming emails organized by category
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All ({emails.length})
          </button>
          <button
            onClick={() => setFilter("shipping")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "shipping"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Shipping ({emails.filter((e) => e.is_shipping_request).length})
          </button>
          <button
            onClick={() => setFilter("other")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "other"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Other ({emails.filter((e) => !e.is_shipping_request).length})
          </button>
        </div>
      </div>

      {filteredEmails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <Mail className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No emails found
          </h3>
          <p className="text-sm text-gray-600 text-center max-w-md">
            {filter === "shipping"
              ? "No shipping request emails available. Shipping requests will appear here once processed."
              : filter === "other"
              ? "No other emails available. Non-shipping emails will appear here."
              : "No emails available. Emails will appear here once they are received and processed."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredEmails.map((email) => (
            <div
              key={email.message_id}
              onClick={() => setSelectedEmail(email)}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      email.is_shipping_request ? "bg-green-100" : "bg-blue-100"
                    }`}
                  >
                    <Mail
                      className={`w-5 h-5 ${
                        email.is_shipping_request
                          ? "text-green-600"
                          : "text-blue-600"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate">
                      {email.subject}
                    </div>
                    <div className="text-sm text-gray-600 truncate">
                      {email.sender_email}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {email.is_shipping_request && (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                      Shipping
                    </span>
                  )}
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      email.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : email.status === "processing"
                        ? "bg-blue-100 text-blue-700"
                        : email.status === "failed"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {email.status}
                  </span>
                </div>
              </div>
              <div className="text-sm text-gray-600 line-clamp-2">
                {email.body}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(email.received_at).toLocaleString()}
                </div>
                {email.category && (
                  <div className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {email.category}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Email Detail Modal */}
      {selectedEmail && (
        <div
          onClick={() => setSelectedEmail(null)}
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {selectedEmail.subject}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span>From: {selectedEmail.sender_email}</span>
                    <span>•</span>
                    <span>
                      {new Date(selectedEmail.received_at).toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEmail(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="flex gap-2 mb-4">
                {selectedEmail.is_shipping_request && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                    Shipping Request
                  </span>
                )}
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    selectedEmail.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : selectedEmail.status === "processing"
                      ? "bg-blue-100 text-blue-700"
                      : selectedEmail.status === "failed"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {selectedEmail.status}
                </span>
                {selectedEmail.category && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                    {selectedEmail.category}
                  </span>
                )}
              </div>

              <div className="prose max-w-none">
                <div className="whitespace-pre-wrap text-gray-700">
                  {selectedEmail.body}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Emails;
