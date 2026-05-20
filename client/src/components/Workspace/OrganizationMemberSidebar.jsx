import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { organizationAPI } from '../../services/api/organizationAPI';
import roleAPI from '../../services/api/roleAPI';
import userService from '../../services/userService';
import friendService from '../../services/friendService';
import { ConfirmDialog } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { useTheme } from '../../context/ThemeContext';

const unwrapBody = (payload) => payload?.data ?? payload;

const MEMBERSHIP_ROLE_ORDER = ['owner', 'admin', 'member'];

function memberUserId(m) {
  const u = m?.user;
  if (u && typeof u === 'object') return String(u._id || u.id || '');
  return String(u || '');
}

async function fetchMembersRaw(orgId) {
  const payload = await organizationAPI.getMembers(orgId);
  const body = unwrapBody(payload);
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  return list.filter((m) => String(m?.status || 'active') === 'active');
}

async function enrichMembersWithProfiles(members, memberFallback) {
  const out = await Promise.all(
    members.map(async (m) => {
      const uid = memberUserId(m);
      let displayName = uid.slice(-6) || memberFallback;
      let avatar = null;
      let username = null;
      if (uid) {
        try {
          const res = await userService.getProfile(uid);
          const u = unwrapBody(res)?.data ?? unwrapBody(res);
          const profile = u?.data ?? u;
          displayName =
            profile?.displayName ||
            profile?.fullName ||
            profile?.username ||
            profile?.email?.split('@')[0] ||
            displayName;
          avatar = profile?.avatar || null;
          username = profile?.username || null;
        } catch {
          /* giữ mặc định */
        }
      }
      return {
        membershipId: String(m._id),
        userId: uid,
        role: String(m.role || 'member').toLowerCase(),
        displayName,
        username,
        avatar,
      };
    })
  );
  return out;
}

/**
 * Danh sách thành viên tổ chức: theo vai trò (khi org có định nghĩa roles hệ thống)
 * hoặc Trực tuyến / Ngoại tuyến (mặc định).
 */
const CONTEXT_MENU_PAD = 8;

/**
 * Vị trí khởi tạo tại con trỏ; căn chính xác theo chiều cao thật của menu trong useLayoutEffect.
 */
function computeContextMenuPosition(clientX, clientY) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const menuW = Math.min(260, vw - 2 * CONTEXT_MENU_PAD);

  const left = Math.min(Math.max(CONTEXT_MENU_PAD, clientX), vw - menuW - CONTEXT_MENU_PAD);
  const top = Math.max(CONTEXT_MENU_PAD, clientY);

  return { left, top, menuW };
}

function canRemoveMember(myRole, targetRole, targetUserId, currentUserId) {
  if (!currentUserId || String(targetUserId) === String(currentUserId)) return false;
  const my = String(myRole || '').toLowerCase();
  const tr = String(targetRole || '').toLowerCase();
  if (my !== 'owner' && my !== 'admin') return false;
  if (tr === 'owner') return false;
  if (my === 'admin' && tr === 'admin') return false;
  return true;
}

function OrganizationMemberSidebar({
  organizationId,
  organizationName = '',
  onlineUsers = [],
  socketConnected = false,
  refreshKey = 0,
  currentUserId = null,
  myRole = 'member',
  onMentionUser,
  onMemberRemoved,
  /** Khi bọc trong OrganizationMemberPeekDock: false = panel đang thu → đóng menu portal */
  memberDockOpen,
  onMemberMenuOpenChange,
  onMemberMenuClosed,
}) {
  const { t } = useAppStrings();
  const { isDarkMode } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState([]);
  const [groupMode, setGroupMode] = useState('presence'); // 'presence' | 'role'
  const [menu, setMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    member: null,
    /** Chỉ đặt khi nội dung cao hơn viewport — lúc đó mới cần cuộn trong menu */
    menuMaxHeight: undefined,
  });
  const menuPanelRef = useRef(null);
  /** Xóa thành viên / Chặn — dùng modal thay cho window.confirm (tránh tiêu đề localhost) */
  const [memberConfirm, setMemberConfirm] = useState(null);
  /** Tab panel phải — khớp mockup workspace tổ chức */
  const [sidebarTab, setSidebarTab] = useState('context');

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [rawMembers, rolesPayload] = await Promise.all([
          fetchMembersRaw(organizationId),
          roleAPI.getRolesByOrganization(organizationId).catch(() => null),
        ]);
        if (cancelled) return;

        const rolesBody = rolesPayload ? unwrapBody(rolesPayload) : null;
        const rolesList = Array.isArray(rolesBody?.data)
          ? rolesBody.data
          : Array.isArray(rolesBody)
            ? rolesBody
            : [];
        const hasCustomRoles = Array.isArray(rolesList) && rolesList.length > 0;
        setGroupMode(hasCustomRoles ? 'role' : 'presence');

        const enriched = await enrichMembersWithProfiles(rawMembers, t('organizations.memberFallbackShort'));
        if (cancelled) return;
        setRows(enriched);
      } catch (e) {
        if (!cancelled) {
          setError(t('organizations.loadMembersError'));
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId, refreshKey, t]);

  const onlineSet = useMemo(
    () => new Set((onlineUsers || []).map((id) => String(id))),
    [onlineUsers]
  );

  const checkOnline = (userId) => socketConnected && onlineSet.has(String(userId));

  const groupedByPresence = useMemo(() => {
    const on = [];
    const off = [];
    for (const r of rows) {
      const online = socketConnected && onlineSet.has(String(r.userId));
      if (online) on.push(r);
      else off.push(r);
    }
    return [
      { key: 'on', title: t('organizations.presenceOnline'), items: on },
      { key: 'off', title: t('organizations.presenceOffline'), items: off },
    ];
  }, [rows, onlineSet, socketConnected, t]);

  const groupedByMembershipRole = useMemo(() => {
    const roleLabel = {
      owner: t('organizations.roleOwner'),
      admin: t('organizations.roleAdmin'),
      member: t('organizations.roleMember'),
    };
    const buckets = { owner: [], admin: [], member: [] };
    for (const r of rows) {
      const k = MEMBERSHIP_ROLE_ORDER.includes(r.role) ? r.role : 'member';
      buckets[k].push(r);
    }
    return MEMBERSHIP_ROLE_ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
      key: k,
      title: roleLabel[k] || k,
      items: buckets[k],
    }));
  }, [rows, t]);

  const roleLabelMap = useMemo(
    () => ({
      owner: t('organizations.roleOwner'),
      admin: t('organizations.roleAdmin'),
      member: t('organizations.roleMember'),
    }),
    [t]
  );

  const sections = groupMode === 'role' ? groupedByMembershipRole : groupedByPresence;

  const closeMenu = useCallback(() => {
    setMenu((prev) => ({ ...prev, open: false, member: null, menuMaxHeight: undefined }));
  }, []);

  const prevMenuOpenRef = useRef(false);

  useLayoutEffect(() => {
    onMemberMenuOpenChange?.(menu.open);
  }, [menu.open, onMemberMenuOpenChange]);

  useLayoutEffect(() => {
    if (memberDockOpen === false) closeMenu();
  }, [memberDockOpen, closeMenu]);

  useEffect(() => {
    if (prevMenuOpenRef.current && !menu.open) {
      onMemberMenuClosed?.();
    }
    prevMenuOpenRef.current = menu.open;
  }, [menu.open, onMemberMenuClosed]);

  const openMemberMenu = useCallback((e, member) => {
    e.preventDefault();
    e.stopPropagation();
    const { left, top, menuW } = computeContextMenuPosition(e.clientX, e.clientY);
    setMenu({ open: true, x: left, y: top, menuW, member, menuMaxHeight: undefined });
  }, []);

  /** Căn menu theo kích thước thật vào viewport — ưu tiên dịch lên góc dưới màn hình; chỉ cuộn trong menu khi nội dung cao hơn viewport */
  useLayoutEffect(() => {
    if (!menu.open || !menu.member || !menuPanelRef.current) return;

    const el = menuPanelRef.current;
    const pad = CONTEXT_MENU_PAD;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxAvailH = vh - 2 * pad;

    const rect = el.getBoundingClientRect();
    const naturalH = el.scrollHeight;
    const w = rect.width;

    let left = menu.x;
    let top = menu.y;
    let maxH = undefined;

    if (naturalH <= maxAvailH) {
      left = Math.max(pad, Math.min(menu.x, vw - pad - w));
      top = Math.max(pad, Math.min(menu.y, vh - pad - naturalH));
    } else {
      maxH = maxAvailH;
      left = Math.max(pad, Math.min(menu.x, vw - pad - w));
      top = pad;
    }

    setMenu((m) => {
      if (!m.open || !m.member) return m;
      const samePos = Math.abs(left - m.x) < 0.5 && Math.abs(top - m.y) < 0.5;
      const sameMax =
        (maxH === undefined && m.menuMaxHeight === undefined) ||
        (maxH !== undefined && Math.abs(maxH - (m.menuMaxHeight ?? 0)) < 0.5);
      if (samePos && sameMax) return m;
      return { ...m, x: left, y: top, menuMaxHeight: maxH };
    });
  }, [menu.open, menu.member, menu.x, menu.y, menu.menuW, menu.member?.membershipId]);

  useEffect(() => {
    if (!menu.open) return;
    const onKey = (ev) => {
      if (ev.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu.open, closeMenu]);

  const confirmMemberAction = useCallback(async () => {
    if (!memberConfirm?.member) return;
    const m = memberConfirm.member;
    try {
      if (memberConfirm.type === 'remove') {
        if (!organizationId || !m?.userId) return;
        await organizationAPI.removeMember(organizationId, m.userId);
        toast.success(t('organizations.toastMemberRemoved'));
        onMemberRemoved?.();
      } else {
        await friendService.blockUser(m.userId);
        toast.success(t('organizations.toastBlocked'));
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        (memberConfirm.type === 'remove' ? t('organizations.toastRemoveFail') : t('organizations.toastBlockFail'));
      toast.error(
        typeof msg === 'string'
          ? msg
          : memberConfirm.type === 'remove'
            ? t('organizations.toastRemoveFail')
            : t('organizations.toastBlockFail')
      );
    }
  }, [memberConfirm, organizationId, onMemberRemoved, t]);

  const mentionText = (m) => {
    const tag = m.username || String(m.displayName || 'user').replace(/\s+/g, '_');
    return `@${tag} `;
  };

  const menuPortal =
    menu.open &&
    menu.member &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[9997]"
          aria-hidden
          onClick={closeMenu}
          onContextMenu={(e) => {
            e.preventDefault();
            closeMenu();
          }}
        />
        <div
          ref={menuPanelRef}
          className={`fixed z-[9998] rounded-xl border border-white/10 bg-[#2b2d31] py-1.5 text-sm shadow-2xl ${
            menu.menuMaxHeight != null ? 'overflow-y-auto scrollbar-overlay' : 'overflow-hidden'
          }`}
          style={{
            left: menu.x,
            top: menu.y,
            width: menu.menuW ?? Math.min(260, typeof window !== 'undefined' ? window.innerWidth - 16 : 260),
            maxWidth: 'min(260px, calc(100vw - 16px))',
            ...(menu.menuMaxHeight != null ? { maxHeight: menu.menuMaxHeight } : {}),
          }}
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              const m = menu.member;
              closeMenu();
              if (String(m.userId) === String(currentUserId)) {
                navigate('/profile');
              } else {
                toast(t('organizations.toastProfileOther'), { icon: '👤' });
              }
            }}
          >
            {t('organizations.memberMenuProfile')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              const m = menu.member;
              const mention = mentionText(m);
              onMentionUser?.(mention);
              closeMenu();
              toast.success(t('organizations.toastMentionOk'));
            }}
          >
            {t('organizations.memberMenuMention')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              closeMenu();
              navigate('/chat/friends');
            }}
          >
            {t('organizations.memberMenuMessage')}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              closeMenu();
              navigate('/voice');
            }}
          >
            {t('organizations.memberMenuCall')}
          </button>
          <div className="px-3 py-2">
            <button
              type="button"
              className="w-full rounded-lg px-0 py-1 text-left text-gray-100 hover:bg-white/10"
              onClick={() => {
                closeMenu();
                toast(t('organizations.toastNoteSoon'), { icon: '📝' });
              }}
            >
              <div>{t('organizations.memberMenuNoteTitle')}</div>
              <div className="text-xs text-gray-500">{t('organizations.memberMenuNoteSub')}</div>
            </button>
          </div>
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              closeMenu();
              toast(t('organizations.toastAppsSoon'), { icon: '🧩' });
            }}
          >
            <span>{t('organizations.memberMenuApps')}</span>
            <span className="text-gray-500">›</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              closeMenu();
              toast(t('organizations.toastInviteServerSoon'), { icon: '🔗' });
            }}
          >
            <span>{t('organizations.memberMenuInviteServer')}</span>
            <span className="text-gray-500">›</span>
          </button>
          <div className="my-1 border-t border-white/10" />
          {String(menu.member.userId) !== String(currentUserId) && (
            <>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
                onClick={async () => {
                  const m = menu.member;
                  closeMenu();
                  try {
                    await friendService.sendRequest(m.userId);
                    toast.success(t('organizations.toastFriendSent'));
                  } catch (err) {
                    const msg =
                      err?.response?.data?.message || err?.response?.data?.error || err?.message;
                    toast.error(typeof msg === 'string' ? msg : t('organizations.toastFriendFail'));
                  }
                }}
              >
                {t('organizations.memberMenuAddFriend')}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-gray-100 hover:bg-white/10"
                onClick={() => {
                  closeMenu();
                  toast(t('organizations.toastIgnoreSoon'), { icon: '👁' });
                }}
              >
                {t('organizations.memberMenuIgnore')}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-orange-300 hover:bg-white/10"
                onClick={() => {
                  const m = menu.member;
                  closeMenu();
                  setMemberConfirm({ type: 'block', member: m });
                }}
              >
                {t('organizations.memberMenuBlock')}
              </button>
            </>
          )}
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-gray-100 hover:bg-white/10"
            onClick={() => {
              closeMenu();
              if (organizationId) {
                navigate(`/workspaces/${encodeURIComponent(organizationId)}/settings`);
              }
            }}
          >
            <span>{t('organizations.memberMenuRoles')}</span>
            <span className="text-gray-500">›</span>
          </button>
          {menu.member &&
            canRemoveMember(myRole, menu.member.role, menu.member.userId, currentUserId) && (
              <>
                <div className="my-1 border-t border-white/10" />
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-left text-rose-400 hover:bg-rose-500/15"
                  onClick={() => {
                    closeMenu();
                    setMemberConfirm({ type: 'remove', member: menu.member });
                  }}
                >
                  {t('organizations.memberMenuRemove')}
                </button>
              </>
            )}
        </div>
      </>,
      document.body
    );

  const tabBtn = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => setSidebarTab(id)}
      className={`min-w-0 flex-1 rounded-lg px-1.5 py-2 text-[10px] font-semibold leading-tight transition sm:text-[11px] ${
        sidebarTab === id
          ? isDarkMode
            ? 'bg-[#5865F2]/25 text-white ring-1 ring-[#5865F2]/40'
            : 'bg-cyan-100 text-cyan-950 ring-1 ring-cyan-300/70'
          : isDarkMode
            ? 'text-[#8e9297] hover:bg-white/[0.04] hover:text-white'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${isDarkMode ? 'bg-[#0a0c12]' : 'bg-sky-50/95'}`}
    >
      <div
        className={`shrink-0 border-b px-3 py-2.5 ${isDarkMode ? 'border-white/[0.06]' : 'border-sky-200/80'}`}
      >
        <div
          className={`truncate text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
          title={organizationName}
        >
          {organizationName || t('organizations.memberSidebarOrgFallback')}
        </div>
        <p
          className={`mt-0.5 text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
        >
          {t('organizations.memberSidebarSubtitle')}
        </p>
      </div>

      <div
        className={`grid shrink-0 grid-cols-2 gap-1 border-b px-2 py-2 sm:grid-cols-4 ${
          isDarkMode ? 'border-white/[0.06]' : 'border-sky-200/80'
        }`}
      >
        {tabBtn('context', t('organizations.memberSidebarTabContext'))}
        {tabBtn('tasks', t('organizations.memberSidebarTabTasks'))}
        {tabBtn('files', t('organizations.memberSidebarTabFiles'))}
        {tabBtn('stats', t('organizations.memberSidebarTabStats'))}
      </div>

      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {sidebarTab === 'context' && (
          <div className="mb-4 space-y-3">
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { k: t('organizations.memberSidebarStatCandidates'), v: '47', t: '+15%' },
                { k: t('organizations.memberSidebarStatOffer'), v: '68%', t: '+3%' },
                { k: t('organizations.memberSidebarStatTth'), v: '18d', t: '-2d' },
              ].map((s) => (
                <div
                  key={s.k}
                  className={`rounded-xl border p-2 shadow-inner ${
                    isDarkMode
                      ? 'border-white/[0.06] bg-[#12151f]'
                      : 'border-slate-200 bg-white shadow-sm'
                  }`}
                >
                  <div
                    className={`text-[9px] font-medium uppercase leading-tight ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                  >
                    {s.k}
                  </div>
                  <div
                    className={`mt-1 text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                  >
                    {s.v}
                  </div>
                  <div
                    className={`text-[10px] font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
                  >
                    {s.t}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div
                className={`mb-1.5 text-[10px] font-bold uppercase tracking-wide ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
              >
                {t('organizations.memberSidebarPinned')}
              </div>
              <div className="space-y-2">
                <div
                  className={`rounded-xl border-l-4 border-[#5865F2] px-2.5 py-2 ${
                    isDarkMode ? 'bg-white/[0.03]' : 'bg-white shadow-sm'
                  }`}
                >
                  <p
                    className={`text-[11px] leading-snug ${isDarkMode ? 'text-[#b4b8c4]' : 'text-slate-700'}`}
                  >
                    {t('organizations.memberSidebarPinBody1')}
                  </p>
                  <p
                    className={`mt-1 text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                  >
                    {t('organizations.memberSidebarPinMeta1')}
                  </p>
                </div>
                <div
                  className={`rounded-xl border-l-4 border-sky-500 px-2.5 py-2 ${
                    isDarkMode ? 'bg-white/[0.03]' : 'bg-white shadow-sm'
                  }`}
                >
                  <p
                    className={`text-[11px] leading-snug ${isDarkMode ? 'text-[#b4b8c4]' : 'text-slate-700'}`}
                  >
                    {t('organizations.memberSidebarPinBody2')}
                  </p>
                  <p
                    className={`mt-1 text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                  >
                    {t('organizations.memberSidebarPinMeta2')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {sidebarTab === 'tasks' && (
          <p
            className={`px-1 py-6 text-center text-xs ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
          >
            {t('organizations.memberSidebarTasksEmpty')}
          </p>
        )}
        {sidebarTab === 'files' && (
          <p
            className={`px-1 py-6 text-center text-xs ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
          >
            {t('organizations.memberSidebarFilesEmpty')}
          </p>
        )}
        {sidebarTab === 'stats' && (
          <p
            className={`px-1 py-6 text-center text-xs ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
          >
            {t('organizations.memberSidebarStatsEmpty')}
          </p>
        )}

        {loading && (
          <div className="space-y-2">
            <div
              className={`h-9 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/10' : 'bg-slate-200/90'}`}
            />
            <div
              className={`h-9 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}
            />
            <div
              className={`h-9 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}
            />
          </div>
        )}
        {!loading && error && <p className="px-1 text-xs text-rose-300">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="px-1 text-xs text-gray-500">{t('organizations.membersEmpty')}</p>
        )}
        {!loading &&
          !error &&
          sidebarTab === 'context' &&
          sections.map((section) => (
            <div key={section.key} className="mb-4">
              <div
                className={`sticky top-0 z-[1] px-1 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide backdrop-blur-sm ${
                  isDarkMode
                    ? 'bg-[#0a0c12]/95 text-[#6d7380]'
                    : 'bg-sky-50/95 text-slate-500'
                }`}
              >
                {t('organizations.memberSidebarMemberLine', { title: section.title, count: section.items.length })}
              </div>
              <ul className="space-y-0.5">
                {section.items.map((m) => {
                  const online = checkOnline(m.userId);
                  const dim = groupMode === 'presence' && !online;
                  const statusLabel = online ? t('organizations.presenceOnline') : t('organizations.presenceOffline');
                  return (
                    <li
                      key={m.membershipId}
                      className={`flex cursor-default items-center gap-2 rounded-xl px-1.5 py-2 transition ${
                        isDarkMode ? 'hover:bg-white/[0.04]' : 'hover:bg-slate-100/90'
                      } ${dim ? 'opacity-55' : ''}`}
                      onContextMenu={(e) => openMemberMenu(e, m)}
                    >
                      <div className="relative h-9 w-9 shrink-0 rounded-lg">
                        {m.avatar ? (
                          <img
                            src={m.avatar}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-700 text-xs font-bold text-white">
                            {(m.displayName || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 ${
                            isDarkMode ? 'border-[#0a0c12]' : 'border-white'
                          } ${online ? 'bg-emerald-400' : 'bg-gray-600'}`}
                          aria-hidden
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                        >
                          {m.displayName}
                        </div>
                        {groupMode === 'role' && (
                          <div
                            className={`truncate text-[10px] ${isDarkMode ? 'text-[#6d7380]' : 'text-slate-500'}`}
                          >
                            {roleLabelMap[m.role] || m.role}
                          </div>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-[10px] font-medium ${isDarkMode ? 'text-[#8e9297]' : 'text-slate-500'}`}
                      >
                        {statusLabel}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>
      {menuPortal}
      <ConfirmDialog
        isOpen={memberConfirm != null}
        onClose={() => setMemberConfirm(null)}
        onConfirm={confirmMemberAction}
        title={
          memberConfirm?.type === 'remove'
            ? t('organizations.confirmRemoveMemberTitle')
            : t('organizations.confirmBlockUserTitle')
        }
        message={
          memberConfirm?.type === 'remove'
            ? t('organizations.confirmRemoveMemberMsg', {
                name: memberConfirm?.member?.displayName || t('organizations.memberFallbackRemove'),
              })
            : t('organizations.confirmBlockUserMsg', {
                name: memberConfirm?.member?.displayName || t('organizations.memberFallbackBlock'),
              })
        }
        confirmText={
          memberConfirm?.type === 'remove' ? t('common.delete') : t('organizations.confirmBlockBtn')
        }
        cancelText={t('nav.cancel')}
      />
    </div>
  );
}

export default OrganizationMemberSidebar;
