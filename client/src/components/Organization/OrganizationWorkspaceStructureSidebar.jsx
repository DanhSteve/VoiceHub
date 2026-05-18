import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Hash,
  Lock,
  Plus,
  Search,
  Settings,
  Users,
  Volume2,
} from 'lucide-react';
import { displayDepartmentName, channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';
import {
  channelUnreadCount,
  departmentSquareClass,
  divisionAccent,
  voicePresenceLabel,
} from './organizationStructureTheme';
import {
  channelsForDepartment,
  channelsForDivision,
  channelsForTeam,
  splitChatVoiceChannels,
} from '../../utils/orgChannelScope';

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function teamsForDepartment(teams, departmentId, divisionDepartments) {
  const fromProp = teams.filter((t) => String(t.department || '') === String(departmentId));
  if (fromProp.length) return fromProp;
  const dept = (divisionDepartments || []).find((d) => String(d._id) === String(departmentId));
  return Array.isArray(dept?.teams) ? dept.teams : [];
}

/**
 * Sidebar cấu trúc workspace — Progressive Disclosure (Division → Dept → Team → Channel).
 */
export default function OrganizationWorkspaceStructureSidebar({
  isDarkMode,
  locale,
  t,
  branches = [],
  selectedBranchId,
  onSelectBranch,
  selectedDivisionId,
  onSelectDivision,
  selectedDepartment,
  selectedTeamId,
  selectedChannelId,
  teams = [],
  channels = [],
  channelPermissionMatrix = {},
  membershipScope = null,
  loadingDepartments = false,
  onSelectDepartment,
  onSelectTeam,
  onSelectChannel,
  onCreateChannel,
  onOpenChannelSettings,
  canManageWorkspaceStructure = false,
  canSeeAllStructure = false,
}) {
  const [expandedDivisionId, setExpandedDivisionId] = useState(selectedDivisionId || '');
  const [expandedDeptIds, setExpandedDeptIds] = useState(() => new Set());
  const [expandedTeamIds, setExpandedTeamIds] = useState(() => new Set());
  const [structureQuery, setStructureQuery] = useState('');
  const [hoveredTeamId, setHoveredTeamId] = useState('');

  const selectedBranch = branches.find((b) => String(b._id) === String(selectedBranchId)) || null;
  const divisionList = Array.isArray(selectedBranch?.divisions) ? selectedBranch.divisions : [];

  const getChannelPerm = useCallback(
    (channelId) => {
      const row = channelPermissionMatrix?.[String(channelId)] || null;
      const canSee = Boolean(row?.canSee ?? row?.canRead);
      const canRead = Boolean(row?.canRead);
      return {
        canSee,
        canRead,
        canWrite: Boolean(row?.canWrite),
        canDelete: Boolean(row?.canDelete),
        canVoice: Boolean(row?.canVoice),
      };
    },
    [channelPermissionMatrix]
  );

  const canTeamReadAnyChannel = useCallback(
    (teamId) =>
      channels.some(
        (ch) =>
          String(ch.team || '') === String(teamId) &&
          (getChannelPerm(ch._id).canSee || getChannelPerm(ch._id).canRead)
      ),
    [channels, getChannelPerm]
  );

  const canReadScopeChannels = useCallback(
    (list) => list.some((ch) => getChannelPerm(ch._id).canSee || getChannelPerm(ch._id).canRead),
    [getChannelPerm]
  );

  const canAccessDepartment = useCallback(
    (departmentId, divisionDepartments) => {
      if (canSeeAllStructure) return true;
      if (
        membershipScope?.departmentId &&
        String(departmentId) === String(membershipScope.departmentId)
      ) {
        return true;
      }
      const deptScope = channelsForDepartment(channels, departmentId);
      if (canReadScopeChannels(deptScope)) return true;
      const deptTeams = teamsForDepartment(teams, departmentId, divisionDepartments);
      if (!deptTeams.length) return true;
      return deptTeams.some(
        (team) =>
          String(membershipScope?.teamId || '') === String(team._id) ||
          canTeamReadAnyChannel(team._id)
      );
    },
    [
      canSeeAllStructure,
      membershipScope?.departmentId,
      membershipScope?.teamId,
      teams,
      channels,
      canTeamReadAnyChannel,
      canReadScopeChannels,
    ]
  );

  useEffect(() => {
    if (selectedDivisionId) setExpandedDivisionId(String(selectedDivisionId));
  }, [selectedDivisionId]);

  useEffect(() => {
    if (!selectedDepartment?._id) return;
    setExpandedDeptIds((prev) => new Set(prev).add(String(selectedDepartment._id)));
  }, [selectedDepartment?._id]);

  useEffect(() => {
    if (!selectedTeamId) return;
    setExpandedTeamIds((prev) => new Set(prev).add(String(selectedTeamId)));
  }, [selectedTeamId]);

  const q = normalize(structureQuery.trim());

  const matchesQuery = (...labels) => {
    if (!q) return true;
    return labels.some((lb) => normalize(lb).includes(q));
  };

  const sumUnreadForChannels = (list) =>
    list.reduce(
      (sum, ch) =>
        getChannelPerm(ch._id).canSee || getChannelPerm(ch._id).canRead
          ? sum + channelUnreadCount(ch)
          : sum,
      0
    );

  const toggleDivision = (divisionId) => {
    const id = String(divisionId);
    setExpandedDivisionId((prev) => {
      const next = prev === id ? '' : id;
      return next;
    });
    onSelectDivision?.(divisionId);
  };

  const toggleDepartment = (departmentId, { notifyParent = true } = {}) => {
    const id = String(departmentId);
    setExpandedDeptIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (notifyParent) onSelectDepartment?.(departmentId);
  };

  const toggleTeam = (teamId) => {
    const id = String(teamId);
    setExpandedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    onSelectTeam?.(teamId);
  };

  const filteredTree = useMemo(() => {
    return divisionList
      .map((division, divIdx) => {
        const divisionScopeRaw = channelsForDivision(channels, division._id);
        const divisionReadable = divisionScopeRaw.filter(
          (ch) => getChannelPerm(ch._id).canSee || getChannelPerm(ch._id).canRead
        );
        const { chat: divisionChat, voice: divisionVoice } = splitChatVoiceChannels(divisionReadable);
        const divisionScopeUnread = sumUnreadForChannels(divisionReadable);

        const deptList = Array.isArray(division?.departments) ? division.departments : [];
        const departmentsMapped = deptList
          .map((department) => {
            if (
              !canSeeAllStructure &&
              membershipScope?.departmentId &&
              String(department._id) !== String(membershipScope.departmentId)
            ) {
              return null;
            }
            const deptScopeRaw = channelsForDepartment(channels, department._id);
            const deptReadable = deptScopeRaw.filter(
              (ch) => getChannelPerm(ch._id).canSee || getChannelPerm(ch._id).canRead
            );
            const { chat: deptChat, voice: deptVoice } = splitChatVoiceChannels(deptReadable);
            const deptScopeUnread = sumUnreadForChannels(deptReadable);

            const deptTeams = teamsForDepartment(teams, department._id, deptList);
            const teamsMapped = deptTeams
              .map((team) => {
                const isPrimaryTeam =
                  String(membershipScope?.teamId || '') === String(team._id);
                const canReadTeam = isPrimaryTeam || canTeamReadAnyChannel(team._id);
                if (!canSeeAllStructure && !canReadTeam) return null;

                const teamChannels = channelsForTeam(channels, team._id);
                const readableChannels = teamChannels.filter(
                  (ch) => getChannelPerm(ch._id).canSee || getChannelPerm(ch._id).canRead
                );
                const { chat, voice } = splitChatVoiceChannels(readableChannels);
                const teamUnread = sumUnreadForChannels(readableChannels);
                const channelMatch = [...chat, ...voice].some((ch) =>
                  matchesQuery(ch.name, channelNameToDisplaySlug(ch.name, locale))
                );
                const teamMatch = matchesQuery(team.name) || channelMatch || !q;
                if (!teamMatch && q) return null;
                return { team, chat, voice, teamUnread, canReadTeam };
              })
              .filter(Boolean);
            const deptUnread = deptScopeUnread + teamsMapped.reduce((s, row) => s + row.teamUnread, 0);
            const deptChannelMatch = [...deptChat, ...deptVoice].some((ch) =>
              matchesQuery(ch.name, channelNameToDisplaySlug(ch.name, locale))
            );
            const deptMatch =
              matchesQuery(department.name, displayDepartmentName(department.name, locale)) ||
              deptChannelMatch ||
              teamsMapped.length > 0 ||
              !q;
            if (!deptMatch && q) return null;
            return {
              department,
              teams: teamsMapped,
              deptUnread,
              deptChat,
              deptVoice,
              deptScopeUnread,
            };
          })
          .filter(Boolean);
        const divisionUnread =
          divisionScopeUnread + departmentsMapped.reduce((s, d) => s + d.deptUnread, 0);
        const divisionChannelMatch = [...divisionChat, ...divisionVoice].some((ch) =>
          matchesQuery(ch.name, channelNameToDisplaySlug(ch.name, locale))
        );
        const divisionMatch =
          matchesQuery(division.name) ||
          divisionChannelMatch ||
          departmentsMapped.length > 0 ||
          !q;
        if (!divisionMatch && q) return null;
        return {
          division,
          divIdx,
          departments: departmentsMapped,
          divisionUnread,
          divisionChat,
          divisionVoice,
        };
      })
      .filter(Boolean);
  }, [
    divisionList,
    teams,
    channels,
    q,
    locale,
    structureQuery,
    getChannelPerm,
    canSeeAllStructure,
    membershipScope?.departmentId,
    membershipScope?.teamId,
    canTeamReadAnyChannel,
  ]);

  useEffect(() => {
    if (!q || filteredTree.length === 0) return;
    const first = filteredTree[0];
    setExpandedDivisionId(String(first.division._id));
    const deptIds = new Set();
    const teamIds = new Set();
    for (const row of first.departments || []) {
      deptIds.add(String(row.department._id));
      for (const tr of row.teams || []) {
        teamIds.add(String(tr.team._id));
      }
    }
    setExpandedDeptIds(deptIds);
    setExpandedTeamIds(teamIds);
  }, [q, filteredTree]);

  const textMuted = isDarkMode ? 'text-[#7d8392]' : 'text-slate-500';
  const textLabel = isDarkMode ? 'text-[#b4b8c4]' : 'text-slate-600';
  const textBright = isDarkMode ? 'text-white' : 'text-slate-900';

  const renderChannelSettingsBtn = (channel) => {
    if (!canManageWorkspaceStructure || !onOpenChannelSettings) return null;
    return (
      <button
        type="button"
        title="Cài đặt kênh"
        aria-label="Cài đặt kênh"
        onClick={(e) => {
          e.stopPropagation();
          onOpenChannelSettings(channel);
        }}
        className={`absolute right-1 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md group-hover/channel:flex ${
          isDarkMode
            ? 'bg-[#2b2d31] text-[#b5bac1] hover:bg-[#3f4147] hover:text-white'
            : 'bg-white text-slate-500 shadow-sm hover:bg-slate-100 hover:text-slate-800'
        }`}
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
    );
  };

  const renderChannelList = (chat, voice, { boxed = false } = {}) => {
    if (!chat.length && !voice.length) return null;
    const shell = boxed
      ? `mb-2 space-y-0.5 rounded-md border px-1.5 py-1 ${
          isDarkMode ? 'border-white/[0.08] bg-[#12151c]/80' : 'border-slate-200 bg-slate-50/90'
        }`
      : 'space-y-0.5';

    return (
      <div className={shell}>
        {chat.map((channel) => {
          const active = String(selectedChannelId) === String(channel._id);
          const unread = channelUnreadCount(channel);
          const perm = getChannelPerm(channel._id);
          const canEnter = perm.canSee || perm.canRead;
          if (!canEnter) {
            return (
              <div
                key={channel._id}
                className={`group/channel relative flex items-center gap-2 rounded-md px-2 py-1 pr-8 text-xs ${
                  isDarkMode ? 'text-[#5f6572]' : 'text-slate-400'
                }`}
              >
                <Hash className="h-3 w-3" />
                <span className="truncate">{channelNameToDisplaySlug(channel.name, locale)}</span>
                <Lock className={`ml-auto h-3 w-3 shrink-0 ${textMuted}`} aria-hidden />
                {renderChannelSettingsBtn(channel)}
              </div>
            );
          }
          return (
            <div key={channel._id} className="group/channel relative">
            <button
              type="button"
              onClick={() => onSelectChannel?.(channel._id)}
              className={`relative flex w-full items-center gap-2 rounded-md py-1 pl-2 pr-8 text-left text-xs transition ${
                active
                  ? isDarkMode
                    ? 'border-l-2 border-indigo-400 bg-indigo-500/15 font-semibold text-white'
                    : 'border-l-2 border-indigo-500 bg-indigo-50 font-semibold text-slate-900'
                  : unread > 0
                    ? isDarkMode
                      ? 'font-semibold text-white hover:bg-white/[0.04]'
                      : 'font-semibold text-slate-900 hover:bg-slate-100'
                    : isDarkMode
                      ? 'text-[#9aa0ae] hover:bg-white/[0.04]'
                      : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Hash className={`h-3 w-3 shrink-0 ${active ? 'text-indigo-400' : ''}`} />
              <span className="truncate">{channelNameToDisplaySlug(channel.name, locale)}</span>
              {unread > 0 ? (
                <span className="ml-auto rounded bg-indigo-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </button>
            {renderChannelSettingsBtn(channel)}
            </div>
          );
        })}
        {voice.map((channel) => {
          const active = String(selectedChannelId) === String(channel._id);
          const perm = getChannelPerm(channel._id);
          const canEnter = perm.canSee || perm.canRead;
          const presence = voicePresenceLabel(channel);
          const hasVoice = presence && presence !== '0';
          if (!canEnter) {
            return (
              <div
                key={channel._id}
                className={`group/channel relative flex items-center gap-2 rounded-md px-2 py-1 pr-8 text-xs ${
                  isDarkMode ? 'text-[#5f6572]' : 'text-slate-400'
                }`}
              >
                <Volume2 className="h-3 w-3" />
                <span className="truncate">{channelNameToDisplaySlug(channel.name, locale)}</span>
                <Lock className={`ml-auto h-3 w-3 shrink-0 ${textMuted}`} aria-hidden />
                {renderChannelSettingsBtn(channel)}
              </div>
            );
          }
          return (
            <div key={channel._id} className="group/channel relative">
            <button
              type="button"
              onClick={() => onSelectChannel?.(channel._id)}
              className={`relative flex w-full items-center gap-2 rounded-md py-1 pl-2 pr-8 text-left text-xs transition ${
                active
                  ? isDarkMode
                    ? 'border-l-2 border-indigo-400 bg-indigo-500/15 font-semibold text-white'
                    : 'border-l-2 border-indigo-500 bg-indigo-50 font-semibold text-slate-900'
                  : isDarkMode
                    ? 'text-[#9aa0ae] hover:bg-white/[0.04]'
                    : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Volume2
                className={`h-3.5 w-3.5 shrink-0 ${hasVoice ? 'text-emerald-400' : 'opacity-60'}`}
              />
              <span className="truncate">{channelNameToDisplaySlug(channel.name, locale)}</span>
              {presence ? (
                <span
                  className={`ml-auto text-[10px] font-medium tabular-nums ${
                    hasVoice ? 'text-emerald-400' : textMuted
                  }`}
                >
                  {presence}
                </span>
              ) : null}
            </button>
            {renderChannelSettingsBtn(channel)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>
        <span>{t('orgPanel.branchHeading')}</span>
        {canManageWorkspaceStructure ? (
          <span className={isDarkMode ? 'text-[#8b91a0]' : 'text-slate-400'}>{t('orgPanel.addShort')}</span>
        ) : null}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {branches.map((branch) => {
          const active = String(selectedBranchId) === String(branch._id);
          const divCount = Array.isArray(branch?.divisions) ? branch.divisions.length : 0;
          return (
            <button
              key={branch._id}
              type="button"
              onClick={() => onSelectBranch?.(branch._id)}
              className={`rounded-lg border px-1.5 py-1.5 text-left transition ${
                active
                  ? isDarkMode
                    ? 'border-violet-500/50 bg-violet-500/15 text-white shadow-[0_0_0_1px_rgba(139,92,246,0.25)]'
                    : 'border-violet-300 bg-violet-50 text-slate-900'
                  : isDarkMode
                    ? 'border-white/10 bg-white/[0.03] text-[#b4b8c4] hover:bg-white/[0.05]'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="truncate text-[11px] font-bold">{branch.name}</div>
              <div className={`text-[10px] tabular-nums ${textMuted}`}>{divCount} {t('orgPanel.divisionUnit')}</div>
            </button>
          );
        })}
      </div>

      <div className="relative mb-3">
        <Search
          className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${textMuted}`}
        />
        <input
          type="search"
          value={structureQuery}
          onChange={(e) => setStructureQuery(e.target.value)}
          placeholder={t('orgPanel.structureSearchPh')}
          className={`w-full rounded-lg border py-2 pl-8 pr-2 text-xs outline-none transition ${
            isDarkMode
              ? 'border-white/10 bg-white/[0.04] text-white placeholder:text-[#5f6572] focus:border-violet-500/40'
              : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-violet-400'
          }`}
        />
      </div>

      <div className={`mb-2 text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>
        {t('orgPanel.structureHeading')}
      </div>

      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto pr-0.5">
        {loadingDepartments ? (
          <div className={`mb-2 h-10 animate-pulse rounded-lg ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
        ) : null}

        {!loadingDepartments && filteredTree.length === 0 ? (
          <p className={`px-1 py-2 text-xs ${textMuted}`}>{t('orgPanel.structureEmpty')}</p>
        ) : null}

        {filteredTree.map(
          ({ division, divIdx, departments: deptRows, divisionUnread, divisionChat, divisionVoice }) => {
          const accent = divisionAccent(divIdx);
          const isOpen = String(expandedDivisionId) === String(division._id);
          const divisionSelected = String(selectedDivisionId) === String(division._id);

          return (
            <div key={division._id} className="mb-2">
              <button
                type="button"
                onClick={() => toggleDivision(division._id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition ${
                  isOpen || divisionSelected
                    ? isDarkMode
                      ? `bg-white/[0.06] ${accent.glow} ${textBright}`
                      : 'bg-slate-100 shadow-[inset_3px_0_0_0_rgb(99,102,241)] text-slate-900'
                    : isDarkMode
                      ? `${textLabel} hover:bg-white/[0.04]`
                      : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`h-8 w-[3px] shrink-0 rounded-full ${isOpen ? accent.bar : isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide">
                  {division.name}
                </span>
                {!isOpen && divisionUnread > 0 ? (
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${accent.badge}`}>
                    {divisionUnread > 99 ? '99+' : divisionUnread}
                  </span>
                ) : (
                  <span className={`shrink-0 text-[10px] tabular-nums ${textMuted}`}>{deptRows.length}</span>
                )}
              </button>

              {isOpen ? (
                <div className="mt-1 space-y-1 pl-1">
                  {renderChannelList(divisionChat, divisionVoice, { boxed: true })}
                  {deptRows.map(({ department, teams: teamRows, deptUnread, deptChat, deptVoice }) => {
                    const deptOpen = expandedDeptIds.has(String(department._id));
                    const deptActive = String(selectedDepartment?._id) === String(department._id);
                    const deptLabel = displayDepartmentName(department.name, locale);
                    const divisionDepartments = Array.isArray(division?.departments)
                      ? division.departments
                      : [];
                    const canAccessDept = canAccessDepartment(department._id, divisionDepartments);

                    return (
                      <div key={department._id}>
                        <button
                          type="button"
                          onClick={() =>
                            toggleDepartment(department._id, { notifyParent: canAccessDept })
                          }
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                            deptActive
                              ? isDarkMode
                                ? 'bg-white/[0.07] text-white'
                                : 'bg-slate-100 text-slate-900'
                              : isDarkMode
                                ? 'text-[#a9afbc] hover:bg-white/[0.04]'
                                : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-sm ${departmentSquareClass(department._id || department.name)}`}
                          />
                          {deptOpen ? (
                            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />
                          )}
                          <span className="min-w-0 flex-1 truncate font-medium">{deptLabel}</span>
                          {deptUnread > 0 ? (
                            <span className="shrink-0 rounded-md bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                              {deptUnread > 99 ? '99+' : deptUnread}
                            </span>
                          ) : !canAccessDept ? (
                            <Lock className={`h-3 w-3 shrink-0 ${textMuted}`} aria-hidden />
                          ) : (
                            <span className={`shrink-0 text-[10px] tabular-nums ${textMuted}`}>
                              {teamRows.length}
                            </span>
                          )}
                        </button>

                        {deptOpen ? (
                          <div className="mt-1 space-y-2 pl-2">
                            {renderChannelList(deptChat, deptVoice, { boxed: true })}
                            {teamRows.map(({ team, chat, voice, teamUnread }, teamIdx) => {
                              const teamOpen = expandedTeamIds.has(String(team._id));
                              const teamActive = String(selectedTeamId) === String(team._id);
                              const isPrimaryTeam =
                                String(membershipScope?.teamId || '') === String(team._id);
                              const canReadTeam =
                                canSeeAllStructure ||
                                isPrimaryTeam ||
                                canTeamReadAnyChannel(team._id);
                              const showCreate =
                                teamOpen &&
                                canReadTeam &&
                                canManageWorkspaceStructure &&
                                String(hoveredTeamId) === String(team._id);

                              return (
                                <div
                                  key={team._id}
                                  className={`rounded-lg border ${
                                    isDarkMode ? 'border-white/[0.08] bg-[#12151c]' : 'border-slate-200 bg-slate-50/80'
                                  } ${teamIdx > 0 ? 'mt-0' : ''}`}
                                  onMouseEnter={() => setHoveredTeamId(String(team._id))}
                                  onMouseLeave={() => setHoveredTeamId('')}
                                >
                                  <button
                                    type="button"
                                    disabled={!canReadTeam}
                                    onClick={() => {
                                      if (!canReadTeam) return;
                                      toggleTeam(team._id);
                                    }}
                                    className={`flex w-full items-center gap-2 border-b px-2.5 py-2 text-left text-xs ${
                                      isDarkMode ? 'border-white/[0.06]' : 'border-slate-200/80'
                                    } ${
                                      !canReadTeam
                                        ? isDarkMode
                                          ? 'cursor-not-allowed text-[#5f6572]'
                                          : 'cursor-not-allowed text-slate-400'
                                        : teamActive
                                          ? isDarkMode
                                            ? 'text-white'
                                            : 'text-slate-900'
                                          : isDarkMode
                                            ? 'text-[#c4c8d4] hover:bg-white/[0.03]'
                                            : 'text-slate-700 hover:bg-white'
                                    }`}
                                  >
                                    <Users className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                    {teamOpen ? (
                                      <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                                    )}
                                    <span className="min-w-0 flex-1 truncate font-semibold">{team.name}</span>
                                    {teamUnread > 0 ? (
                                      <span className="rounded-md bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                                        {teamUnread}
                                      </span>
                                    ) : !canReadTeam ? (
                                      <Lock className={`h-3 w-3 shrink-0 ${textMuted}`} aria-hidden />
                                    ) : null}
                                  </button>

                                  {teamOpen && canReadTeam ? (
                                    <div className="space-y-0.5 px-1.5 py-1.5">
                                      {renderChannelList(chat, voice)}

                                      {showCreate ? (
                                        <button
                                          type="button"
                                          onClick={() => onCreateChannel?.()}
                                          className={`mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition ${
                                            isDarkMode
                                              ? 'text-[#6d7380] hover:bg-white/[0.04] hover:text-[#9aa0ae]'
                                              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
                                          }`}
                                        >
                                          <Plus className="h-3 w-3" />
                                          {t('orgPanel.createChannelGhost')}
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
