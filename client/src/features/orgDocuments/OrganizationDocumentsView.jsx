import { useMemo, useState } from 'react';
import { ExternalLink, FileText, Loader2, MessageSquare, Mic } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard } from '../../components/Shared';
import { useTheme } from '../../context/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchToolbar, SearchFilterChips } from '../../features/search';
import { appShellBg } from '../../theme/shellTheme';
import { formatFileSize } from './orgDocumentUtils';
import { useOrganizationDocuments } from './useOrganizationDocuments';

function categoryAccent(category, isDark) {
  const map = {
    channel_chat: isDark ? 'from-cyan-600/30 to-teal-700/20 border-cyan-500/35' : 'from-cyan-50 to-teal-50 border-cyan-200',
    channel_voice: isDark ? 'from-violet-600/25 to-indigo-800/20 border-violet-500/35' : 'from-violet-50 to-indigo-50 border-violet-200',
    voice_meeting: isDark ? 'from-amber-600/25 to-orange-800/20 border-amber-500/35' : 'from-amber-50 to-orange-50 border-amber-200',
    announcement: isDark ? 'from-sky-600/25 to-blue-800/20 border-sky-500/35' : 'from-sky-50 to-blue-50 border-sky-200',
    library: isDark ? 'from-emerald-600/25 to-teal-800/20 border-emerald-500/35' : 'from-emerald-50 to-teal-50 border-emerald-200',
    image: isDark ? 'from-pink-600/25 to-rose-800/20 border-pink-500/35' : 'from-pink-50 to-rose-50 border-pink-200',
  };
  return map[category] || (isDark ? 'from-slate-800/80 to-slate-900/60 border-slate-700' : 'from-slate-50 to-white border-slate-200');
}

function FileRowIcon({ file, isDark }) {
  const box = `flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
    isDark ? 'bg-white/[0.04] text-cyan-300' : 'bg-sky-50 text-cyan-700'
  }`;
  if (file.messageType === 'image' && file.url) {
    return <img src={file.url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />;
  }
  const Icon = file.category === 'channel_voice' || file.category === 'voice_meeting' ? Mic : FileText;
  return (
    <div className={box}>
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </div>
  );
}

export default function OrganizationDocumentsView({ organizationId }) {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const { activeWorkspace, getLastWorkspacePath } = useWorkspace();
  const {
    files,
    loading,
    error,
    orgName,
    reload,
    categoryMeta,
    countsByCategory,
    totalBytes,
  } = useOrganizationDocuments(organizationId);

  const [activeCategory, setActiveCategory] = useState('all');
  const [docQuery, setDocQuery] = useState('');
  const [viewMode, setViewMode] = useState('list');

  const shell = `${appShellBg(isDarkMode)} ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`;
  const gc = isDarkMode
    ? 'border border-slate-800 bg-slate-900/60'
    : 'border border-slate-200 bg-white shadow-sm';
  const muted = isDarkMode ? 'text-slate-400' : 'text-slate-600';
  const title = isDarkMode ? 'text-white' : 'text-slate-900';
  const rowHover = isDarkMode
    ? 'border border-slate-800/80 bg-slate-900/40 hover:border-cyan-500/30 hover:bg-slate-800/50'
    : 'border border-slate-200 bg-white hover:border-cyan-300 hover:shadow-sm';

  const workspaceLabel =
    orgName || activeWorkspace?.name || t('documents.orgWorkspaceFallback');

  const filterOptions = useMemo(
    () =>
      categoryMeta.map((c) => ({
        id: c.id,
        label: c.label,
        icon: c.icon,
        count: countsByCategory[c.id] ?? 0,
      })),
    [categoryMeta, countsByCategory]
  );

  const filteredFiles = useMemo(() => {
    let list = files;
    if (activeCategory !== 'all') {
      list = list.filter((f) => f.category === activeCategory);
    }
    const q = docQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => {
      const hay = `${f.name} ${f.channelName} ${f.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [files, activeCategory, docQuery]);

  const openInWorkspace = (file) => {
    const base = getLastWorkspacePath();
    if (!file.roomId) {
      navigate(base);
      return;
    }
    const params = new URLSearchParams();
    params.set('channelId', file.roomId);
    if (file.source === 'message') params.set('messageId', file.id);
    navigate(`${base}?${params.toString()}`);
  };

  const handleDownload = (file) => {
    if (!file.url) return;
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <ThreeFrameLayout
      center={
        <div className={`flex min-h-full flex-col p-5 lg:p-6 ${shell}`}>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <p className={`mb-1 text-xs font-semibold uppercase tracking-wide ${muted}`}>
                {workspaceLabel}
              </p>
              <h1 className={`mb-1 text-3xl font-extrabold ${title}`}>
                {t('documents.orgTitle')}
              </h1>
              <p className={`text-sm ${muted}`}>{t('documents.orgSubtitle')}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className={
                  isDarkMode
                    ? 'rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold hover:bg-slate-800'
                    : 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50'
                }
              >
                {viewMode === 'grid' ? t('documents.viewList') : t('documents.viewGrid')}
              </button>
              <Link
                to={getLastWorkspacePath()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-900/20"
              >
                <MessageSquare className="h-4 w-4" strokeWidth={1.75} />
                {t('documents.orgBackToWorkspace')}
              </Link>
            </div>
          </div>

          <div className={`mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 ${gc} rounded-2xl p-4`}>
            <div>
              <p className={`text-xs ${muted}`}>{t('documents.orgStatTotal')}</p>
              <p className={`text-xl font-bold ${title}`}>{files.length}</p>
            </div>
            <div>
              <p className={`text-xs ${muted}`}>{t('documents.orgStatSize')}</p>
              <p className={`text-xl font-bold ${title}`}>{formatFileSize(totalBytes)}</p>
            </div>
            <div>
              <p className={`text-xs ${muted}`}>{t('documents.orgStatChat')}</p>
              <p className={`text-xl font-bold ${title}`}>
                {(countsByCategory.channel_chat || 0) + (countsByCategory.image || 0)}
              </p>
            </div>
            <div>
              <p className={`text-xs ${muted}`}>{t('documents.orgStatVoice')}</p>
              <p className={`text-xl font-bold ${title}`}>
                {(countsByCategory.channel_voice || 0) + (countsByCategory.voice_meeting || 0)}
              </p>
            </div>
          </div>

          <PageSearchToolbar
            className="-mx-5 mb-5 lg:-mx-6"
            value={docQuery}
            onChange={setDocQuery}
            placeholder={t('documents.orgSearchPlaceholder')}
            isDarkMode={isDarkMode}
            id="org-documents-search"
            aria-label={t('documents.searchAria')}
          >
            <SearchFilterChips
              aria-label={t('documents.orgCategoryAria')}
              options={filterOptions.map((o) => ({
                id: o.id,
                label: o.count > 0 && o.id !== 'all' ? `${o.label} (${o.count})` : o.label,
                icon: o.icon,
              }))}
              value={activeCategory}
              onChange={setActiveCategory}
              isDarkMode={isDarkMode}
              size="sm"
            />
          </PageSearchToolbar>

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categoryMeta
              .filter((c) => c.id !== 'all')
              .map((cat) => {
                const count = countsByCategory[cat.id] || 0;
                const active = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(activeCategory === cat.id ? 'all' : cat.id)}
                    className={`rounded-2xl border bg-gradient-to-br p-4 text-left transition-all ${categoryAccent(
                      cat.id,
                      isDarkMode
                    )} ${active ? 'ring-2 ring-cyan-500/50' : 'opacity-90 hover:opacity-100'}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-2xl">{cat.icon}</span>
                      <span className={`text-lg font-bold ${title}`}>{count}</span>
                    </div>
                    <p className={`text-sm font-bold ${title}`}>{cat.label}</p>
                    {cat.hint ? (
                      <p className={`mt-1 text-xs leading-snug ${muted}`}>{cat.hint}</p>
                    ) : null}
                  </button>
                );
              })}
          </div>

          {loading && files.length === 0 ? (
            <div className={`flex flex-col items-center py-16 ${muted}`}>
              <Loader2 className="h-8 w-8 animate-spin opacity-70" />
              <p className="mt-3 text-sm">{t('documents.orgLoading')}</p>
            </div>
          ) : error && files.length === 0 ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center">
              <p className="text-sm text-rose-300">{error}</p>
              <button
                type="button"
                onClick={reload}
                className="mt-3 rounded-xl bg-rose-600/80 px-4 py-2 text-sm font-semibold text-white"
              >
                {t('documents.orgRetry')}
              </button>
            </div>
          ) : filteredFiles.length === 0 ? (
            <p className={`py-12 text-center text-sm ${muted}`}>{t('documents.orgEmpty')}</p>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredFiles.map((file) => (
                <GlassCard key={file.id} hover className={`${gc} !p-4`}>
                  <div className="mb-3 flex items-start gap-3">
                    <FileRowIcon file={file} isDark={isDarkMode} />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-semibold ${title}`} title={file.name}>
                        {file.name}
                      </p>
                      <p className={`truncate text-xs ${muted}`}>#{file.channelName}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                        isDarkMode ? 'bg-white/10 text-cyan-200' : 'bg-cyan-50 text-cyan-800'
                      }`}
                    >
                      {file.typeLabel}
                    </span>
                  </div>
                  <div className={`mb-3 flex flex-wrap gap-2 text-xs ${muted}`}>
                    <span>{file.size}</span>
                    <span>·</span>
                    <span>{file.modified}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openInWorkspace(file)}
                      className={
                        isDarkMode
                          ? 'flex-1 rounded-lg border border-slate-700 py-2 text-xs font-semibold hover:bg-slate-800'
                          : 'flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold hover:bg-slate-50'
                      }
                    >
                      {t('documents.orgOpenContext')}
                    </button>
                    {file.url ? (
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs font-semibold text-cyan-400"
                        title={t('documents.downloadBtn')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </GlassCard>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-3 rounded-2xl p-3 transition-all ${rowHover}`}
                >
                  <FileRowIcon file={file} isDark={isDarkMode} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => openInWorkspace(file)}
                      className={`block w-full truncate text-left text-sm font-semibold ${title} hover:underline`}
                      title={file.name}
                    >
                      {file.name}
                    </button>
                    <p className={`truncate text-xs ${muted}`}>
                      #{file.channelName} ·{' '}
                      {categoryMeta.find((c) => c.id === file.category)?.label || file.category} ·{' '}
                      {file.modified}
                    </p>
                  </div>
                  <span className={`hidden text-xs sm:inline ${muted}`}>{file.size}</span>
                  {file.url ? (
                    <button
                      type="button"
                      onClick={() => handleDownload(file)}
                      className={
                        isDarkMode
                          ? 'rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-cyan-300'
                          : 'rounded-lg p-2 text-slate-500 hover:bg-slate-100'
                      }
                      title={t('documents.downloadBtn')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
