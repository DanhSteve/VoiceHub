import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton } from '../../components/Shared';
import AddFriendModal from '../../components/Friends/AddFriendModal';
import friendService from '../../services/friendService';
import { useAppStrings } from '../../locales/appStrings';

function FriendsPage() {
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const [activeTab, setActiveTab] = useState('all');
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(() => new Set());

  const sendFriendRequest = async (userId) => {
    const id = userId && String(userId).trim();
    if (!id) {
      toast.error(t('friends.errUserUnknown'));
      return;
    }
    try {
      await friendService.sendRequest(id);
      toast.success(t('friends.toastRequestSent'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('friends.toastRequestErr'));
    }
  };

  const friends = [
    { name: 'Sarah Chen', status: 'online', avatar: '👩‍💼', role: 'Designer', mutualFriends: 12, lastActive: 'Đang hoạt động', activity: 'Đang làm việc trong dự án UI' },
    { name: 'Mike Ross', status: 'online', avatar: '👨‍💻', role: 'Developer', mutualFriends: 8, lastActive: 'Đang hoạt động', activity: 'Code review' },
    { name: 'Emma Wilson', status: 'away', avatar: '👩‍🎨', role: 'Product Manager', mutualFriends: 15, lastActive: '10 phút trước', activity: 'Trong cuộc họp' },
    { name: 'David Kim', status: 'offline', avatar: '👨‍🔬', role: 'Data Scientist', mutualFriends: 6, lastActive: '2 giờ trước', activity: '' },
    { name: 'Lisa Park', status: 'online', avatar: '👩‍💼', role: 'Marketing Lead', mutualFriends: 20, lastActive: 'Đang hoạt động', activity: 'Đang soạn báo cáo' },
    { name: 'Tom Zhang', status: 'busy', avatar: '👨‍💻', role: 'DevOps', mutualFriends: 5, lastActive: 'Đang hoạt động', activity: 'Đừng làm phiền' }
  ];

  const friendRequests = [
    { name: 'Anna Lee', avatar: '👩‍🔬', mutualFriends: 3, requestDate: '2 ngày trước' },
    { name: 'John Smith', avatar: '👨‍💼', mutualFriends: 7, requestDate: '1 tuần trước' }
  ];

  const suggestions = [
    { name: 'Sophie Turner', avatar: '👩‍🎨', mutualFriends: 9, reason: 'Cùng tổ chức' },
    { name: 'Alex Brown', avatar: '👨‍🔬', mutualFriends: 5, reason: 'Bạn của bạn bè' }
  ];

  // search state
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);


  const getStatusColor = (status) => {
    const colors = {
      online: 'bg-green-500',
      away: 'bg-yellow-500',
      busy: 'bg-red-500',
      offline: 'bg-gray-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  const getStatusLabel = (status) => {
    const labels = {
      online: t('friends.statusOnline'),
      away: t('friends.statusAway'),
      busy: t('friends.statusBusy'),
      offline: t('friends.statusOffline'),
    };
    return labels[status] || status;
  };

  const onlineFriends = friends.filter(f => f.status === 'online');
  const allFriends = friends;

  const handleSearch = async () => {
    if (!searchPhone) {
      toast.error(t('friends.toastPhoneRequired'));
      return;
    }

    try {
      const resp = await friendService.searchByPhone(searchPhone);
      const body = resp?.data !== undefined ? resp.data : resp;
      const user = body?.data !== undefined ? body.data : body;
      if (user && (user._id || user.userId || user.phone)) {
        setSearchResult(user);
      } else {
        toast(t('friends.toastSearchNone'), { icon: 'ℹ️' });
        setSearchResult(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('friends.toastSearchErr'));
      setSearchResult(null);
    }
  };

  const clearSearch = () => {
    setSearchResult(null);
    setSearchPhone('');
  };

  return (
    <div className="min-h-screen flex">
      <NavigationSidebar currentPage={t('friends.navTitle')} />
      <div className="flex-1 p-6 overflow-y-auto overflow-x-visible scrollbar-gradient">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-gradient mb-2">{t('friends.pageTitle')}</h1>
            <p className="text-gray-400">{t('friends.subtitle')}</p>
          </div>
          <GradientButton
            type="button"
            variant="primary"
            className="shrink-0 px-6 py-3 text-base font-semibold"
            onClick={() => setShowAddFriend(true)}
          >
            {t('friends.addFriend')}
          </GradientButton>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'all', label: t('friends.tabAll', { n: friends.length }), icon: '👥' },
            { id: 'online', label: t('friends.tabOnline', { n: onlineFriends.length }), icon: '🟢' },
            { id: 'requests', label: t('friends.tabRequests', { n: friendRequests.length }), icon: '📬' },
            { id: 'suggestions', label: t('friends.tabSuggestions'), icon: '✨' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'glass hover:bg-white/10 text-gray-400'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* All Friends Tab */}
        {activeTab === 'all' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allFriends.map((friend, idx) => (
              <GlassCard key={idx} hover className="animate-slideUp group" style={{animationDelay: `${idx * 0.05}s`}}>
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-3xl">
                      {friend.avatar}
                    </div>
                    <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#0a0118] ${getStatusColor(friend.status)} ${
                      friend.status === 'online' ? 'animate-pulse' : ''
                    }`}></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white mb-1 group-hover:text-gradient transition-colors">{friend.name}</h3>
                    <p className="text-gray-400 text-sm mb-1">{friend.role}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <span className={friend.status === 'online' ? 'text-green-400' : ''}>{getStatusLabel(friend.status)}</span>
                      {friend.status !== 'offline' && friend.lastActive && (
                        <>
                          <span>•</span>
                          <span>{friend.lastActive}</span>
                        </>
                      )}
                    </div>
                    {friend.activity && (
                      <div className="text-xs glass-strong px-2 py-1 rounded-lg inline-block">
                        💭 {friend.activity}
                      </div>
                    )}
                    <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                      <span>👥</span>
                      <span>{t('friends.mutualFriends', { n: friend.mutualFriends })}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link to="/chat/friends" className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-sm font-semibold flex items-center gap-1">
                      {t('friends.message')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        toast(t('friends.toastConnecting', { name: friend.name }), { icon: '📞' });
                        setTimeout(() => {
                          navigate(`/voice/call-${friend.name.toLowerCase().replace(/\s+/g, '-')}`);
                        }, 500);
                      }}
                      className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-sm font-semibold flex items-center gap-1"
                    >
                      {t('friends.call')}
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Online Friends Tab */}
        {activeTab === 'online' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {onlineFriends.map((friend, idx) => (
              <GlassCard key={idx} hover glow className="animate-slideUp" style={{animationDelay: `${idx * 0.05}s`}}>
                <div className="text-center">
                  <div className="relative inline-block mb-3">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-4xl">
                      {friend.avatar}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-4 border-[#0a0118] animate-pulse flex items-center justify-center">
                      <span className="text-xs">✓</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-white mb-1">{friend.name}</h3>
                  <p className="text-gray-400 text-sm mb-3">{friend.role}</p>
                  {friend.activity && (
                    <div className="text-xs glass-strong px-3 py-1.5 rounded-lg mb-3">
                      {friend.activity}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => navigate('/chat/friends')}
                      className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm"
                      aria-label={`Nhắn tin ${friend.name}`}
                    >
                      💬
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        toast(t('friends.toastConnecting', { name: friend.name }), { icon: '📞' });
                        setTimeout(() => navigate(`/voice/call-${friend.name.toLowerCase().replace(/\s+/g, '-')}`), 400);
                      }}
                      className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm"
                      aria-label={`Gọi ${friend.name}`}
                    >
                      📞
                    </button>
                    <button
                      type="button"
                      onClick={() => toast(t('friends.toastFriendOptions'), { icon: '⋯' })}
                      className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm"
                    >
                      ⋯
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Friend Requests Tab */}
        {activeTab === 'requests' && (
          <div className="grid gap-4 max-w-2xl">
            {friendRequests.map((request, idx) => (
              <GlassCard key={idx} hover className="animate-slideUp" style={{animationDelay: `${idx * 0.1}s`}}>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-3xl">
                    {request.avatar}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white mb-1">{request.name}</h3>
                    <div className="text-sm text-gray-400 mb-1">{t('friends.mutualFriends', { n: request.mutualFriends })}</div>
                    <div className="text-xs text-gray-500">{t('friends.requestSentOn', { date: request.requestDate })}</div>
                  </div>
                  <div className="flex gap-2">
                    <GradientButton
                      type="button"
                      variant="primary"
                      onClick={() => toast.success(t('friends.toastAcceptDemo', { name: request.name }))}
                    >
                      {t('friends.accept')}
                    </GradientButton>
                    <button
                      type="button"
                      onClick={() => toast(t('friends.toastRejectDemo', { name: request.name }), { icon: 'ℹ️' })}
                      className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold"
                    >
                      {t('friends.reject')}
                    </button>
                  </div>
                </div>
              </GlassCard>
            ))}
            {friendRequests.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <div className="text-6xl mb-4">📭</div>
                <p>{t('friends.noRequests')}</p>
              </div>
            )}
          </div>
        )}

        {/* Suggestions Tab */}
        {activeTab === 'suggestions' && (
          <>
            {/* search input */}
            <div className="mb-4 flex gap-2 items-center max-w-md">
              <input
                type="text"
                placeholder={t('friends.searchPlaceholder')}
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                className="flex-1 px-4 py-2 rounded-xl glass text-white placeholder-gray-400"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold"
              >
                {t('friends.searchBtn')}
              </button>
              {searchResult && (
                <button type="button" onClick={clearSearch} className="text-gray-400 hover:text-white">
                  ✕
                </button>
              )}
            </div>

            {searchResult && (
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-2">{t('friends.searchResults')}</h2>
                <GlassCard hover>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-3xl">
                      {searchResult.avatar || '👤'}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white mb-1">{searchResult.displayName || searchResult.username}</h3>
                      <div className="text-xs text-gray-400 mb-1">{searchResult.phone}</div>
                      {searchResult.relationship && (
                        <div className="text-xs text-gray-300">
                          {t('friends.statusLabel')} {searchResult.relationship.status}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <GradientButton
                        variant="secondary"
                        className="flex-1"
                        type="button"
                        onClick={() =>
                          sendFriendRequest(searchResult.userId || searchResult._id)
                        }
                      >
                        {t('friends.addFriendBtn')}
                      </GradientButton>
                    </div>
                  </div>
                </GlassCard>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestions
                .filter((s) => !dismissedSuggestions.has(s.name))
                .map((suggestion, idx) => (
                <GlassCard key={suggestion.name} hover className="animate-slideUp" style={{animationDelay: `${idx * 0.1}s`}}>
                  <div className="text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-4xl mx-auto mb-3">
                      {suggestion.avatar}
                    </div>
                    <h3 className="font-bold text-white mb-1">{suggestion.name}</h3>
                    <div className="text-xs glass-strong px-2 py-1 rounded-full inline-block mb-2">
                      {suggestion.reason}
                    </div>
                    <div className="text-sm text-gray-400 mb-4">{t('friends.mutualFriends', { n: suggestion.mutualFriends })}</div>
                    <div className="flex gap-2">
                      <GradientButton
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        onClick={() =>
                          toast.success(t('friends.toastInviteDemo', { name: suggestion.name }))
                        }
                      >
                        {t('friends.addFriendBtn')}
                      </GradientButton>
                      <button
                        type="button"
                        onClick={() =>
                          setDismissedSuggestions((prev) => new Set([...prev, suggestion.name]))
                        }
                        className="glass px-3 py-2 rounded-xl hover:bg-white/10 transition-all"
                        aria-label={t('friends.hideSuggestionAria')}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </>
        )}
      </div>
      
      <AddFriendModal isOpen={showAddFriend} onClose={() => setShowAddFriend(false)} />
    </div>
  );
}

export default FriendsPage;
