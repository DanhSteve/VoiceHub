import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Lock, Search, Settings, Users } from 'lucide-react';
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
import OrganizationChannelListPanel from './OrganizationChannelListPanel';

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Ưu tiên `department.teams` từ cây đã lọc theo RBAC; không ghi đè bằng list team phẳng của cả org. */
function teamsForDepartment(teams, departmentId, divisionDepartments) {
  const dept = (divisionDepartments || []).find((d) => String(d._id) === String(departmentId));
  const fromStructure = Array.isArray(dept?.teams) ? dept.teams : [];
  if (fromStructure.length) return fromStructure;
  return teams.filter((t) => String(t.department || '') === String(departmentId));
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
  onOpenDivisionSettings,
  onOpenDepartmentSettings,
  onOpenTeamSettings,
  canManageWorkspaceStructure = false,
  canManageChannelRoleAccess = false,
  canSeeAllStructure = false,
  canCreateTaskBoard = false,
  onCreateTaskBoard,
}) {
  const [expandedDivisionId, setExpandedDivisionId] = useState(selectedDivisionId || '');
  const [expandedDeptIds, setExpandedDeptIds] = useState(() => new Set());
  const [expandedTeamIds, setExpandedTeamIds] = useState(() => new Set());
  const [structureQuery, setStructureQuery] = useState('');
  const [teamMenu, setTeamMenu] = useState({
    open: false,
    x: 0,
    y: 0,
    team: null,
  });
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

  const scopedTeamIdSet = useMemo(
    () => new Set((membershipScope?.scopedTeamIds || []).map(String)),
    [membershipScope?.scopedTeamIds]
  );
  const scopedDeptIdSet = useMemo(
    () => new Set((membershipScope?.scopedDepartmentIds || []).map(String)),
    [membershipScope?.scopedDepartmentIds]
  );
  const scopedDivIdSet = useMemo(
    () => new Set((membershipScope?.scopedDivisionIds || []).map(String)),
    [membershipScope?.scopedDivisionIds]
  );

  const canAccessTeam = useCallback(
    (teamId) => {
      if (canSeeAllStructure) return true;
      const id = String(teamId);
      if (scopedTeamIdSet.has(id)) return true;
      return canTeamReadAnyChannel(id);
    },
    [canSeeAllStructure, canTeamReadAnyChannel, scopedTeamIdSet]
  );

  const canAccessDepartment = useCallback(
    (departmentId, divisionDepartments) => {
      if (canSeeAllStructure) return true;
      const id = String(departmentId);
      if (scopedDeptIdSet.has(id)) return true;
      const deptTeams = teamsForDepartment(teams, departmentId, divisionDepartments);
      if (deptTeams.some((team) => canAccessTeam(team._id))) return true;
      const deptScope = channelsForDepartment(channels, departmentId).filter((ch) => !ch.team);
      return canReadScopeChannels(deptScope);
    },
    [canSeeAllStructure, scopedDeptIdSet, teams, channels, canAccessTeam, canReadScopeChannels]
  );

  const departmentVisibleInTree = useCallback(
    (departmentId, divisionId, deptTeams) => {
      if (canSeeAllStructure) return true;
      if (scopedDeptIdSet.has(String(departmentId))) return true;
      if (scopedDivIdSet.has(String(divisionId))) return true;
      if ((deptTeams || []).some((team) => canAccessTeam(team._id))) return true;
      const deptScope = channelsForDepartment(channels, departmentId).filter((ch) => !ch.team);
      return canReadScopeChannels(deptScope);
    },
    [
      canSeeAllStructure,
      scopedDeptIdSet,
      scopedDivIdSet,
      canAccessTeam,
      channels,
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

  useEffect(() => {
    if (!teamMenu.open) return undefined;
    const close = () => setTeamMenu((prev) => ({ ...prev, open: false }));
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [teamMenu.open]);

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
            const deptTeams = teamsForDepartment(teams, department._id, deptList);
            if (!departmentVisibleInTree(department._id, division._id, deptTeams)) {
              return null;
            }
            const deptScopeRaw = channelsForDepartment(channels, department._id);
            const deptReadable = deptScopeRaw.filter(
              (ch) => getChannelPerm(ch._id).canSee || getChannelPerm(ch._id).canRead
            );
            const { chat: deptChat, voice: deptVoice } = splitChatVoiceChannels(deptReadable);
            const deptScopeUnread = sumUnreadForChannels(deptReadable);

            const teamsMapped = deptTeams
              .map((team) => {
                const canReadTeam = canAccessTeam(team._id);
                const teamChannels = channelsForTeam(channels, team._id);
                const visibleChannels = canReadTeam
                  ? teamChannels.filter(
                      (ch) => getChannelPerm(ch._id).canSee || getChannelPerm(ch._id).canRead
                    )
                  : [];
                const { chat, voice } = splitChatVoiceChannels(visibleChannels);
                const teamUnread = sumUnreadForChannels(
                  visibleChannels.filter((ch) => getChannelPerm(ch._id).canRead)
                );
                const channelMatch = [...chat, ...voice].some((ch) =>
                  matchesQuery(ch.name, channelNameToDisplaySlug(ch.name, locale))
                );
                const teamMatch = matchesQuery(team.name) || channelMatch || !q;
                if (!canReadTeam) return null;
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
    canAccessTeam,
    departmentVisibleInTree,
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

  const textMuted = isDarkMode ? 'text-[#6B7280]' : 'text-slate-500';
  const textLabel = isDarkMode ? 'text-[#A1A8B3]' : 'text-slate-600';
  const textBright = isDarkMode ? 'text-[#F3F4F6]' : 'text-slate-900';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={`mb-2 text-[10px] font-bold uppercase tracking-wider ${textMuted}`}>
        <span>{t('orgPanel.branchHeading')}</span>
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
              className={`rounded-xl border px-1.5 py-1.5 text-left transition ${
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
              ? 'border-white/10 bg-[#171B24] text-[#F3F4F6] placeholder:text-[#6B7280] focus:border-[#4F6BED]/40'
              : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-400'
          }`}
        />
      </div>

      <div
        className={`mb-2 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider ${textMuted}`}
      >
        <Building2 className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
        <span>{t('orgPanel.organizationSection')}</span>
      </div>

      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto border-l border-white/[0.04] pl-2 pr-0.5">
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
              <div className="group relative">
              <button
                type="button"
                onClick={() => toggleDivision(division._id)}
                className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 pr-8 text-left transition ${
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
              </button>
              {canManageWorkspaceStructure ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDivisionSettings?.(division);
                  }}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition group-hover:opacity-100 ${
                    isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                  }`}
                  title="Cài đặt quyền khối"
                >
                  <Settings className="h-3 w-3" />
                </button>
              ) : null}
              </div>

              {isOpen ? (
                <div className="mt-1 space-y-1 pl-1">
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
                        <div className="group relative">
                        <button
                          type="button"
                          onClick={() =>
                            toggleDepartment(department._id, { notifyParent: canAccessDept })
                          }
                          className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 pr-2 text-left text-sm transition ${
                            deptActive
                              ? isDarkMode
                                ? 'border-white/10 bg-[#171B24] text-[#F3F4F6]'
                                : 'border-slate-200 bg-slate-100 text-slate-900'
                              : isDarkMode
                                ? 'border-transparent bg-[#171B24]/60 text-[#A1A8B3] hover:bg-[#1D2330]'
                                : 'border-transparent bg-slate-50 text-slate-700 hover:bg-slate-100'
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
                          {!canAccessDept ? (
                            <Lock className={`h-3 w-3 shrink-0 ${textMuted}`} aria-hidden />
                          ) : null}
                        </button>
                        {canManageWorkspaceStructure ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenDepartmentSettings?.(department);
                            }}
                            className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition group-hover:opacity-100 ${
                              isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                            }`}
                            title="Cài đặt quyền phòng ban"
                          >
                            <Settings className="h-3 w-3" />
                          </button>
                        ) : null}
                        </div>

                        {deptOpen ? (
                          <div className="mt-1 space-y-2 pl-2">
                            {teamRows.map(({ team, chat, voice, teamUnread, canReadTeam }, teamIdx) => {
                              const teamActive = String(selectedTeamId) === String(team._id);

                              return (
                                <div key={team._id} className="group relative mt-0.5">
                                  <button
                                    type="button"
                                    disabled={!canReadTeam}
                                    onContextMenu={(e) => {
                                      if (!canReadTeam || !canCreateTaskBoard) return;
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setTeamMenu({
                                        open: true,
                                        x: e.clientX,
                                        y: e.clientY,
                                        team,
                                      });
                                    }}
                                    onClick={() => {
                                      if (!canReadTeam) return;
                                      toggleTeam(team._id);
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-lg border-l-2 py-1.5 pl-2 pr-8 text-left text-sm transition ${
                                      !canReadTeam
                                        ? isDarkMode
                                          ? 'cursor-not-allowed border-transparent text-[#6B7280]'
                                          : 'cursor-not-allowed border-transparent text-slate-400'
                                        : teamActive
                                          ? isDarkMode
                                            ? 'border-[#4F6BED] bg-[#1D2330] text-[#F3F4F6]'
                                            : 'border-indigo-500 bg-indigo-50 text-slate-900'
                                          : isDarkMode
                                            ? 'border-transparent text-[#A1A8B3] hover:bg-[#1D2330]'
                                            : 'border-transparent text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <Users className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{team.name}</span>
                                    {teamUnread > 0 ? (
                                      <span className="rounded-md bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                                        {teamUnread}
                                      </span>
                                    ) : !canReadTeam ? (
                                      <Lock className={`h-3 w-3 shrink-0 ${textMuted}`} aria-hidden />
                                    ) : null}
                                  </button>
                                  {canManageWorkspaceStructure ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenTeamSettings?.(team);
                                      }}
                                      className={`absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition group-hover:opacity-100 ${
                                        isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'
                                      }`}
                                      title="Cài đặt quyền team"
                                    >
                                      <Settings className="h-3 w-3" />
                                    </button>
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

      <OrganizationChannelListPanel
        isDarkMode={isDarkMode}
        locale={locale}
        t={t}
        channels={channels}
        channelPermissionMatrix={channelPermissionMatrix}
        selectedChannelId={selectedChannelId}
        selectedTeamId={selectedTeamId}
        selectedDepartmentId={selectedDepartment?._id}
        selectedDivisionId={selectedDivisionId}
        onSelectChannel={onSelectChannel}
        onCreateChannel={onCreateChannel}
        onOpenChannelSettings={onOpenChannelSettings}
        canManageChannelRoleAccess={canManageChannelRoleAccess}
      />
      {teamMenu.open && teamMenu.team ? (
        <div
          className={`fixed z-[1000] min-w-[180px] rounded-lg border p-1 shadow-xl ${
            isDarkMode ? 'border-white/10 bg-[#171B24]' : 'border-slate-200 bg-white'
          }`}
          style={{ left: teamMenu.x, top: teamMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={`w-full rounded-md px-3 py-2 text-left text-sm ${
              isDarkMode ? 'text-white hover:bg-white/10' : 'text-slate-800 hover:bg-slate-100'
            }`}
            onClick={() => {
              onCreateTaskBoard?.(teamMenu.team);
              setTeamMenu((prev) => ({ ...prev, open: false }));
            }}
          >
            Tạo Task Board
          </button>
        </div>
      ) : null}
    </div>
  );
}
