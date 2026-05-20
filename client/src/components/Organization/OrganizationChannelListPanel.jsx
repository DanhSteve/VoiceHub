import { useMemo } from 'react';
import { Hash, Lock, Settings, Volume2 } from 'lucide-react';
import { channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import {
  channelsForDepartment,
  channelsForDivision,
  channelsForTeam,
  splitChatVoiceChannels,
} from '../../utils/orgChannelScope';
import { channelUnreadCount, voicePresenceLabel } from './organizationStructureTheme';
import { ent } from '../../theme/enterpriseWorkspace';

function scopeSettingsBtnClass(isDarkMode) {
  return `absolute right-1 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${
    isDarkMode
      ? 'bg-[#1D2330] text-[#A1A8B3] hover:bg-[#252b3a] hover:text-[#F3F4F6]'
      : 'bg-white text-slate-500 shadow-sm hover:bg-slate-100'
  }`;
}

/**
 * Kênh chat/voice — tách khỏi cây tổ chức (enterprise IA).
 */
export default function OrganizationChannelListPanel({
  isDarkMode,
  locale,
  t,
  channels = [],
  channelPermissionMatrix = {},
  selectedChannelId,
  selectedTeamId,
  selectedDepartmentId,
  selectedDivisionId,
  onSelectChannel,
  onCreateChannel,
  onOpenChannelSettings,
  canManageChannelRoleAccess = false,
}) {
  const getChannelPerm = (channelId) => {
    const row = channelPermissionMatrix?.[String(channelId)] || null;
    return {
      canSee: Boolean(row?.canSee ?? row?.canRead),
      canRead: Boolean(row?.canRead),
    };
  };

  const scopeChannels = useMemo(() => {
    let raw = [];
    if (selectedTeamId) {
      raw = channelsForTeam(channels, selectedTeamId);
    } else if (selectedDepartmentId) {
      raw = channelsForDepartment(channels, selectedDepartmentId).filter((ch) => !ch.team);
    } else if (selectedDivisionId) {
      raw = channelsForDivision(channels, selectedDivisionId);
    }
    return raw.filter((ch) => {
      const p = getChannelPerm(ch._id);
      return p.canSee || p.canRead;
    });
  }, [channels, selectedTeamId, selectedDepartmentId, selectedDivisionId, channelPermissionMatrix]);

  const { chat, voice } = useMemo(
    () => splitChatVoiceChannels(scopeChannels),
    [scopeChannels]
  );

  const textMuted = isDarkMode ? ent.text.muted : 'text-slate-500';
  const sectionLabel = isDarkMode ? ent.text.secondary : 'text-slate-600';

  const renderSettings = (channel) => {
    if (!canManageChannelRoleAccess || !onOpenChannelSettings) return null;
    return (
      <button
        type="button"
        title={t('orgPanel.channelSettings')}
        aria-label={t('orgPanel.channelSettings')}
        onClick={(e) => {
          e.stopPropagation();
          onOpenChannelSettings(channel);
        }}
        className={scopeSettingsBtnClass(isDarkMode)}
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    );
  };

  const renderRow = (channel, { voice: isVoice }) => {
    const active = String(selectedChannelId) === String(channel._id);
    const unread = channelUnreadCount(channel);
    const perm = getChannelPerm(channel._id);
    const canEnter = perm.canSee || perm.canRead;
    const slug = channelNameToDisplaySlug(channel.name, locale);
    const presence = isVoice ? voicePresenceLabel(channel) : '';

    if (!canEnter) {
      return (
        <div
          key={channel._id}
          className={`group relative flex items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-sm ${textMuted}`}
        >
          {isVoice ? <Volume2 className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
          <span className="truncate">{slug}</span>
          <Lock className="ml-auto h-3 w-3 shrink-0" aria-hidden />
          {renderSettings(channel)}
        </div>
      );
    }

    return (
      <div key={channel._id} className="group relative">
        <button
          type="button"
          onClick={() => onSelectChannel?.(channel._id)}
          className={`relative flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-left text-sm transition ${
            active
              ? isDarkMode
                ? 'border-l-2 border-[#4F6BED] bg-[#4F6BED]/10 font-medium text-[#F3F4F6]'
                : 'border-l-2 border-indigo-500 bg-indigo-50 font-medium text-slate-900'
              : unread > 0
                ? isDarkMode
                  ? 'font-medium text-[#F3F4F6] hover:bg-[#1D2330]'
                  : 'font-medium text-slate-900 hover:bg-slate-50'
                : isDarkMode
                  ? `${ent.text.secondary} hover:bg-[#1D2330]`
                  : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          {isVoice ? (
            <Volume2 className={`h-3.5 w-3.5 shrink-0 ${active ? ent.accent.text : ''}`} />
          ) : (
            <Hash className={`h-3.5 w-3.5 shrink-0 ${active ? ent.accent.text : 'opacity-70'}`} />
          )}
          <span className="truncate font-normal">{slug}</span>
          {unread > 0 ? (
            <span
              className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                isDarkMode ? 'bg-[#4F6BED] text-white' : 'bg-indigo-600 text-white'
              }`}
            >
              {unread > 99 ? '99+' : unread}
            </span>
          ) : presence ? (
            <span className={`ml-auto text-[10px] tabular-nums ${ent.status.success}`}>{presence}</span>
          ) : null}
        </button>
        {renderSettings(channel)}
      </div>
    );
  };

  const hasScope =
    selectedTeamId || selectedDepartmentId || selectedDivisionId;

  return (
    <div
      className={`shrink-0 rounded-b-xl border-t px-2 pt-2 ${
        isDarkMode ? 'border-white/[0.06] bg-transparent' : 'border-slate-200/80 bg-transparent'
      }`}
    >
      <div
        className={`mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider ${sectionLabel}`}
      >
        <span>{t('orgPanel.channelsSection')}</span>
        {canManageChannelRoleAccess && selectedTeamId ? (
          <button
            type="button"
            onClick={() => onCreateChannel?.()}
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal ${
              isDarkMode ? 'text-[#8BA3F5] hover:bg-[#4F6BED]/10' : 'text-indigo-600 hover:bg-indigo-50'
            }`}
          >
            {t('orgPanel.addShort')}
          </button>
        ) : null}
      </div>

      {!hasScope ? (
        <p className={`px-1 pb-2 text-xs ${textMuted}`}>{t('orgPanel.channelsPickScope')}</p>
      ) : null}

      {hasScope && chat.length === 0 && voice.length === 0 ? (
        <p className={`px-1 pb-2 text-xs ${textMuted}`}>{t('orgPanel.channelsEmpty')}</p>
      ) : null}

      <div className="scrollbar-overlay max-h-[min(40vh,320px)] space-y-0.5 overflow-y-auto pb-3">
        {chat.map((ch) => renderRow(ch, { voice: false }))}
        {voice.map((ch) => renderRow(ch, { voice: true }))}
      </div>
    </div>
  );
}
