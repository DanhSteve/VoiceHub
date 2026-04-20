import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { Dropdown, GlassCard, GradientButton, Modal, Toast } from '../../components/Shared';
import { useTheme } from '../../context/ThemeContext';
import { tasksFilterTrigger, threeFramePageHeader } from '../../theme/shellTheme';
import TasksKanbanDnd, {
  COL_TODO,
  COL_PROGRESS,
  COL_DONE,
} from '../../components/Tasks/TasksKanbanDnd';
import { taskAPI } from '../../services/api/taskAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import userService from '../../services/userService';
import { useLocale } from '../../context/LocaleContext';
import { useAppStrings } from '../../locales/appStrings';
import { useDebouncedValue } from '../../features/search/useDebouncedValue';

const PROOF_MAX_BYTES = 5 * 1024 * 1024;

function taskHasProof(task) {
  return Array.isArray(task?.attachments) && task.attachments.some((a) => a && (a.url || a.name));
}

function initialsFromName(name) {
  if (!name || typeof name !== 'string') return '?';
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 2) return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDueDate(value, locale) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function columnForStatus(status) {
  if (status === 'done') return 'done';
  if (status === 'in_progress' || status === 'review') return 'inProgress';
  return 'todo';
}

function parseTaskListResponse(res) {
  const payload = res?.data != null && !Array.isArray(res) ? res.data : res;
  const inner = payload?.data !== undefined ? payload.data : payload;
  if (inner && Array.isArray(inner.tasks)) return inner.tasks;
  if (Array.isArray(inner)) return inner;
  return [];
}

function parseOrgList(res) {
  if (!res) return [];
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return [];
}

function parseMembers(res) {
  const raw = res?.data ?? res;
  const arr = raw?.data ?? raw;
  return Array.isArray(arr) ? arr : [];
}

function getPriorityColor(priority) {
  const colors = {
    urgent: 'from-rose-600 to-red-600',
    high: 'from-red-500 to-orange-500',
    medium: 'from-yellow-500 to-orange-500',
    low: 'from-green-500 to-emerald-500',
  };
  return colors[priority] || colors.medium;
}

function dropdownMenuItemClass(isDark) {
  return isDark
    ? 'w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-100 transition-colors hover:bg-white/10'
    : 'w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-100';
}

export default function TasksPage() {
  const { isDarkMode } = useTheme();
  const { locale } = useLocale();
  const { t } = useAppStrings();
  const headerStrip = threeFramePageHeader(isDarkMode);
  const filterTrigger = tasksFilterTrigger(isDarkMode);

  const PRIORITY_FILTER_OPTS = useMemo(
    () => [
      { value: 'all', label: t('tasks.filterAllPriority') },
      { value: 'urgent', label: t('tasks.priorityUrgent') },
      { value: 'high', label: t('tasks.priorityHigh') },
      { value: 'medium', label: t('tasks.priorityMedium') },
      { value: 'low', label: t('tasks.priorityLow') },
    ],
    [t],
  );
  const PRIORITY_FORM_OPTS = useMemo(
    () => [
      { value: 'urgent', label: t('tasks.priorityUrgent') },
      { value: 'high', label: t('tasks.priorityHigh') },
      { value: 'medium', label: t('tasks.priorityMedium') },
      { value: 'low', label: t('tasks.priorityLow') },
    ],
    [t],
  );
  const PRIORITY_DETAIL_OPTS = useMemo(
    () => [
      { value: 'low', label: t('tasks.priorityLow') },
      { value: 'medium', label: t('tasks.priorityMedium') },
      { value: 'high', label: t('tasks.priorityHigh') },
      { value: 'urgent', label: t('tasks.priorityUrgent') },
    ],
    [t],
  );

  const getPriorityLabel = useCallback(
    (priority) =>
      ({
        urgent: t('tasks.priorityUrgent'),
        high: t('tasks.priorityHigh'),
        medium: t('tasks.priorityMedium'),
        low: t('tasks.priorityLow'),
      })[priority] || priority,
    [t],
  );

  const statusLabel = useCallback(
    (status) =>
      ({
        todo: t('tasks.statusTodo'),
        in_progress: t('tasks.statusInProgress'),
        review: t('tasks.statusReview'),
        done: t('tasks.statusDone'),
        cancelled: t('tasks.statusCancelled'),
      })[status] || status,
    [t],
  );

  const dueLabel = useCallback(
    (value) => formatDueDate(value, locale) ?? t('tasks.noDeadline'),
    [locale, t],
  );

  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [userNameMap, setUserNameMap] = useState({});
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [filterPriority, setFilterPriority] = useState('all');
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [taskSearchInput, setTaskSearchInput] = useState('');
  const taskSearchDebounced = useDebouncedValue(taskSearchInput, 350);
  const [viewMode, setViewMode] = useState('kanban');
  const [selectedTask, setSelectedTask] = useState(null);

  const [detailTitle, setDetailTitle] = useState('');
  const [detailDescription, setDetailDescription] = useState('');
  const [detailPriority, setDetailPriority] = useState('medium');
  const [detailSaving, setDetailSaving] = useState(false);

  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [createTaskLoading, setCreateTaskLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    priority: 'medium',
    assigneeId: '',
    dueDate: '',
    description: '',
  });

  /** Kéo sang Hoàn thành hoặc bấm Hoàn thành khi chưa có đính kèm */
  const [proofModal, setProofModal] = useState({ open: false, task: null });
  const [proofFiles, setProofFiles] = useState([]);
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadOrganizations = useCallback(async () => {
    try {
      const res = await organizationAPI.getOrganizations();
      const list = parseOrgList(res);
      setOrganizations(list);
      setSelectedOrgId((prev) => {
        if (prev) return prev;
        if (list.length) return String(list[0]._id || list[0].id || '');
        return '';
      });
    } catch (e) {
      console.error(e);
      setLoadError(t('tasks.loadOrgFail'));
    }
  }, [t]);

  const resolveUserNames = useCallback(async (memberRows) => {
    const ids = [
      ...new Set(
        memberRows
          .map((m) => String(m.user || m.userId || '').trim())
          .filter(Boolean)
      ),
    ];
    const next = {};
    await Promise.all(
      ids.map(async (uid) => {
        try {
          const u = await userService.getProfile(uid);
          const profile = u?.data ?? u;
          const p = profile?.data ?? profile;
          next[uid] =
            p?.displayName ||
            p?.fullName ||
            p?.username ||
            p?.name ||
            t('tasks.memberFallback', { id: uid.slice(-6) });
        } catch {
          next[uid] = t('tasks.memberFallback', { id: uid.slice(-6) });
        }
      })
    );
    setUserNameMap((prev) => ({ ...prev, ...next }));
  }, [t]);

  const loadMembers = useCallback(
    async (orgId) => {
      if (!orgId) return;
      try {
        const res = await organizationAPI.getMembers(orgId);
        const members = parseMembers(res);
        await resolveUserNames(members);
      } catch (e) {
        console.error(e);
      }
    },
    [resolveUserNames]
  );

  const fetchTasks = useCallback(async () => {
    if (!selectedOrgId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const params = { organizationId: selectedOrgId, limit: 200 };
      const qs = taskSearchDebounced.trim();
      if (qs) params.q = qs;
      const res = await taskAPI.getTasks(params);
      setTasks(parseTaskListResponse(res));
    } catch (e) {
      console.error(e);
      setLoadError(e?.response?.data?.message || e?.message || t('tasks.loadTaskFail'));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, t, taskSearchDebounced]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  useEffect(() => {
    if (selectedOrgId) loadMembers(selectedOrgId);
  }, [selectedOrgId, loadMembers]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!selectedTask) return;
    setDetailTitle(selectedTask.title || '');
    setDetailDescription(selectedTask.description || '');
    setDetailPriority(selectedTask.priority || 'medium');
  }, [selectedTask]);

  const assigneeName = useCallback(
    (task) => {
      const id = task?.assigneeId ? String(task.assigneeId) : '';
      if (!id) return t('tasks.unassigned');
      return userNameMap[id] || `…${id.slice(-6)}`;
    },
    [userNameMap, t]
  );

  /** Gateway đọc organizationId từ query — bắt buộc khi middleware cần ngữ cảnh org */
  const taskApiOpts = useMemo(
    () => (selectedOrgId ? { organizationId: selectedOrgId } : {}),
    [selectedOrgId]
  );

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (filterPriority !== 'all') {
      list = list.filter((t) => t.priority === filterPriority);
    }
    if (filterAssignee === 'unassigned') {
      list = list.filter((t) => !t.assigneeId);
    } else if (filterAssignee !== 'all') {
      list = list.filter((t) => String(t.assigneeId || '') === filterAssignee);
    }
    return list;
  }, [tasks, filterPriority, filterAssignee]);

  const columns = useMemo(() => {
    const todo = [];
    const inProgress = [];
    const done = [];
    for (const t of filteredTasks) {
      const col = columnForStatus(t.status);
      if (col === 'done') done.push(t);
      else if (col === 'inProgress') inProgress.push(t);
      else todo.push(t);
    }
    return { todo, inProgress, done };
  }, [filteredTasks]);

  const totalTasks = filteredTasks.length;
  const completedTasks = columns.done.length;
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handleCreateTask = async () => {
    if (!selectedOrgId) {
      showToast(t('tasks.selectOrgFirst'), 'error');
      return;
    }
    if (!formData.title.trim()) {
      showToast(t('tasks.titleRequired'), 'error');
      return;
    }

    try {
      setCreateTaskLoading(true);
      const body = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        organizationId: selectedOrgId,
        priority: formData.priority,
        tags: [],
      };
      if (formData.assigneeId) body.assigneeId = formData.assigneeId;
      if (formData.dueDate) {
        body.dueDate = new Date(`${formData.dueDate}T12:00:00`).toISOString();
      }

      await taskAPI.createTask(body);
      showToast(t('tasks.createOk'), 'success');
      setShowCreateTaskModal(false);
      setFormData({
        title: '',
        priority: 'medium',
        assigneeId: '',
        dueDate: '',
        description: '',
      });
      await fetchTasks();
    } catch (error) {
      console.error('Lỗi tạo công việc:', error);
      showToast(error.response?.data?.message || error.message || t('tasks.createErr'), 'error');
    } finally {
      setCreateTaskLoading(false);
    }
  };

  const handleSaveDetail = async () => {
    if (!selectedTask?._id) return;
    setDetailSaving(true);
    try {
      await taskAPI.updateTask(
        String(selectedTask._id),
        {
          title: detailTitle.trim(),
          description: detailDescription.trim(),
          priority: detailPriority,
        },
        taskApiOpts
      );
      showToast(t('tasks.saved'), 'success');
      await fetchTasks();
      setSelectedTask(null);
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || t('tasks.saveFail'), 'error');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleMarkDone = async () => {
    if (!selectedTask?._id) return;
    if (!taskHasProof(selectedTask)) {
      setProofModal({ open: true, task: selectedTask });
      return;
    }
    setDetailSaving(true);
    try {
      await taskAPI.updateTask(String(selectedTask._id), { status: 'done' }, taskApiOpts);
      showToast(t('tasks.markedDone'), 'success');
      await fetchTasks();
      setSelectedTask(null);
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || t('tasks.opFail'), 'error');
    } finally {
      setDetailSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask?._id) return;
    if (!window.confirm(t('tasks.confirmDelete'))) return;
    setDetailSaving(true);
    try {
      await taskAPI.deleteTask(String(selectedTask._id), taskApiOpts);
      showToast(t('tasks.deleted'), 'success');
      await fetchTasks();
      setSelectedTask(null);
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || t('tasks.deleteFail'), 'error');
    } finally {
      setDetailSaving(false);
    }
  };

  const colToStatus = (col) => {
    if (col === COL_DONE) return 'done';
    if (col === COL_PROGRESS) return 'in_progress';
    return 'todo';
  };

  const handleKanbanDrop = useCallback(
    async (task, _fromCol, toCol) => {
      const next = colToStatus(toCol);
      if (next === task.status) return;

      if (toCol === COL_DONE && !taskHasProof(task)) {
        setProofModal({ open: true, task });
        return;
      }

      try {
        await taskAPI.updateTask(String(task._id), { status: next }, taskApiOpts);
        showToast(t('tasks.statusUpdated'), 'success');
        await fetchTasks();
      } catch (e) {
        showToast(e?.response?.data?.message || e?.message || t('tasks.moveFail'), 'error');
      }
    },
    [fetchTasks, taskApiOpts, t]
  );

  const submitProofAndDone = async () => {
    const taskRow = proofModal.task;
    if (!taskRow?._id) return;
    if (!proofFiles.length) {
      showToast(t('tasks.proofRequired'), 'error');
      return;
    }
    for (const f of proofFiles) {
      if (f.size > PROOF_MAX_BYTES) {
        showToast(t('tasks.fileTooBig', { name: f.name }), 'error');
        return;
      }
    }
    setProofSubmitting(true);
    try {
      const newAtt = await Promise.all(
        proofFiles.map(
          (file) =>
            new Promise((resolve, reject) => {
              const r = new FileReader();
              r.onload = () => resolve({ name: file.name, url: r.result });
              r.onerror = reject;
              r.readAsDataURL(file);
            })
        )
      );
      const merged = [...(taskRow.attachments || []), ...newAtt];
      await taskAPI.updateTask(String(taskRow._id), { status: 'done', attachments: merged }, taskApiOpts);
      showToast(t('tasks.proofOk'), 'success');
      setProofModal({ open: false, task: null });
      setProofFiles([]);
      await fetchTasks();
      setSelectedTask((prev) => (prev && String(prev._id) === String(taskRow._id) ? null : prev));
    } catch (e) {
      showToast(e?.response?.data?.message || e?.message || t('tasks.proofErr'), 'error');
    } finally {
      setProofSubmitting(false);
    }
  };

  const renderKanbanCardInner = (task, name, { glow: _glow, doneStyle = false }) => {
    const tags = Array.isArray(task.tags) ? task.tags : [];
    const commentsCount = Array.isArray(task.comments) ? task.comments.length : 0;
    const attachmentsCount = Array.isArray(task.attachments) ? task.attachments.length : 0;
    const initial = initialsFromName(name);
    const titleCls = isDarkMode
      ? `font-bold text-white flex-1 group-hover:text-purple-200 transition-colors ${doneStyle ? 'line-through' : ''}`
      : `font-bold text-slate-900 flex-1 group-hover:text-cyan-800 transition-colors ${doneStyle ? 'line-through' : ''}`;
    const tagCls = isDarkMode
      ? 'px-2 py-0.5 rounded-full glass text-xs text-gray-300'
      : 'px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-xs text-slate-700';
    const avatarCls = isDarkMode
      ? 'from-purple-600 to-pink-600'
      : 'from-cyan-600 to-teal-600';

    return (
      <>
        <div className={`w-full h-1 rounded-full bg-gradient-to-r ${getPriorityColor(task.priority)} mb-3`} />

        <div className="flex items-start gap-2 mb-2">
          {task.status === 'cancelled' && (
            <span
              className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                isDarkMode ? 'bg-white/10 text-amber-200' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {t('tasks.cancelledBadge')}
            </span>
          )}
          <h3 className={titleCls}>{task.title}</h3>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map((tag, idx) => (
              <span key={idx} className={tagCls}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <div
          className={`flex items-center justify-between text-xs ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarCls} flex items-center justify-center text-[10px] font-bold text-white shrink-0`}
              title={name}
            >
              {initial}
            </span>
            <span className={`truncate ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`}>{name}</span>
          </div>
          <span
            className={`px-2 py-1 rounded-lg text-[10px] font-bold bg-gradient-to-r ${getPriorityColor(
              task.priority
            )} text-white shrink-0`}
          >
            {getPriorityLabel(task.priority)}
          </span>
        </div>

        <div
          className={`mt-2 flex items-center justify-between text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}
        >
          <span className="flex items-center gap-1">📅 {dueLabel(task.dueDate)}</span>
          <span className="flex items-center gap-2">
            {commentsCount > 0 && <span>💬 {commentsCount}</span>}
            {attachmentsCount > 0 && <span>📎 {attachmentsCount}</span>}
          </span>
        </div>
      </>
    );
  };

  const listRows = useMemo(() => {
    return filteredTasks.map((t) => ({
      ...t,
      _col: columnForStatus(t.status),
    }));
  }, [filteredTasks]);

  const orgSelectDisabled = organizations.length === 0;

  const selectedOrgLabel = useMemo(() => {
    if (organizations.length === 0) return t('tasks.noOrgInList');
    if (!selectedOrgId) return t('tasks.selectOrgPlaceholder');
    const o = organizations.find((x) => String(x._id || x.id) === selectedOrgId);
    return o ? o.name || selectedOrgId : selectedOrgId;
  }, [organizations, selectedOrgId, t]);

  const priorityFilterLabel = useMemo(
    () => PRIORITY_FILTER_OPTS.find((o) => o.value === filterPriority)?.label || filterPriority,
    [filterPriority, PRIORITY_FILTER_OPTS],
  );

  const assigneeFilterLabel = useMemo(() => {
    if (filterAssignee === 'all') return t('tasks.allAssignees');
    if (filterAssignee === 'unassigned') return t('tasks.unassigned');
    return userNameMap[filterAssignee] || filterAssignee;
  }, [filterAssignee, userNameMap, t]);

  return (
    <ThreeFrameLayout
      center={
        <div className="flex h-full min-h-0 flex-col">
          <div className={`p-6 ${headerStrip}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
              <div>
                <h1
                  className={`text-4xl font-black mb-2 ${
                    isDarkMode ? 'text-gradient' : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-teal-700'
                  }`}
                >
                  {t('tasks.pageTitle')}
                </h1>
                <p className={`text-base leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                  {t('tasks.pageSubtitle')}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-2 text-sm">
                  <span className={isDarkMode ? 'text-gray-400' : 'text-slate-600'}>{t('tasks.orgLabel')}</span>
                  <div className="min-w-[180px]">
                    <Dropdown
                      align="left"
                      trigger={
                        <button
                          type="button"
                          disabled={orgSelectDisabled}
                          className={`${filterTrigger} min-w-[180px] disabled:pointer-events-none disabled:opacity-50`}
                        >
                          <span className="truncate">{selectedOrgLabel}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        </button>
                      }
                    >
                      {(close) => (
                        <div className="max-h-64 overflow-y-auto py-1">
                          {organizations.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-slate-400">{t('tasks.noOrgInList')}</div>
                          ) : (
                            organizations.map((o) => {
                              const id = String(o._id || o.id);
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  className={dropdownMenuItemClass(isDarkMode)}
                                  onClick={() => {
                                    setSelectedOrgId(id);
                                    close();
                                  }}
                                >
                                  {o.name || id}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </Dropdown>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === 'kanban' ? 'list' : 'kanban')}
                  className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 font-semibold ${
                    isDarkMode
                      ? 'glass hover:bg-white/10 text-slate-200'
                      : 'border border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-50'
                  }`}
                >
                  <span>                  {viewMode === 'kanban' ? '📋' : '📊'}</span>
                  {viewMode === 'kanban' ? t('tasks.viewList') : t('tasks.viewKanban')}
                </button>
                <GradientButton
                  variant="shell"
                  onClick={() => setShowCreateTaskModal(true)}
                  disabled={!selectedOrgId}
                >
                  {t('tasks.newTask')}
                </GradientButton>
              </div>
            </div>

            <div className="mb-4">
              <input
                type="search"
                value={taskSearchInput}
                onChange={(e) => setTaskSearchInput(e.target.value)}
                placeholder={t('tasks.searchPlaceholder')}
                className={`w-full max-w-md rounded-xl border px-3 py-2 text-sm outline-none transition ${
                  isDarkMode
                    ? 'border-white/10 bg-[#12151c] text-white placeholder:text-slate-500'
                    : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                }`}
              />
            </div>

            {loadError && (
              <div
                className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                  isDarkMode
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                    : 'border-amber-300 bg-amber-50 text-amber-900'
                }`}
              >
                {loadError}
              </div>
            )}

            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-600 to-teal-600 flex items-center justify-center text-xl shadow-sm">
                    📊
                  </div>
                  <div>
                    <div className={`text-base ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                      {t('tasks.statTotal')}
                    </div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {totalTasks}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xl shadow-sm">
                    ⏳
                  </div>
                  <div>
                    <div className={`text-base ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                      {t('tasks.statActive')}
                    </div>
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {columns.inProgress.length}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-xl shadow-sm">
                    ✅
                  </div>
                  <div>
                    <div className={`text-base ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                      {t('tasks.statDone')}
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        isDarkMode
                          ? 'text-gradient'
                          : 'text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-700'
                      }`}
                    >
                      {completedTasks} ({completionRate}%)
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="min-w-[200px] max-w-[min(100%,280px)]">
                  <Dropdown
                    align="left"
                    trigger={
                      <button type="button" className={`${filterTrigger} w-full`}>
                        <span className="min-w-0 flex-1 truncate text-left">{priorityFilterLabel}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      </button>
                    }
                  >
                    {(close) => (
                      <div className="max-h-64 overflow-y-auto py-1">
                        {PRIORITY_FILTER_OPTS.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            className={dropdownMenuItemClass(isDarkMode)}
                            onClick={() => {
                              setFilterPriority(o.value);
                              close();
                            }}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </Dropdown>
                </div>
                <div className="min-w-[200px] max-w-[min(100%,280px)]">
                  <Dropdown
                    align="left"
                    trigger={
                      <button type="button" className={`${filterTrigger} w-full`}>
                        <span className="min-w-0 flex-1 truncate text-left">{assigneeFilterLabel}</span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      </button>
                    }
                  >
                    {(close) => (
                      <div className="max-h-64 overflow-y-auto py-1">
                        <button
                          type="button"
                          className={dropdownMenuItemClass(isDarkMode)}
                          onClick={() => {
                            setFilterAssignee('all');
                            close();
                          }}
                        >
                          {t('tasks.allAssignees')}
                        </button>
                        <button
                          type="button"
                          className={dropdownMenuItemClass(isDarkMode)}
                          onClick={() => {
                            setFilterAssignee('unassigned');
                            close();
                          }}
                        >
                          {t('tasks.unassigned')}
                        </button>
                        {Object.entries(userNameMap).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={dropdownMenuItemClass(isDarkMode)}
                            onClick={() => {
                              setFilterAssignee(id);
                              close();
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </Dropdown>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            {loading ? (
              <div className={`py-20 text-center ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                {t('tasks.loadingTasks')}
              </div>
            ) : !selectedOrgId ? (
              <div className={`py-20 text-center ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                {t('tasks.joinOrgHint')}
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className={`py-20 text-center ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                {t('tasks.emptyFiltered')}
              </div>
            ) : viewMode === 'kanban' ? (
              <div className="space-y-3">
                <TasksKanbanDnd
                  columns={columns}
                  getAssigneeLabel={assigneeName}
                  onCardClick={(task) => setSelectedTask(task)}
                  onDropOnColumn={handleKanbanDrop}
                  renderCardInner={renderKanbanCardInner}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCreateTaskModal(true)}
                    className={`w-full py-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
                      isDarkMode
                        ? 'glass hover:bg-white/10 text-gray-400 hover:text-white'
                        : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>➕</span> {t('tasks.addTask')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateTaskModal(true)}
                    className={`w-full py-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
                      isDarkMode
                        ? 'glass hover:bg-white/10 text-gray-400 hover:text-white'
                        : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span>➕</span> {t('tasks.addTask')}
                  </button>
                  <div className="hidden md:block" aria-hidden />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <GlassCard
                  className={`mb-4 ${isDarkMode ? '' : '!border-slate-200/90 !bg-white/95 shadow-sm'}`}
                >
                  <div
                    className={`grid grid-cols-12 gap-4 text-sm font-bold px-2 ${
                      isDarkMode ? 'text-gray-400' : 'text-slate-600'
                    }`}
                  >
                    <div className="col-span-4">{t('tasks.colTitle')}</div>
                    <div className="col-span-2">{t('tasks.colAssignee')}</div>
                    <div className="col-span-2">{t('tasks.colStatus')}</div>
                    <div className="col-span-2">{t('tasks.colPriority')}</div>
                    <div className="col-span-2">{t('tasks.colDue')}</div>
                  </div>
                </GlassCard>
                {listRows.map((task) => {
                  const col = task._col;
                  const statusColor =
                    col === 'done'
                      ? 'from-green-500 to-emerald-500'
                      : col === 'inProgress'
                        ? 'from-blue-500 to-cyan-500'
                        : 'from-cyan-600 to-teal-600';
                  return (
                    <GlassCard
                      key={String(task._id)}
                      hover
                      className={`cursor-pointer ${isDarkMode ? '' : '!border-slate-200/90 !bg-white/95 shadow-sm'}`}
                      onClick={() => setSelectedTask(task)}
                    >
                      <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-4 min-w-0">
                          <div
                            className={`w-full h-1 rounded-full bg-gradient-to-r ${getPriorityColor(
                              task.priority
                            )} mb-2`}
                          />
                          <h3
                            className={`font-bold truncate ${
                              isDarkMode ? 'text-white' : 'text-slate-900'
                            } ${task.status === 'done' ? 'line-through opacity-75' : ''}`}
                          >
                            {task.title}
                          </h3>
                          {Array.isArray(task.tags) && task.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {task.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded-full text-xs ${
                                    isDarkMode
                                      ? 'glass text-gray-400'
                                      : 'border border-slate-200 bg-slate-50 text-slate-600'
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div
                          className={`col-span-2 text-sm truncate ${
                            isDarkMode ? 'text-gray-300' : 'text-slate-700'
                          }`}
                        >
                          {assigneeName(task)}
                        </div>
                        <div className="col-span-2">
                          <span
                            className={`px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${statusColor} text-white inline-block`}
                          >
                            {statusLabel(task.status)}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span
                            className={`px-2 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${getPriorityColor(
                              task.priority
                            )} text-white inline-block`}
                          >
                            {getPriorityLabel(task.priority)}
                          </span>
                        </div>
                        <div
                          className={`col-span-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                        >
                          📅 {dueLabel(task.dueDate)}
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </div>

          <Modal
            isOpen={selectedTask !== null}
            onClose={() => setSelectedTask(null)}
            title={detailTitle || t('tasks.detailTitle')}
            size="lg"
            layerClassName="z-[10040]"
          >
            {selectedTask && (
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-16 h-16 rounded-xl bg-gradient-to-br ${getPriorityColor(
                      detailPriority
                    )} flex items-center justify-center text-2xl font-black text-white shadow-lg`}
                  >
                    {initialsFromName(detailTitle)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={detailTitle}
                      onChange={(e) => setDetailTitle(e.target.value)}
                      className="text-2xl font-bold text-white bg-transparent border-b-2 border-white/20 hover:border-purple-500 focus:border-purple-500 outline-none w-full transition-all"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${getPriorityColor(
                          detailPriority
                        )} text-white`}
                      >
                        {getPriorityLabel(detailPriority)}
                      </span>
                      <span className="text-sm text-gray-400">{statusLabel(selectedTask.status)}</span>
                      <span className="text-sm text-gray-400">📅 {dueLabel(selectedTask.dueDate)}</span>
                      {selectedTask.completedAt && (
                        <span className="text-sm text-green-400">
                          ✓ {t('tasks.completedAt')} {dueLabel(selectedTask.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GlassCard>
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                      <span>👤</span> {t('tasks.assigneeLead')}
                    </h4>
                    <p className="text-white">{assigneeName(selectedTask)}</p>
                    <p className="text-xs text-gray-500 mt-1">{t('tasks.assigneeApiNote')}</p>
                  </GlassCard>
                  <GlassCard>
                    <h4 className="font-semibold text-white mb-3">{t('tasks.prioritySection')}</h4>
                    <Dropdown
                      align="left"
                      trigger={
                        <button type="button" className={`${filterTrigger} w-full`} disabled={detailSaving}>
                          <span className="min-w-0 flex-1 truncate text-left">
                            {PRIORITY_DETAIL_OPTS.find((o) => o.value === detailPriority)?.label || detailPriority}
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        </button>
                      }
                    >
                      {(close) => (
                        <div className="py-1">
                          {PRIORITY_DETAIL_OPTS.map((o) => (
                            <button
                              key={o.value}
                              type="button"
                              className={dropdownMenuItemClass(isDarkMode)}
                              onClick={() => {
                                setDetailPriority(o.value);
                                close();
                              }}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </Dropdown>
                  </GlassCard>
                </div>

                <GlassCard>
                  <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <span>📝</span> {t('tasks.descriptionLabel')}
                  </h4>
                  <textarea
                    value={detailDescription}
                    onChange={(e) => setDetailDescription(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white resize-none"
                  />
                </GlassCard>

                {Array.isArray(selectedTask.comments) && selectedTask.comments.length > 0 && (
                  <GlassCard>
                    <h4 className="font-semibold text-white mb-3">
                      💬 {t('tasks.commentsTitle')} ({selectedTask.comments.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {selectedTask.comments.map((c, idx) => (
                        <div key={idx} className="p-3 glass-strong rounded-lg text-sm text-gray-300">
                          <div className="text-xs text-gray-500 mb-1">
                            {t('tasks.userComment')} {String(c.userId || '').slice(-6)} ·{' '}
                            {c.createdAt ? dueLabel(c.createdAt) : ''}
                          </div>
                          {c.content}
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                )}

                <div className="flex gap-3 pt-4 border-t border-white/10 flex-wrap">
                  {selectedTask.status !== 'done' && (
                    <GradientButton variant="success" className="flex-1 min-w-[120px]" onClick={handleMarkDone} disabled={detailSaving}>
                      ✓ {t('tasks.markDoneBtn')}
                    </GradientButton>
                  )}
                  <GradientButton variant="primary" className="flex-1 min-w-[120px]" onClick={handleSaveDetail} disabled={detailSaving}>
                    {detailSaving ? t('tasks.saving') : t('tasks.saveChanges')}
                  </GradientButton>
                  <button
                    type="button"
                    onClick={handleDeleteTask}
                    disabled={detailSaving}
                    className="glass px-4 py-3 rounded-xl hover:bg-red-500/20 text-red-400"
                  >
                    🗑️ {t('common.delete')}
                  </button>
                </div>
              </div>
            )}
          </Modal>

          <Modal
            isOpen={proofModal.open}
            onClose={() => {
              if (!proofSubmitting) {
                setProofModal({ open: false, task: null });
                setProofFiles([]);
              }
            }}
            title={t('tasks.proofTitle')}
            size="lg"
            layerClassName="z-[10040]"
          >
            <p className="text-sm text-slate-400 mb-4">
              {t('tasks.proofLine1')}{' '}
              <strong className="text-white">{t('tasks.proofDoneWord')}</strong>
              {t('tasks.proofLine2')}
            </p>
            {proofModal.task && (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white mb-4">
                {proofModal.task.title}
              </div>
            )}
            <label className="block text-sm font-semibold text-gray-400 mb-2">{t('tasks.proofPick')}</label>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.zip"
              disabled={proofSubmitting}
              onChange={(e) => setProofFiles(Array.from(e.target.files || []))}
              className="w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-600 file:px-3 file:py-2 file:text-white"
            />
            {proofFiles.length > 0 && (
              <ul className="mt-3 text-xs text-slate-400 space-y-1">
                {proofFiles.map((f) => (
                  <li key={f.name + f.size}>
                    📎 {f.name} ({Math.round(f.size / 1024)} KB)
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-3 mt-6 justify-end">
              <button
                type="button"
                disabled={proofSubmitting}
                onClick={() => {
                  setProofModal({ open: false, task: null });
                  setProofFiles([]);
                }}
                className="glass px-4 py-2 rounded-xl text-slate-200 hover:bg-white/10"
              >
                {t('nav.cancel')}
              </button>
              <GradientButton variant="primary" disabled={proofSubmitting} onClick={submitProofAndDone}>
                {proofSubmitting ? t('tasks.saving') : t('tasks.proofSubmit')}
              </GradientButton>
            </div>
          </Modal>

          <Modal
            isOpen={showCreateTaskModal}
            onClose={() => setShowCreateTaskModal(false)}
            title={t('tasks.modalCreateTitle')}
            size="lg"
            layerClassName="z-[10040]"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">
                  {t('tasks.titleLabel')} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder={t('tasks.phTaskTitle')}
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  disabled={createTaskLoading}
                  className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-400 mb-2">{t('tasks.prioritySection')}</label>
                  <Dropdown
                    align="left"
                    trigger={
                      <button
                        type="button"
                        disabled={createTaskLoading}
                        className={`${filterTrigger} w-full disabled:pointer-events-none disabled:opacity-50`}
                      >
                        <span className="min-w-0 flex-1 truncate text-left">
                          {PRIORITY_FORM_OPTS.find((o) => o.value === formData.priority)?.label ||
                            formData.priority}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      </button>
                    }
                  >
                    {(close) => (
                      <div className="py-1">
                        {PRIORITY_FORM_OPTS.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            className={dropdownMenuItemClass(isDarkMode)}
                            onClick={() => {
                              setFormData((fd) => ({ ...fd, priority: o.value }));
                              close();
                            }}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </Dropdown>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-400 mb-2">{t('tasks.assigneeOptional')}</label>
                  <Dropdown
                    align="left"
                    trigger={
                      <button
                        type="button"
                        disabled={createTaskLoading}
                        className={`${filterTrigger} w-full disabled:pointer-events-none disabled:opacity-50`}
                      >
                        <span className="min-w-0 flex-1 truncate text-left">
                          {formData.assigneeId === ''
                            ? t('tasks.unassignedDash')
                            : userNameMap[formData.assigneeId] || formData.assigneeId}
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      </button>
                    }
                  >
                    {(close) => (
                      <div className="max-h-64 overflow-y-auto py-1">
                        <button
                          type="button"
                          className={dropdownMenuItemClass(isDarkMode)}
                          onClick={() => {
                            setFormData((fd) => ({ ...fd, assigneeId: '' }));
                            close();
                          }}
                        >
                          {t('tasks.unassignedDash')}
                        </button>
                        {Object.entries(userNameMap).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={dropdownMenuItemClass(isDarkMode)}
                            onClick={() => {
                              setFormData((fd) => ({ ...fd, assigneeId: id }));
                              close();
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </Dropdown>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">{t('tasks.dueOptional')}</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  disabled={createTaskLoading}
                  className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white transition-all disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-400 mb-2">{t('tasks.descriptionLabel')}</label>
                <textarea
                  rows={4}
                  placeholder={t('tasks.phDescDetail')}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={createTaskLoading}
                  className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all resize-none disabled:opacity-50"
                />
              </div>

              <div className="flex gap-3">
                <GradientButton
                  variant="shell"
                  onClick={handleCreateTask}
                  disabled={createTaskLoading || !selectedOrgId}
                  className="flex-1 disabled:opacity-50"
                >
                  {createTaskLoading ? `⏳ ${t('tasks.creatingTask')}` : `✅ ${t('tasks.createTaskBtn')}`}
                </GradientButton>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateTaskModal(false);
                    setFormData({
                      title: '',
                      priority: 'medium',
                      assigneeId: '',
                      dueDate: '',
                      description: '',
                    });
                  }}
                  disabled={createTaskLoading}
                  className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold disabled:opacity-50"
                >
                  {t('nav.cancel')}
                </button>
              </div>
            </div>
          </Modal>

          {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
      }
    />
  );
}
