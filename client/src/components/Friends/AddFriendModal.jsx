import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { GlassCard, GradientButton } from '../Shared';
import friendService from '../../services/friendService';
import { useTheme } from '../../context/ThemeContext';

function unwrapApiPayload(res) {
  if (res == null) return null;
  return res.data !== undefined ? res.data : res;
}

/**
 * Modal căn giữa màn hình: tìm bạn theo SĐT, gửi lời mời, lời mời đến.
 */
export default function AddFriendModal({ isOpen, onClose, onFriendlistChanged }) {
  const { isDarkMode } = useTheme();
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [pending, setPending] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [searching, setSearching] = useState(false);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const res = await friendService.getPendingRequests();
      const inner = unwrapApiPayload(res);
      const arr = Array.isArray(inner) ? inner : Array.isArray(inner?.data) ? inner.data : [];
      setPending(arr);
    } catch {
      setPending([]);
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    loadPending();
    setSearchPhone('');
    setSearchResult(null);
  }, [isOpen, loadPending]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSearch = async () => {
    if (!searchPhone.trim()) {
      toast.error('Nhập số điện thoại');
      return;
    }
    setSearching(true);
    setSearchResult(null);
    try {
      const resp = await friendService.searchByPhone(searchPhone.trim());
      const user = unwrapApiPayload(resp);
      if (user && (user._id || user.userId || user.phone)) {
        setSearchResult(user);
      } else {
        toast('Không tìm thấy người dùng', { icon: 'ℹ️' });
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Lỗi khi tìm kiếm');
    } finally {
      setSearching(false);
    }
  };

  const targetUserId = (user) => String(user?.userId || user?._id || '').trim();

  const sendFriendRequest = async (userId) => {
    if (!userId) {
      toast.error('Không xác định được người dùng');
      return;
    }
    try {
      await friendService.sendRequest(userId);
      toast.success('Đã gửi lời mời');
      setSearchResult(null);
      setSearchPhone('');
      onFriendlistChanged?.();
      await loadPending();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Không gửi được lời mời');
    }
  };

  const acceptRequest = async (requestId) => {
    try {
      await friendService.acceptRequest(requestId);
      toast.success('Đã chấp nhận');
      onFriendlistChanged?.();
      await loadPending();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi');
    }
  };

  const rejectRequest = async (requestId) => {
    try {
      await friendService.rejectRequest(requestId);
      toast.success('Đã từ chối');
      onFriendlistChanged?.();
      await loadPending();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Lỗi');
    }
  };

  const relationshipLabel = (rel) => {
    if (!rel?.status) return null;
    const s = String(rel.status).toLowerCase();
    if (s === 'accepted' || s === 'friends') return 'Đã là bạn';
    if (s === 'pending') return 'Đang chờ phản hồi';
    if (s === 'blocked') return 'Đã chặn';
    return rel.status;
  };

  const canSendRequest = (user) => {
    const id = targetUserId(user);
    if (!id) return false;
    const rel = user?.relationship;
    if (!rel) return true;
    const st = String(rel.status || '').toLowerCase();
    if (st === 'accepted' || st === 'friends') return false;
    if (st === 'pending') return false;
    return true;
  };

  if (!isOpen) return null;

  const panel = isDarkMode
    ? 'relative z-10 flex w-full max-w-2xl max-h-[min(90vh,760px)] flex-col overflow-hidden rounded-2xl border border-slate-700/90 bg-[#0c1428] text-white shadow-2xl'
    : 'relative z-10 flex w-full max-w-2xl max-h-[min(90vh,760px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl';
  const headerBar = isDarkMode ? 'border-b border-slate-800' : 'border-b border-slate-200';
  const titleClass = isDarkMode ? 'text-lg font-bold text-white sm:text-xl' : 'text-lg font-bold text-slate-900 sm:text-xl';
  const subtitleClass = isDarkMode ? 'text-xs text-gray-400 sm:text-sm' : 'text-xs text-slate-600 sm:text-sm';
  const closeBtn = isDarkMode
    ? 'shrink-0 rounded-xl border border-slate-600 bg-slate-900/90 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800'
    : 'shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100';
  const sectionHeading = isDarkMode
    ? 'mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400'
    : 'mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500';
  const searchInput = isDarkMode
    ? 'min-w-0 flex-1 rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-cyan-500'
    : 'min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm placeholder:text-slate-400 outline-none focus:border-cyan-500';
  const cardBorder = isDarkMode ? 'border border-slate-800' : 'border border-slate-200 shadow-sm';
  const nameStrong = isDarkMode ? 'font-bold text-white' : 'font-bold text-slate-900';
  const muted = isDarkMode ? 'text-sm text-gray-400' : 'text-sm text-slate-600';
  const relBadge = isDarkMode ? 'mt-1 text-xs text-cyan-300' : 'mt-1 text-xs text-cyan-700';
  const countBadge = isDarkMode ? 'ml-2 font-normal normal-case text-indigo-400' : 'ml-2 font-normal normal-case text-cyan-700';
  const emptyBox = isDarkMode
    ? 'rounded-xl border border-dashed border-slate-700 py-8 text-center text-sm text-gray-500'
    : 'rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500';
  const rejectBtn = isDarkMode
    ? 'rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800'
    : 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-friend-title"
    >
      <button
        type="button"
        className={`absolute inset-0 backdrop-blur-sm ${isDarkMode ? 'bg-black/75' : 'bg-slate-900/45'}`}
        aria-label="Đóng"
        onClick={onClose}
      />

      <div className={panel} onClick={(e) => e.stopPropagation()}>
        <header className={`flex shrink-0 items-center justify-between gap-3 px-4 py-4 sm:px-6 ${headerBar}`}>
          <div className="min-w-0">
            <h1 id="add-friend-title" className={titleClass}>
              Kết bạn
            </h1>
            <p className={subtitleClass}>Tìm theo số điện thoại · Lời mời đang chờ</p>
          </div>
          <button type="button" onClick={onClose} className={closeBtn}>
            Đóng
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 scrollbar-overlay">
          <div className="space-y-6">
            <section>
              <h2 className={sectionHeading}>Tìm bạn</h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="Nhập số điện thoại"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className={searchInput}
                />
                <GradientButton
                  variant="primary"
                  type="button"
                  className="px-5 py-3"
                  disabled={searching}
                  onClick={handleSearch}
                >
                  {searching ? '…' : 'Tìm'}
                </GradientButton>
              </div>

              {searchResult && (
                <GlassCard className={`mt-4 ${cardBorder}`}>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 text-3xl">
                      {searchResult.avatar || '👤'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className={`truncate ${nameStrong}`}>
                        {searchResult.displayName ||
                          searchResult.name ||
                          searchResult.username ||
                          'Người dùng'}
                      </h3>
                      {searchResult.phone && <div className={muted}>{searchResult.phone}</div>}
                      {searchResult.relationship && (
                        <div className={relBadge}>{relationshipLabel(searchResult.relationship)}</div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canSendRequest(searchResult) ? (
                        <GradientButton
                          variant="primary"
                          type="button"
                          onClick={() => sendFriendRequest(targetUserId(searchResult))}
                        >
                          Gửi lời mời
                        </GradientButton>
                      ) : (
                        <span className="px-2 py-2 text-sm text-gray-500">Không thể gửi</span>
                      )}
                    </div>
                  </div>
                </GlassCard>
              )}
            </section>

            <section>
              <h2 className={sectionHeading}>
                Lời mời đến
                {loadingPending ? (
                  <span className={isDarkMode ? 'ml-2 font-normal normal-case text-gray-600' : 'ml-2 font-normal normal-case text-slate-500'}>
                    Đang tải…
                  </span>
                ) : (
                  <span className={countBadge}>({pending.length})</span>
                )}
              </h2>
              {pending.length === 0 && !loadingPending ? (
                <p className={emptyBox}>Không có lời mời chờ duyệt</p>
              ) : (
                <div className="space-y-3">
                  {pending.map((row) => {
                    const req = row.requester && typeof row.requester === 'object' ? row.requester : {};
                    const name =
                      req.displayName ||
                      req.name ||
                      req.username ||
                      (req.email ? String(req.email).split('@')[0] : 'Người dùng');
                    const rid = row._id;
                    return (
                      <GlassCard key={String(rid)} className={cardBorder}>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 text-2xl">
                            {req.avatar || '👤'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={`truncate font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{name}</div>
                            <div className={isDarkMode ? 'text-xs text-gray-500' : 'text-xs text-slate-500'}>
                              Muốn kết bạn với bạn
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <GradientButton variant="primary" type="button" onClick={() => acceptRequest(rid)}>
                              Chấp nhận
                            </GradientButton>
                            <button type="button" onClick={() => rejectRequest(rid)} className={rejectBtn}>
                              Từ chối
                            </button>
                          </div>
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

    </div>
  );
}
