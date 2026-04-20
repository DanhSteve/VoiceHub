import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';

/** Badge đỏ góc trên phải (kiểu thông báo), số trắng trong vòng tròn. */
function CornerBadge({ count, isDarkMode }) {
  if (count == null || count < 1) return null;
  const text = count > 99 ? '99+' : String(count);
  const ring = isDarkMode ? 'border-[#12151c]' : 'border-white';
  return (
    <span
      className={`pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 ${ring} bg-red-600 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm`}
      aria-hidden
    >
      {text}
    </span>
  );
}

const DepartmentBubbleRail = ({
  organizations = [],
  /** Đơn gia nhập đang chờ duyệt (bubble riêng, không mở workspace). */
  pendingJoinApplications = [],
  /** Map organizationId → số đơn cần duyệt (badge trên avatar tổ chức). */
  joinReviewCountByOrgId = {},
  /** Tổng thông báo trên Trang chủ tổ chức (lời mời + đơn duyệt) — badge nút Home. */
  homeNotificationBadgeCount = 0,
  selectedOrganizationId,
  viewMode = 'home',
  onSelectOrganization,
  onOpenWorkspace,
  onOpenHome,
  onEditOrganization,
  onInviteOrganization,
  onLeaveOrganization,
  onCreateOrganization,
  /** Sau lần tải danh sách tổ chức đầu tiên (để không hiện nhầm “chưa tham gia” trước khi API trả). */
  organizationsLoaded = false,
}) => {
  const { t } = useAppStrings();
  const { isDarkMode } = useTheme();
  const ownedOrganizations = [...organizations]
    .filter((o) => String(o.myRole || '').toLowerCase() === 'owner')
    .reverse();
  const joinedOrganizations = [...organizations]
    .filter((o) => String(o.myRole || '').toLowerCase() !== 'owner')
    .reverse();

  const [tooltip, setTooltip] = useState({
    show: false,
    variant: 'member',
    name: '',
    onlineCount: 0,
    x: 0,
    y: 0,
  });
  const [dropdown, setDropdown] = useState({
    show: false,
    orgId: null,
    x: 0,
    y: 0,
  });

  const handleEnter = (event, organization) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      show: true,
      variant: 'member',
      name: organization.name || t('organizations.railOrgFallback'),
      onlineCount: organization.onlineMembers || organization.onlineCount || 0,
      x: rect.left - 14,
      y: rect.top + rect.height / 2,
    });
  };

  const handleEnterPending = (event, row) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({
      show: true,
      variant: 'pending',
      name: row.organizationName || t('organizations.railOrgFallback'),
      onlineCount: 0,
      x: rect.left - 14,
      y: rect.top + rect.height / 2,
    });
  };

  const handleLeave = () => {
    setTooltip((prev) => ({ ...prev, show: false }));
  };

  const handleAvatarClick = (_event, organization) => {
    onSelectOrganization?.(organization._id);
    onOpenWorkspace?.(organization._id);
  };

  const handleAvatarContextMenu = (event, organization) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setDropdown({
      show: true,
      orgId: organization._id,
      x: rect.left - 12,
      y: rect.bottom + 8,
    });
  };

  const renderOrgAvatarButton = (organization) => {
    const isActive = organization._id === selectedOrganizationId;
    const oid = String(organization._id);
    const reviewCount = Number(joinReviewCountByOrgId[oid]) || 0;
    return (
      <button
        key={organization._id}
        type="button"
        title={organization.name}
        onMouseEnter={(event) => handleEnter(event, organization)}
        onMouseLeave={handleLeave}
        onClick={(event) => handleAvatarClick(event, organization)}
        onContextMenu={(event) => handleAvatarContextMenu(event, organization)}
        className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
          isActive && viewMode === 'workspace'
            ? 'border-cyan-400/80 bg-cyan-500/20 shadow-[0_0_16px_rgba(34,211,238,0.28)]'
            : isDarkMode
              ? 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10'
              : 'border-slate-200 bg-white text-slate-800 shadow-sm hover:border-cyan-300 hover:bg-slate-50'
        }`}
      >
        {organization.logo ? (
          <img src={organization.logo} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <span
            className={`text-sm font-bold uppercase ${isDarkMode ? 'text-white' : 'text-slate-800'}`}
          >
            {(organization.name || 'O').charAt(0)}
          </span>
        )}
        <CornerBadge count={reviewCount} isDarkMode={isDarkMode} />
      </button>
    );
  };

  /** Không dùng class `text-white` trên portal khi html.light: index.css ép .text-white → màu chữ tối (khó đọc trên nền xám đậm). */
  const tooltipPortal =
    tooltip.show &&
    createPortal(
      <div
        className={
          isDarkMode
            ? 'fixed z-[9999] rounded-lg border border-white/10 bg-gray-700 px-3 py-2 text-sm text-white shadow-xl pointer-events-none'
            : 'fixed z-[9999] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-lg pointer-events-none'
        }
        style={{
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-100%, -50%)',
        }}
      >
        <div className="font-semibold">{tooltip.name}</div>
        {tooltip.variant === 'pending' ? (
          <div
            className={`mt-0.5 text-xs ${isDarkMode ? 'text-amber-200' : 'text-amber-700'}`}
          >
            Đang chờ xét duyệt
          </div>
        ) : (
          <div className={`mt-0.5 text-xs ${isDarkMode ? 'text-cyan-200' : 'text-cyan-600'}`}>
            Online: {tooltip.onlineCount}
          </div>
        )}
        <span
          className={
            isDarkMode
              ? 'absolute left-full top-1/2 h-0 w-0 -translate-y-1/2 border-[6px] border-solid border-transparent border-l-gray-700'
              : 'absolute left-full top-1/2 h-0 w-0 -translate-y-1/2 border-[6px] border-solid border-transparent border-l-white'
          }
          aria-hidden
        />
      </div>,
      document.body
    );

  const dropdownOrg =
    dropdown.show && dropdown.orgId
      ? organizations.find((o) => String(o._id) === String(dropdown.orgId))
      : null;
  const isOrgOwner = String(dropdownOrg?.myRole || '').toLowerCase() === 'owner';

  const dropdownPortal =
    dropdown.show &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[9997]"
          onClick={() => setDropdown((prev) => ({ ...prev, show: false }))}
        />
        <div
          className={
            isDarkMode
              ? 'fixed z-[9998] w-48 rounded-xl border border-white/10 bg-gray-900/95 p-2 shadow-2xl'
              : 'fixed z-[9998] w-48 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl'
          }
          style={{
            left: dropdown.x,
            top: dropdown.y,
            transform: 'translateX(-100%)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              onEditOrganization?.(dropdown.orgId);
              setDropdown((prev) => ({ ...prev, show: false }));
            }}
            className={
              isDarkMode
                ? 'w-full rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10'
                : 'w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-100'
            }
          >
            {t('organizations.railMenuSettings')}
          </button>
          <button
            type="button"
            onClick={() => {
              onInviteOrganization?.(dropdown.orgId);
              setDropdown((prev) => ({ ...prev, show: false }));
            }}
            className={
              isDarkMode
                ? 'w-full rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10'
                : 'w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 transition hover:bg-slate-100'
            }
          >
            {t('organizations.railMenuInvite')}
          </button>
          {!isOrgOwner && (
            <button
              type="button"
              onClick={() => {
                const id = dropdown.orgId;
                setDropdown((prev) => ({ ...prev, show: false }));
                onLeaveOrganization?.(id);
              }}
              className={
                isDarkMode
                  ? 'w-full rounded-lg px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/15'
                  : 'w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50'
              }
            >
              {t('organizations.railMenuLeave')}
            </button>
          )}
        </div>
      </>,
      document.body
    );

  return (
    <div
      className={`h-full w-full px-2 py-4 ${isDarkMode ? 'bg-black/10' : 'bg-sky-100/40'}`}
    >
      <div
        className={`mb-4 text-center text-[11px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
      >
        {t('organizations.railHeading')}
      </div>

      <div className="scrollbar-overlay flex h-[calc(100%-1.75rem)] flex-col items-center gap-3 overflow-y-auto">
        <button
          type="button"
          onClick={onOpenHome}
          title={t('organizations.railTitleHome')}
          className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
            viewMode === 'home'
              ? 'border-cyan-400/80 bg-cyan-500/20 text-slate-900 shadow-[0_0_16px_rgba(34,211,238,0.28)] dark:text-white'
              : isDarkMode
                ? 'border-white/20 bg-white/5 text-white hover:border-white/35 hover:bg-white/10'
                : 'border-slate-300 bg-white text-slate-800 shadow-sm hover:border-cyan-400/50 hover:bg-slate-50'
          }`}
        >
          <span className="text-lg leading-none">⌂</span>
          <CornerBadge count={homeNotificationBadgeCount} isDarkMode={isDarkMode} />
        </button>

        <button
          type="button"
          onClick={onCreateOrganization}
          title={t('organizations.railTitleCreate')}
          className={
            isDarkMode
              ? 'group relative flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition hover:border-white/35 hover:bg-white/10'
              : 'group relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-800 shadow-sm transition hover:border-cyan-400/40 hover:bg-slate-50'
          }
        >
          <span className="text-2xl leading-none">+</span>
        </button>

        {organizationsLoaded &&
          organizations.length === 0 &&
          pendingJoinApplications.length === 0 && (
            <div
              className={`px-1 text-center text-[11px] leading-snug ${isDarkMode ? 'text-gray-500' : 'text-slate-600'}`}
            >
              {t('organizations.railEmptyNoOrgs')}
            </div>
          )}

        {pendingJoinApplications.map((row) => (
          <button
            key={row.applicationId}
            type="button"
            title={t('organizations.railPendingTitle', {
              name: row.organizationName || t('organizations.railOrgFallback'),
            })}
            onMouseEnter={(event) => handleEnterPending(event, row)}
            onMouseLeave={handleLeave}
            onClick={(e) => {
              e.preventDefault();
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-400/45 bg-amber-500/10 text-white transition hover:border-amber-300/60 hover:bg-amber-500/18"
          >
            {row.logo ? (
              <img
                src={row.logo}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold uppercase">
                {(row.organizationName || 'O').charAt(0)}
              </span>
            )}
            <CornerBadge count={1} isDarkMode={isDarkMode} />
          </button>
        ))}

        {ownedOrganizations.length > 0 && (
          <>
            <div
              className={`w-full px-0.5 text-center text-[9px] font-semibold uppercase leading-tight ${isDarkMode ? 'text-gray-500' : 'text-slate-600'}`}
              title={t('organizations.railTooltipYours')}
            >
              {t('organizations.railYours')}
            </div>
            {ownedOrganizations.map(renderOrgAvatarButton)}
          </>
        )}

        {joinedOrganizations.length > 0 && (
          <>
            <div
              className={`w-full px-0.5 text-center text-[9px] font-semibold uppercase leading-tight ${isDarkMode ? 'text-gray-500' : 'text-slate-600'}`}
              title={t('organizations.railTooltipJoined')}
            >
              {t('organizations.railJoined')}
            </div>
            {joinedOrganizations.map(renderOrgAvatarButton)}
          </>
        )}
      </div>
      {tooltipPortal}
      {dropdownPortal}
    </div>
  );
};

export default DepartmentBubbleRail;
