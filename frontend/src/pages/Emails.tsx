import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Mail,
  Clock,
  ChevronDown,
  ChevronUp,
  User,
  Search,
  AlertCircle,
  CheckCircle2,
  Package,
  Send,
  Truck,
  MessageSquare,
  X,
  CornerDownRight,
  MoreHorizontal,
  Paperclip,
} from "lucide-react";
import { emailsApi, sessionsApi } from "../services/api";
import type { Email, EmailThread, ShipmentSessionCreate } from "../types";

const Emails: React.FC = () => {
  // --- State Management ---
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters: 'all', 'shipping', 'query', 'spam'
  const [filter, setFilter] = useState<"all" | "shipping" | "query" | "spam">(
    "all"
  );

  // UI State: Which thread is currently expanded
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);

  // Reply State
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Manual Session Creation State (Modal)
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [selectedEmailForSession, setSelectedEmailForSession] =
    useState<Email | null>(null);
  const [sessionForm, setSessionForm] = useState<
    Partial<ShipmentSessionCreate>
  >({});
  const [creatingSession, setCreatingSession] = useState(false);

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Auto-scroll ref for chat view
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Effects ---

  // 1. Initial Load & Polling
  useEffect(() => {
    loadEmails();
    const interval = setInterval(loadEmails, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [page, pageSize]); // Reload when page/size changes

  // 2. Auto-scroll to bottom when a thread is expanded or new emails arrive
  useEffect(() => {
    if (expandedThreadId && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [expandedThreadId, emails]);

  // --- API Actions ---

  const loadEmails = async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * pageSize;
      // Fetch emails based on pagination. Filtering is currently done client-side
      // but parameters exist to move it server-side if needed.
      const response = await emailsApi.getAll(undefined, pageSize, offset);

      if (Array.isArray(response)) {
        setEmails(response);
      } else if ((response as any).data) {
        setEmails((response as any).data);
      }
    } catch (error) {
      console.error("Failed to load emails:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async (latestEmail: Email) => {
    if (!replyText.trim()) return;
    try {
      setSendingReply(true);

      // 1. Send to Backend
      await emailsApi.reply(latestEmail.id, replyText);

      // 2. Optimistic Update: Add reply to UI immediately for better UX
      const optimisticReply: Email = {
        id: Date.now(), // Temp ID
        message_id: `temp_${Date.now()}`,
        thread_id: latestEmail.thread_id,
        sender_email: "support@yourcompany.com",
        sender_name: "You",
        subject: latestEmail.subject,
        body: replyText,
        category: latestEmail.category,
        is_shipping_request: false,
        status: "completed",
        received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_reply: true, // Mark as sent by us
        is_forwarded: false,
      };

      setEmails((prev) => [optimisticReply, ...prev]);
      setReplyText("");

      // 3. Background Refresh to sync with server
      setTimeout(() => loadEmails(), 1000);
    } catch (error) {
      console.error("Failed to send reply", error);
      alert("Failed to send reply.");
    } finally {
      setSendingReply(false);
    }
  };

  const handleCreateSession = async () => {
    if (!selectedEmailForSession) return;
    try {
      setCreatingSession(true);

      // Create session via API
      await sessionsApi.create({
        email_id: selectedEmailForSession.id,
        ...sessionForm,
      } as any);

      // Reset and Close
      setShowSessionModal(false);
      setSessionForm({});
      loadEmails(); // Refresh list to show updated status
      alert("Session created successfully!");
    } catch (error) {
      console.error("Failed to create session", error);
      alert("Failed to create session.");
    } finally {
      setCreatingSession(false);
    }
  };

  // --- Helpers ---

  const openSessionModal = (email: Email) => {
    setSelectedEmailForSession(email);
    // Pre-fill form with available data
    setSessionForm({
      sender_name: email.sender_name || "",
      package_description: "",
      sender_city: "",
      recipient_city: "",
    });
    setShowSessionModal(true);
  };

  const getCleanPreview = (body: string | undefined) => {
    if (!body) return "No content";
    const clean = body
      .replace(/---------- Forwarded message ---------/g, "")
      .replace(/From:.*?>/g, "")
      .replace(/Date:.*?>/g, "")
      .replace(/Subject:.*?>/g, "")
      .replace(/To:.*?>/g, "")
      .replace(/\n/g, " ")
      .trim();
    return clean.substring(0, 120);
  };

  // Group linear list of emails into Threads
  const threads = useMemo(() => {
    const threadMap: { [key: string]: Email[] } = {};

    // 1. Filter Logic
    const filteredList = emails.filter((email) => {
      if (filter === "shipping")
        return (
          email.category === "shipping_request" || email.is_shipping_request
        );
      if (filter === "query")
        return (
          email.category === "logistics_inquiry" || email.category === "query"
        );
      if (filter === "spam")
        return email.category === "spam" || email.status === "ignored";
      return true; // "all"
    });

    // 2. Grouping Logic
    filteredList.forEach((email) => {
      // Use thread_id if available, otherwise treat message_id as key
      const key =
        email.thread_id && email.thread_id.trim() !== ""
          ? email.thread_id
          : `single_${email.message_id}`;
      if (!threadMap[key]) threadMap[key] = [];
      threadMap[key].push(email);
    });

    // 3. Sorting Messages within Threads
    const result: EmailThread[] = Object.entries(threadMap).map(
      ([threadId, threadEmails]) => {
        // Sort oldest to newest for the Chat View
        const sortedMessages = threadEmails.sort(
          (a, b) =>
            new Date(a.received_at).getTime() -
            new Date(b.received_at).getTime()
        );

        return {
          threadId,
          emails: sortedMessages,
          latestEmail: sortedMessages[sortedMessages.length - 1], // Newest is last in this sort array
          firstEmail: sortedMessages[0],
        };
      }
    );

    // 4. Sort Threads by Newest Activity (Latest email timestamp)
    return result.sort(
      (a, b) =>
        new Date(b.latestEmail.received_at).getTime() -
        new Date(a.latestEmail.received_at).getTime()
    );
  }, [emails, filter]);

  const toggleThread = (threadId: string) => {
    setExpandedThreadId(expandedThreadId === threadId ? null : threadId);
    setReplyText(""); // Clear draft when switching threads
  };

  const getStatusColor = (status: string, category: string) => {
    if (category === "spam") return "bg-gray-100 text-gray-500 border-gray-200";
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 border-green-200";
      case "processing":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "failed":
        return "bg-red-100 text-red-700 border-red-200";
      case "unprocessed":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const isQueryThread = (email: Email) => {
    return email.category === "logistics_inquiry" || email.category === "query";
  };

  // --- Render ---
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="w-7 h-7 text-blue-600" />
            Inbox
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage incoming shipping requests and logistics inquiries
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200 overflow-x-auto">
          {(["all", "shipping", "query", "spam"] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all capitalize whitespace-nowrap ${
                filter === f
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/50"
              }`}
            >
              {f === "query" ? "Queries" : f}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Main List Container */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[500px] flex flex-col">
        {/* Loading State */}
        {loading && emails.length === 0 ? (
          <div className="flex items-center justify-center flex-grow">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : threads.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center flex-grow py-20 px-4 text-center">
            <div className="bg-gray-50 p-6 rounded-full mb-4">
              <Search className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              No emails found
            </h3>
            <p className="text-gray-500 max-w-sm mt-2">
              No emails matching current filter.
            </p>
          </div>
        ) : (
          /* List of Threads */
          <div className="divide-y divide-gray-100 flex-grow">
            {threads.map((thread) => {
              const isExpanded = expandedThreadId === thread.threadId;
              const { latestEmail } = thread;
              const isQuery = isQueryThread(latestEmail);

              return (
                <div
                  key={thread.threadId}
                  className={`group transition-colors ${
                    isExpanded ? "bg-slate-50" : "hover:bg-gray-50"
                  }`}
                >
                  {/* Thread Summary Row (Clickable) */}
                  <div
                    onClick={() => toggleThread(thread.threadId)}
                    className="p-4 cursor-pointer grid grid-cols-12 gap-4 items-center"
                  >
                    {/* Icon & Sender Info */}
                    <div className="col-span-12 md:col-span-3 flex items-center gap-3 overflow-hidden">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          latestEmail.category === "spam"
                            ? "bg-gray-200 text-gray-500"
                            : isQuery
                            ? "bg-amber-100 text-amber-600"
                            : "bg-blue-100 text-blue-600"
                        }`}
                      >
                        {latestEmail.category === "spam" ? (
                          <AlertCircle size={20} />
                        ) : isQuery ? (
                          <MessageSquare size={20} />
                        ) : (
                          <Package size={20} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold truncate text-gray-900`}
                        >
                          {latestEmail.sender_name || latestEmail.sender_email}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {latestEmail.sender_email}
                        </p>
                      </div>
                    </div>

                    {/* Subject & Body Preview */}
                    <div className="col-span-12 md:col-span-6 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className={`text-sm truncate ${
                            latestEmail.status === "unprocessed"
                              ? "font-bold text-gray-900"
                              : "text-gray-700"
                          }`}
                        >
                          {latestEmail.subject || "(No Subject)"}
                        </span>
                        {thread.emails.length > 1 && (
                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 rounded-full font-bold">
                            {thread.emails.length}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate pr-4">
                        {getCleanPreview(latestEmail.body)}...
                      </p>
                    </div>

                    {/* Status Badge & Timestamp */}
                    <div className="col-span-12 md:col-span-3 flex items-center justify-between md:justify-end gap-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          latestEmail.status,
                          latestEmail.category as string
                        )}`}
                      >
                        {latestEmail.category === "spam"
                          ? "Spam"
                          : latestEmail.status.replace("_", " ")}
                      </span>
                      <div className="flex items-center gap-3 text-gray-400">
                        <span className="text-xs font-medium">
                          {formatDate(latestEmail.received_at)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Thread View (Chat Style) */}
                  {isExpanded && (
                    <div className="bg-slate-100 border-t border-gray-200 animate-in fade-in duration-200">
                      {/* --- Sticky Header for Query Actions --- */}
                      {isQuery && (
                        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm px-4 py-3 border-b border-gray-200 flex justify-between items-center shadow-sm">
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <span className="p-1.5 bg-amber-100 text-amber-600 rounded">
                              <AlertCircle size={16} />
                            </span>
                            <div>
                              <span className="font-bold block text-xs uppercase text-gray-500 tracking-wider">
                                Status
                              </span>
                              <span className="font-medium">
                                Query / Inquiry
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => openSessionModal(latestEmail)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 text-xs font-semibold rounded-md border border-gray-300 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm"
                          >
                            <Truck size={14} />
                            Convert to Shipment
                          </button>
                        </div>
                      )}

                      {/* --- Scrollable Chat Area --- */}
                      <div className="p-4 space-y-6 max-h-[500px] overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-center pb-2">
                          <span className="text-[10px] uppercase font-bold text-gray-400 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
                            Conversation Started
                          </span>
                        </div>

                        {thread.emails.map((msg) => {
                          const isMe = msg.is_reply;
                          return (
                            <div
                              key={msg.message_id}
                              className={`flex ${
                                isMe ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`flex flex-col max-w-[85%] md:max-w-[70%] ${
                                  isMe ? "items-end" : "items-start"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1 px-1">
                                  <span className="text-xs font-semibold text-gray-600">
                                    {isMe
                                      ? "You"
                                      : msg.sender_name || msg.sender_email}
                                  </span>
                                  <span className="text-[10px] text-gray-400">
                                    {formatDate(msg.received_at)}
                                  </span>
                                </div>

                                <div
                                  className={`
                                            p-3.5 rounded-2xl shadow-sm text-sm whitespace-pre-wrap leading-relaxed border relative group
                                            ${
                                              isMe
                                                ? "bg-blue-600 text-white border-blue-600 rounded-tr-sm"
                                                : "bg-white text-gray-800 border-gray-200 rounded-tl-sm"
                                            }
                                        `}
                                >
                                  {msg.body}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Invisible element to auto-scroll to */}
                        <div ref={messagesEndRef} />
                      </div>

                      {/* --- Sticky Reply Box (Bottom) --- */}
                      {latestEmail.category !== "spam" && (
                        <div className="p-4 bg-white border-t border-gray-200 sticky bottom-0 z-10">
                          <div className="relative rounded-xl border border-gray-300 shadow-sm bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all">
                            {/* Reply Toolbar */}
                            <div className="bg-gray-50/50 border-b border-gray-100 px-3 py-2 flex items-center justify-between">
                              <span className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                                <CornerDownRight
                                  size={14}
                                  className="text-gray-400"
                                />
                                Reply to {latestEmail.sender_name || "Customer"}
                              </span>
                              <div className="flex gap-1">
                                <button className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200/50 transition-colors">
                                  <Paperclip size={14} />
                                </button>
                                <button className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-200/50 transition-colors">
                                  <MoreHorizontal size={14} />
                                </button>
                              </div>
                            </div>

                            {/* Text Area */}
                            <textarea
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Write your reply here..."
                              rows={3}
                              className="w-full text-sm text-gray-800 placeholder-gray-400 border-none resize-none focus:ring-0 p-3 bg-transparent"
                            />

                            {/* Send Button */}
                            <div className="px-3 py-2 bg-white flex justify-end items-center">
                              <button
                                onClick={() => handleSendReply(latestEmail)}
                                disabled={!replyText.trim() || sendingReply}
                                className={`
                                            flex items-center gap-2 px-4 py-1.5 text-sm font-semibold rounded-lg transition-all shadow-sm
                                            ${
                                              !replyText.trim() || sendingReply
                                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                                : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md active:transform active:scale-95"
                                            }
                                        `}
                              >
                                {sendingReply ? (
                                  <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Sending
                                  </>
                                ) : (
                                  <>
                                    Send <Send size={14} />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 3. Pagination Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col md:flex-row items-center justify-between gap-4 mt-auto">
          <div className="text-sm text-gray-600">
            Showing Page <span className="font-medium">{page}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={emails.length < pageSize}
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            </div>

            <div className="hidden md:block h-4 w-px bg-gray-300 mx-2"></div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="hidden md:block text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-500"
            >
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Manual Session Creation Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all scale-100">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
                  <Truck size={20} />
                </div>
                Convert Query to Shipment
              </h3>
              <button
                onClick={() => setShowSessionModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-start gap-3">
                <AlertCircle
                  className="text-blue-600 mt-0.5 flex-shrink-0"
                  size={18}
                />
                <p className="text-sm text-blue-800 leading-relaxed">
                  <strong>Agent Action Required:</strong> Review the email
                  content and manually extract the shipment details below. This
                  will create a formal session in the system.
                </p>
              </div>

              {/* Manual Entry Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Sender Name
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white outline-none transition-all"
                    placeholder="E.g. John Doe"
                    value={sessionForm.sender_name || ""}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        sender_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white outline-none transition-all"
                    placeholder="E.g. Acme Corp"
                    value={sessionForm.recipient_name || ""}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        recipient_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Origin City
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white outline-none transition-all"
                    placeholder="E.g. New York"
                    value={sessionForm.sender_city || ""}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        sender_city: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Destination City
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white outline-none transition-all"
                    placeholder="E.g. London"
                    value={sessionForm.recipient_city || ""}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        recipient_city: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="col-span-1 md:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                    Package Description
                  </label>
                  <textarea
                    className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white outline-none transition-all"
                    rows={3}
                    placeholder="E.g. 5 boxes of electronics, 50kg total. Needs temperature control."
                    value={sessionForm.package_description || ""}
                    onChange={(e) =>
                      setSessionForm({
                        ...sessionForm,
                        package_description: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
              <button
                onClick={() => setShowSessionModal(false)}
                className="px-4 py-2 text-sm text-gray-700 font-semibold hover:bg-gray-200 rounded-lg transition-colors border border-gray-300 bg-white shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSession}
                disabled={creatingSession || !sessionForm.package_description}
                className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {creatingSession ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} strokeWidth={2.5} /> Confirm Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Emails;
