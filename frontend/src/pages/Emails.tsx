import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  Mail,
  ChevronDown,
  ChevronUp,
  User,
  Search,
  CheckCircle2,
  Package,
  Send,
  Truck,
  MessageSquare,
  X,
  CornerDownRight,
  MoreHorizontal,
  FileText,
  AlertCircle,
} from "lucide-react";
import { emailsApi, sessionsApi } from "../services/api";
import type { Email, EmailThread, ShipmentSessionCreate } from "../types";

const Emails: React.FC = () => {
  // ==========================================
  // 1. STATE MANAGEMENT
  // ==========================================
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filter, setFilter] = useState<"all" | "shipping" | "query" | "spam">(
    "all"
  );

  // UI State
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const replyBoxRef = useRef<HTMLTextAreaElement>(null);

  // Reply State
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Session Management State (Create/Update)
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [sessionModalMode, setSessionModalMode] = useState<"create" | "update">(
    "create"
  );
  const [selectedEmailForSession, setSelectedEmailForSession] =
    useState<Email | null>(null);
  const [sessionForm, setSessionForm] = useState<
    Partial<ShipmentSessionCreate>
  >({});
  const [isSavingSession, setIsSavingSession] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // ==========================================
  // 2. EFFECTS
  // ==========================================

  // Initial Load & Polling
  useEffect(() => {
    loadEmails();
    const interval = setInterval(loadEmails, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [page, pageSize, filter]); // Add filter dependency

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);

  // Auto-focus reply box when expanding a query thread (But NO scrolling)
  useEffect(() => {
    if (expandedThreadId && replyBoxRef.current) {
      // Small timeout to ensure DOM rendering is complete
      setTimeout(() => {
        replyBoxRef.current?.focus();
      }, 100);
    }
  }, [expandedThreadId]);

  // ==========================================
  // 3. API ACTIONS
  // ==========================================

  const loadEmails = async () => {
    try {
      if (emails.length === 0) setLoading(true);
      const offset = (page - 1) * pageSize;

      console.log(
        `🔄 [Sync] Fetching emails... Filter: ${filter}, Page: ${page}, Offset: ${offset}`
      );

      // Pass filter to API - backend will handle filtering
      const categoryParam = filter !== "all" ? filter : undefined;
      const response = await emailsApi.getAll(categoryParam, pageSize, offset);

      console.log(
        `✅ [Sync] Received ${
          Array.isArray(response)
            ? response.length
            : (response as any)?.data?.length || 0
        } emails from server`
      );

      if (Array.isArray(response)) {
        // Debug logging to verify if responses are coming back
        const hasReplies = response.some(
          (e) => e.responses && e.responses.length > 0
        );
        if (hasReplies) {
          console.log("✅ [Sync] Server returned emails WITH nested replies.");
        }

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

    const replyContent = replyText.trim();
    setReplyText(""); // Clear immediately for better UX

    try {
      setSendingReply(true);

      // Find the root email ID to send the reply to
      const rootEmailId =
        (latestEmail as any).__originalEmailId || latestEmail.id;

      console.log(`🚀 [Action] Sending reply to root email #${rootEmailId}...`);
      const response = await emailsApi.reply(rootEmailId, replyContent);

      // Capture the variable here to ensure narrowing works in the closure
      const updatedEmail = response.data.email;

      // Check if backend returned the updated email
      if (updatedEmail) {
        console.log("✅ [Backend] Received updated email with responses");

        // Update the email in state with the real data from backend
        setEmails((prev) => {
          return prev.map((email) => {
            if (email.id === rootEmailId) {
              return updatedEmail;
            }
            return email;
          });
        });
      } else {
        // Fallback: Optimistic update if backend doesn't return full email
        console.log("✨ [UI] Applying optimistic update (Fallback)...");
        const tempReplyId = `temp_${Date.now()}`;
        const now = new Date().toISOString();

        setEmails((prev) => {
          return prev.map((email) => {
            if (email.id === rootEmailId) {
              console.log(`📧 Adding optimistic reply to email #${email.id}`);
              return {
                ...email,
                status: "completed",
                updated_at: now,
                responses: [
                  ...(email.responses || []),
                  {
                    id: tempReplyId,
                    body: replyContent,
                    sent_at: now,
                  },
                ],
              };
            }
            return email;
          });
        });

        // Refresh after delay to get real data
        console.log("⏰ [Timer] Scheduling refresh in 4s...");
        setTimeout(async () => {
          console.log("🔄 [Refresh] Loading updated emails from server...");
          await loadEmails();
        }, 4000);
      }
    } catch (error) {
      console.error("❌ Failed to send reply:", error);
      alert("Failed to send reply. Please try again.");
      setReplyText(replyContent);
    } finally {
      setSendingReply(false);
    }
  };

  const handleSaveSession = async () => {
    if (!selectedEmailForSession) return;

    // Validation
    if (!sessionForm.sender_name || !sessionForm.package_description) {
      alert("Sender Name and Package Description are required.");
      return;
    }

    try {
      setIsSavingSession(true);

      // Construct payload
      const payload: ShipmentSessionCreate = {
        email_id: selectedEmailForSession.id,
        sender_name: sessionForm.sender_name,
        package_description: sessionForm.package_description,
        recipient_name: sessionForm.recipient_name || "",
        sender_city: sessionForm.sender_city || "",
        recipient_city: sessionForm.recipient_city || "",
        sender_address: sessionForm.sender_city || "", // Fallback
        recipient_address: sessionForm.recipient_city || "", // Fallback
        sender_country: "",
        recipient_country: "",
        package_weight: "",
        service_type: "Standard",
      };

      // The 'create' endpoint in backend handles "Update if exists" logic automatically
      await sessionsApi.create(payload);

      setShowSessionModal(false);
      setSessionForm({});
      loadEmails();

      const actionWord = sessionModalMode === "create" ? "created" : "updated";
      alert(`Session ${actionWord} successfully!`);
    } catch (error) {
      console.error("Failed to save session", error);
      alert("Failed to save session. Please check the console.");
    } finally {
      setIsSavingSession(false);
    }
  };

  // ==========================================
  // 4. HELPERS & THREAD LOGIC
  // ==========================================

  const openSessionModal = async (email: Email) => {
    setSelectedEmailForSession(email);

    // Check if session exists via the 'session_id' property (added in backend model)
    const hasSession = (email as any).session_id;

    if (hasSession) {
      setSessionModalMode("update");
      try {
        // Pre-fill existing session data for editing
        const res = await sessionsApi.getById(hasSession);
        setSessionForm({
          sender_name: res.data.sender_name,
          recipient_name: res.data.recipient_name,
          sender_city: res.data.sender_city,
          recipient_city: res.data.recipient_city,
          package_description: res.data.package_description,
        });
      } catch (e) {
        console.error("Failed to fetch existing session", e);
        // Fallback if fetch fails
        setSessionForm({
          sender_name: email.sender_name || "",
          package_description: "",
        });
      }
    } else {
      setSessionModalMode("create");
      setSessionForm({
        sender_name: email.sender_name || "",
        package_description: "",
        sender_city: "",
        recipient_city: "",
      });
    }
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

  const isQueryThread = (email: Email) => {
    return email.category === "logistics_inquiry" || email.category === "query";
  };

  const getStatusColor = (status: string, category: string) => {
    // Check both category AND status
    if (category === "spam" || status === "ignored")
      return "bg-slate-100 text-slate-500 border-slate-200";

    switch (status) {
      case "completed":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "processing":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "failed":
        return "bg-red-100 text-red-700 border-red-200";
      case "unprocessed":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
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

  // --- THREAD CONSTRUCTION ---
  const threads = useMemo(() => {
    const threadMap: { [key: string]: Email[] } = {};

    // NO client-side filtering - backend already filtered by category
    const filteredList = emails;

    filteredList.forEach((email) => {
      const key =
        email.thread_id && email.thread_id.trim() !== ""
          ? email.thread_id
          : `single_${email.message_id}`;
      if (!threadMap[key]) threadMap[key] = [];

      // Add Main Email
      threadMap[key].push(email);

      // Add Nested Replies (Flatten them into the list so they appear in the UI)
      if (email.responses && email.responses.length > 0) {
        email.responses.forEach((response, idx) => {
          // CRITICAL FIX: Use a unique ID that won't collide with real email IDs
          const uniqueReplyId = `reply_${email.id}_${response.id}_${idx}`;

          const replyAsEmail: Email = {
            id: uniqueReplyId as any,
            message_id: `reply_${response.id}`,
            thread_id: email.thread_id,
            sender_email: "support@yourcompany.com",
            sender_name: "You",
            subject: email.subject,
            body: response.body,
            category: email.category,
            is_shipping_request: false,
            status: "completed",
            received_at: response.sent_at,
            created_at: response.sent_at,
            updated_at: response.sent_at,
            is_reply: true,
            is_forwarded: false,
            responses: [],
            __originalEmailId: email.id,
          } as Email & { __originalEmailId?: number };

          threadMap[key].push(replyAsEmail);
        });
      }
    });

    const result: EmailThread[] = Object.entries(threadMap).map(
      ([threadId, threadEmails]) => {
        // Sort DESCENDING (Newest First)
        const sortedMessages = threadEmails.sort(
          (a, b) =>
            new Date(b.received_at).getTime() -
            new Date(a.received_at).getTime()
        );

        const latestInteraction = sortedMessages[0];
        const firstEmail = sortedMessages[sortedMessages.length - 1];

        return {
          threadId,
          emails: sortedMessages,
          latestEmail: latestInteraction,
          firstEmail: firstEmail,
        };
      }
    );

    // Sort threads by newest activity
    return result.sort(
      (a, b) =>
        new Date(b.latestEmail.received_at).getTime() -
        new Date(a.latestEmail.received_at).getTime()
    );
  }, [emails]); // Removed 'filter' from dependencies since filtering is done server-side

  const toggleThread = (threadId: string) => {
    setExpandedThreadId(expandedThreadId === threadId ? null : threadId);
    setReplyText("");
  };

  // ==========================================
  // 5. RENDER
  // ==========================================
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6 font-sans text-slate-900">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-slate-900 text-white rounded-lg">
              <Mail size={24} />
            </div>
            Inbox
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage incoming shipping requests and logistics inquiries
          </p>
        </div>

        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
          {(["all", "shipping", "query", "spam"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all capitalize ${
                filter === f
                  ? "bg-slate-900 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {f === "query" ? "Queries" : f}
            </button>
          ))}
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] flex flex-col">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-6 px-8 py-4 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <div className="col-span-3">Sender Details</div>
          <div className="col-span-6">Message Preview</div>
          <div className="col-span-3 text-right">Status & Date</div>
        </div>

        {loading && emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-grow py-32 gap-4">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-slate-400 text-sm font-medium">
              Syncing mailbox...
            </p>
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-grow py-32 px-4 text-center">
            <div className="bg-slate-50 p-4 rounded-full mb-4 border border-slate-100">
              <Search className="w-8 h-8 text-slate-300" strokeWidth={1.5} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">
              No emails found
            </h3>
            <p className="text-slate-500 mt-2">
              Your inbox is empty for this category.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 flex-grow">
            {threads.map((thread) => {
              const isExpanded = expandedThreadId === thread.threadId;
              const { latestEmail } = thread;
              const isQuery = isQueryThread(latestEmail);
              const hasSession = (latestEmail as any).session_id;

              return (
                <div
                  key={thread.threadId}
                  className={`group transition-all duration-300 ${
                    isExpanded
                      ? "bg-slate-50/80 shadow-inner"
                      : "hover:bg-slate-50"
                  }`}
                >
                  {/* --- Thread Summary Row --- */}
                  <div
                    onClick={() => toggleThread(thread.threadId)}
                    className="p-6 cursor-pointer grid grid-cols-12 gap-6 items-center relative"
                  >
                    {/* Active Indicator */}
                    {isExpanded && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-r-md"></div>
                    )}

                    {/* Sender */}
                    <div className="col-span-12 md:col-span-3 flex items-center gap-4 overflow-hidden">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border border-white ${
                          latestEmail.category === "spam"
                            ? "bg-slate-200 text-slate-500"
                            : isQuery
                            ? "bg-slate-100 text-slate-600"
                            : "bg-blue-100 text-blue-600"
                        }`}
                      >
                        {latestEmail.category === "spam" ? (
                          <AlertCircle size={18} strokeWidth={2} />
                        ) : isQuery ? (
                          <MessageSquare size={18} strokeWidth={2} />
                        ) : (
                          <Package size={18} strokeWidth={2} />
                        )}
                      </div>

                      <div className="min-w-0">
                        <p
                          className={`text-sm font-bold truncate text-slate-900`}
                        >
                          {latestEmail.sender_name || latestEmail.sender_email}
                        </p>
                        <p className="text-xs text-slate-500 truncate font-medium mt-0.5">
                          {latestEmail.sender_email}
                        </p>
                      </div>
                    </div>

                    {/* Preview */}
                    <div className="col-span-12 md:col-span-6 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        {thread.emails.length > 1 && (
                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 rounded-md font-bold border border-slate-300">
                            {thread.emails.length}
                          </span>
                        )}
                        <span
                          className={`text-sm truncate ${
                            latestEmail.status === "unprocessed"
                              ? "font-bold text-slate-900"
                              : "text-slate-700"
                          }`}
                        >
                          {latestEmail.subject || "(No Subject)"}
                        </span>
                        {hasSession && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 rounded-md font-bold border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 size={10} /> #{hasSession}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 truncate pr-8 font-normal">
                        {getCleanPreview(latestEmail.body)}
                      </p>
                    </div>

                    {/* Status & Time */}
                    <div className="col-span-12 md:col-span-3 flex items-center justify-between md:justify-end gap-6">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(
                          latestEmail.status,
                          latestEmail.category as string
                        )} uppercase tracking-wide`}
                      >
                        {latestEmail.category === "spam"
                          ? "Spam"
                          : latestEmail.status.replace("_", " ")}
                      </span>
                      <div className="flex items-center gap-4 text-slate-400">
                        <span className="text-xs font-medium">
                          {formatDate(latestEmail.received_at)}
                        </span>
                        {isExpanded ? (
                          <ChevronUp size={18} className="text-blue-600" />
                        ) : (
                          <ChevronDown
                            size={18}
                            className="group-hover:text-slate-600"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* --- Expanded Thread View (Stacked Emails) --- */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 animate-in slide-in-from-top-2 duration-300 bg-slate-50/50">
                      {/* 1. Action Header (Queries Only) */}
                      {isQuery && (
                        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md px-8 py-4 border-b border-slate-200 flex justify-between items-center shadow-sm">
                          <div className="flex items-center gap-3 text-sm">
                            <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                              <MessageSquare size={18} />
                            </div>
                            <div>
                              <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Thread Type
                              </span>
                              <span className="font-bold text-slate-800">
                                General Inquiry
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => openSessionModal(latestEmail)}
                            className={`
                                  flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg border transition-all shadow-sm
                                  ${
                                    hasSession
                                      ? "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                                      : "bg-slate-900 text-white border-transparent hover:bg-slate-800 hover:shadow-md"
                                  }
                                `}
                          >
                            {hasSession ? (
                              <>
                                <Truck size={14} /> Update Session #{hasSession}
                              </>
                            ) : (
                              <>
                                <Truck size={14} /> Convert to Shipment
                              </>
                            )}
                          </button>
                        </div>
                      )}

                      {/* 2. Reply Box (Sticky at TOP for Queries) */}
                      {isQuery && (
                        <div className="p-6 bg-white border-b border-slate-200">
                          <div className="relative rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all shadow-sm">
                            <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-xl">
                              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                                <CornerDownRight size={14} /> Reply to{" "}
                                {latestEmail.sender_name || "Customer"}
                              </span>
                              <MoreHorizontal
                                size={16}
                                className="text-slate-400 cursor-pointer hover:text-slate-600"
                              />
                            </div>
                            <textarea
                              ref={replyBoxRef}
                              value={replyText}
                              onChange={(e) => setReplyText(e.target.value)}
                              placeholder="Type your response..."
                              rows={4}
                              className="w-full text-sm text-slate-800 placeholder-slate-400 border-none resize-none focus:ring-0 p-4 bg-transparent leading-relaxed"
                              autoComplete="off"
                              spellCheck="false"
                              data-gramm="false"
                              data-gramm_editor="false"
                              data-enable-grammarly="false"
                              data-lpignore="true"
                              data-form-type="other"
                            />
                            <div className="px-4 py-3 bg-white rounded-b-xl flex justify-end border-t border-slate-50">
                              <button
                                onClick={() => handleSendReply(latestEmail)}
                                disabled={!replyText.trim() || sendingReply}
                                className={`
                                            flex items-center gap-2 px-6 py-2 text-sm font-bold rounded-lg transition-all shadow-sm
                                            ${
                                              !replyText.trim() || sendingReply
                                                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                                : "bg-slate-900 text-white hover:bg-black hover:shadow-md hover:-translate-y-0.5"
                                            }
                                          `}
                              >
                                {sendingReply ? (
                                  <>
                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Sending...
                                  </>
                                ) : (
                                  <>
                                    Send Reply{" "}
                                    <Send size={14} strokeWidth={2.5} />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3. Message List (Stacked) */}
                      <div className="p-8 space-y-8 relative">
                        {/* Timeline Spine */}
                        <div className="absolute left-[47px] top-8 bottom-8 w-0.5 bg-slate-200 z-0"></div>

                        {thread.emails.map((msg) => {
                          const isMe = msg.is_reply;
                          const messageKey =
                            msg.message_id || `email_${msg.id}`;

                          return (
                            <div
                              key={messageKey}
                              className="relative pl-10 z-10 group/msg"
                            >
                              {/* Avatar */}
                              <div
                                className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                                  isMe
                                    ? "bg-blue-600 border-white text-white shadow-sm"
                                    : "bg-white border-slate-200 text-slate-500"
                                }`}
                              >
                                <User size={16} strokeWidth={2.5} />
                              </div>

                              <div
                                className={`rounded-2xl border p-6 transition-all duration-200 ${
                                  isMe
                                    ? "bg-blue-50/40 border-blue-100"
                                    : "bg-white border-slate-200 shadow-sm"
                                }`}
                              >
                                {/* Email Header */}
                                <div className="flex items-start justify-between mb-4 pb-4 border-b border-slate-100/80">
                                  <div>
                                    <div className="flex items-center gap-2.5">
                                      <span className="text-sm font-bold text-slate-900">
                                        {isMe
                                          ? "You (Support Team)"
                                          : msg.sender_name || msg.sender_email}
                                      </span>
                                      {isMe && (
                                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-bold tracking-wide uppercase border border-blue-200">
                                          Staff Reply
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-400 font-medium mt-1">
                                      {formatDate(msg.received_at)}
                                    </div>
                                  </div>
                                </div>

                                {/* Email Body */}
                                <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-sans pl-14">
                                  {msg.body}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        <div className="px-8 py-5 border-t border-slate-200 bg-slate-50 flex justify-between items-center mt-auto">
          <span className="text-sm font-medium text-slate-500">
            Page {page}
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-100 transition-colors shadow-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={emails.length < pageSize}
              className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-600 disabled:opacity-50 hover:bg-slate-100 transition-colors shadow-sm"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Manual Session Modal */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transform transition-all scale-100 border border-slate-200">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
              <div>
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600">
                    <Truck size={24} strokeWidth={2} />
                  </div>
                  {sessionModalMode === "update"
                    ? "Update Existing Session"
                    : "Create Shipment Session"}
                </h3>
                <p className="text-sm text-slate-500 mt-1 ml-12">
                  {sessionModalMode === "update"
                    ? "Modify details for the existing shipment linked to this thread."
                    : "Convert this inquiry into a new trackable shipment."}
                </p>
              </div>
              <button
                onClick={() => setShowSessionModal(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-8 space-y-8">
              <div className="bg-blue-50 p-5 rounded-xl border border-blue-100 flex items-start gap-4">
                <FileText
                  className="text-blue-600 mt-1 flex-shrink-0"
                  size={20}
                />
                <div>
                  <p className="text-sm text-blue-900 font-semibold mb-1">
                    Agent Instruction
                  </p>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    Review the email thread and manually extract key shipment
                    details.
                    {sessionModalMode === "update"
                      ? " Updating this form will modify the active session."
                      : " Submitting this form will initialize a new workflow."}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Sender Name
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
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
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Recipient Name
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
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
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Origin City
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
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
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Destination City
                  </label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm"
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
                <div className="col-span-1 md:col-span-2 space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Package Description
                  </label>
                  <textarea
                    className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all shadow-sm min-h-[120px]"
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

            <div className="px-8 py-6 bg-slate-50 flex justify-end gap-3 border-t border-slate-200">
              <button
                onClick={() => setShowSessionModal(false)}
                className="px-6 py-2.5 text-sm text-slate-700 font-bold hover:bg-slate-200 rounded-lg border border-slate-300 bg-white shadow-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSession}
                disabled={isSavingSession || !sessionForm.package_description}
                className="px-8 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:shadow-none transition-all"
              >
                {isSavingSession ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} strokeWidth={2.5} />{" "}
                    {sessionModalMode === "create"
                      ? "Confirm & Create"
                      : "Update Session"}
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
