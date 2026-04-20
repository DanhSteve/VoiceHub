import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";

import NavigationSidebar from "../../components/Layout/NavigationSidebar";
import api from "../../services/api";
import { useTheme } from "../../context/ThemeContext";
import { appShellBg } from "../../theme/shellTheme";
import {
  Dropdown,
  GlassCard,
  GradientButton,
  Modal,
  StatusIndicator,
} from "../../components/Shared";
import { useAppStrings } from "../../locales/appStrings";

const unwrapPayload = (payload) => {
  if (payload == null) return null;
  if (Array.isArray(payload)) return payload;
  return payload?.data ?? payload?.channels ?? payload?.items ?? payload;
};

const unwrapList = (payload) => {
  const inner = unwrapPayload(payload);
  return Array.isArray(inner) ? inner : [];
};

function ChatPage() {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();

  const normalizeChannel = useCallback(
    (c) => ({
      ...c,
      id: c?.id ?? c?._id,
      name: c?.name ?? t("chat.defaultChannelName"),
      icon: c?.icon ?? "📢",
      members: c?.members ?? c?.memberCount ?? 0,
    }),
    [t]
  );

  const normalizeDm = useCallback(
    (d) => ({
      ...d,
      id: d?.id ?? d?._id,
      name: d?.name ?? t("chat.defaultUserName"),
      avatar: d?.avatar ?? "👤",
      status: d?.status ?? "offline",
      lastMsg: d?.lastMsg ?? d?.lastMessage ?? "",
    }),
    [t]
  );

  const normalizeMessage = useCallback(
    (m) => ({
      ...m,
      id: m?.id ?? m?._id,
      content: m?.content ?? m?.text ?? "",
      user: m?.user ?? {
        name: m?.senderName ?? t("chat.defaultUserName"),
        avatar: m?.senderAvatar ?? "👤",
      },
    }),
    [t]
  );

  const [selectedChannel, setSelectedChannel] = useState(null);
  const [message, setMessage] = useState("");

  const [channels, setChannels] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [messages, setMessages] = useState([]);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showThreadFor, setShowThreadFor] = useState(null);
  const [showImagePreview, setShowImagePreview] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);

  const emojis = [
    "😊","😂","❤️","👍","🎉","🔥","✨","💯",
    "👏","🚀","💪","🙏","😍","🤔","😎","🎨"
  ];

  /* ---------------- FETCH DATA ---------------- */

  useEffect(() => {
    fetchChannels();
    fetchDirectMessages();
  }, [normalizeChannel, normalizeDm]);

  useEffect(() => {
    if (selectedChannel) {
      fetchMessages(selectedChannel);
    }
  }, [selectedChannel, normalizeMessage]);

  const fetchChannels = async () => {
    try {
      const res = await api.get("/channels");
      setChannels(unwrapList(res).map(normalizeChannel).filter((c) => c.id));
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ChatPage] fetchChannels:", err?.message);
    }
  };

  const fetchDirectMessages = async () => {
    try {
      const res = await api.get("/dm");
      setDirectMessages(unwrapList(res).map(normalizeDm).filter((d) => d.id));
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ChatPage] fetchDirectMessages:", err?.message);
    }
  };

  const fetchMessages = async (channelId) => {
    try {
      const res = await api.get(`/messages/${channelId}`);
      setMessages(unwrapList(res).map(normalizeMessage));
    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ChatPage] fetchMessages:", err?.message);
    }
  };

  /* ---------------- SEND MESSAGE ---------------- */

  const sendMessage = async () => {
    if (!message.trim()) return;

    try {
      const res = await api.post("/messages", {
        channelId: selectedChannel,
        content: message
      });

      const created = normalizeMessage(unwrapPayload(res) ?? res);
      if (created?.id) setMessages((prev) => [...prev, created]);
      setMessage("");

    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ChatPage] sendMessage:", err?.message);
    }
  };

  /* ---------------- CURRENT CHAT ---------------- */

  const getCurrentChat = () => {

    if (!selectedChannel) return null;

    if (selectedChannel.startsWith("dm-")) {
      const dm = directMessages.find(
        d => "dm-" + d.id === selectedChannel
      );
      return dm || null;
    }

    return channels.find(c => c.id === selectedChannel);
  };

  const currentChat = getCurrentChat();

  /* ---------------- MESSAGE ACTIONS ---------------- */

  const handleDeleteMessage = async (msgId) => {
    try {

      await api.delete(`/messages/${msgId}`);

      setMessages(messages.filter((m) => m.id !== msgId && m._id !== msgId));

      toast.success(t("chat.toastDeleted"));

    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ChatPage] handleDeleteMessage:", err?.message);
    }
  };

  const handleReaction = async (msgId, emoji) => {
    try {

      await api.post(`/messages/${msgId}/reaction`, { emoji });

      toast.success(t("chat.toastReaction"));

      setShowEmojiPicker(false);

    } catch (err) {
      if (import.meta.env.DEV) console.warn("[ChatPage] handleReaction:", err?.message);
    }
  };

  /* ---------------- UI ---------------- */

  const chatShell = isDarkMode
    ? "h-screen flex overflow-hidden bg-[#020817] text-slate-100"
    : `h-screen flex overflow-hidden ${appShellBg(false)} text-slate-900`;

  return (
<>
<div className={chatShell}>

<NavigationSidebar currentPage={t("chat.sidebarTitle")}/>

<div className="flex-1 flex">

{/* CHANNEL SIDEBAR */}

<div className="w-72 bg-slate-900/60 border-r border-slate-800 p-4 overflow-y-auto scrollbar-overlay">

<h2 className={`text-xl font-extrabold mb-4 ${isDarkMode ? "text-white" : "text-slate-900"}`}>
{t("chat.sidebarTitle")}
</h2>

{/* CHANNELS */}

<h3 className="text-sm font-bold text-gray-400 mb-3">
{t("chat.channelsHeading")}
</h3>

<div className="space-y-2">

{channels.map(channel => (

<div
key={channel.id}
onClick={() => setSelectedChannel(channel.id)}
className="p-3 rounded-xl cursor-pointer bg-[#040f2a] border border-slate-800 hover:bg-slate-800/70"
>

<div className="flex items-center gap-3">

<span className="text-xl">
{channel.icon}
</span>

<div className="flex-1">

<div className={`font-semibold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
{channel.name}
</div>

<div className="text-xs text-gray-400">
{channel.members} {t("chat.membersSuffix")}
</div>

</div>
</div>
</div>
))}
</div>

<button
onClick={() => setShowCreateChannelModal(true)}
className="w-full mt-3 py-2 bg-[#040f2a] border border-slate-800 rounded-lg text-sm hover:bg-slate-800/70 transition-all"
>
{t("chat.createChannel")}
</button>

{/* DIRECT MESSAGES */}

<h3 className="text-sm font-bold text-gray-400 mt-6 mb-3">
{t("chat.dmHeading")}
</h3>

<div className="space-y-2">

{directMessages.map(dm => (

<div
key={dm.id}
onClick={() => setSelectedChannel("dm-" + dm.id)}
className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer"
>

<div className="relative">

<div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-base">
{dm.avatar}
</div>

<StatusIndicator status={dm.status}/>

</div>

<div className="flex-1">

<div className={`font-medium text-sm ${isDarkMode ? "text-white" : "text-slate-900"}`}>
{dm.name}
</div>

<div className="text-gray-500 text-xs">
{dm.lastMsg}
</div>

</div>

</div>

))}

</div>

</div>


{/* CHAT AREA */}

<div className="flex-1 flex flex-col">

{/* HEADER */}

<div className="p-3.5 bg-slate-900/60 border-b border-slate-800">

<h2 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
{currentChat?.name || t("chat.selectChannel")}
</h2>

</div>


{/* MESSAGES */}

<div className="flex-1 p-4 overflow-y-auto space-y-3 scrollbar-overlay">

{messages.map(msg => (

<div key={msg.id} className="flex gap-3">

<div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-sm">
{msg.user?.avatar}
</div>

<div>

<div className={`font-semibold text-xs ${isDarkMode ? "text-white" : "text-slate-900"}`}>
{msg.user?.name}
</div>

<p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-slate-600"}`}>
{msg.content}
</p>

</div>

</div>

))}

</div>


{/* MESSAGE INPUT */}

<div className="p-3.5 bg-slate-900/60 border-t border-slate-800">

<div className="flex gap-2">

<input
type="text"
value={message}
onChange={(e)=>setMessage(e.target.value)}
className={`flex-1 px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 text-sm ${isDarkMode ? "text-white" : "text-slate-900"}`}
placeholder={t("chat.placeholderInput")}
/>

<button
onClick={sendMessage}
className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 text-sm font-semibold text-white hover:from-cyan-500 hover:to-teal-500 transition-all"
>
🚀
</button>

</div>

</div>

</div>

</div>

</div>


{/* EMOJI MODAL */}

<Modal
isOpen={showEmojiPicker}
onClose={()=>setShowEmojiPicker(false)}
title={t("chat.modalEmojiTitle")}
size="sm"
>

<div className="grid grid-cols-8 gap-2">

{emojis.map((emoji,i)=>(
<button
key={i}
onClick={()=>handleReaction(selectedMessage,emoji)}
className="text-xl"
>
{emoji}
</button>
))}

</div>

</Modal>


{/* CREATE CHANNEL */}

<Modal
isOpen={showCreateChannelModal}
onClose={()=>setShowCreateChannelModal(false)}
title={t("chat.modalCreateChannelTitle")}
>

<GradientButton
onClick={() => toast.success(t("chat.createChannelOk"))}
>
{t("chat.create")}
</GradientButton>

</Modal>


</>

  );
}

export default ChatPage;