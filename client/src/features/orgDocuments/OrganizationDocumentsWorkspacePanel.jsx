import { useMemo, useState } from 'react';
import { ExternalLink, FileText, Loader2, MessageSquare, Mic } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchToolbar, SearchFilterChips } from '../search';
import { formatFileSize } from './orgDocumentUtils';
import { useOrgDocumentCategoryMeta } from './useOrgDocumentCategoryMeta';

function FileRowIcon({ file, isDark }) {
  const box = `flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
    isDark ? 'bg-white/[0.04] text-cyan-300' : 'bg-sky-50 text-cyan-700'
  }`;
  if (file.messageType === 'image' && file.url) {
    return <img src={file.url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />;
  }
  const Icon = file.category === 'channel_voice' || file.category === 'voice_meeting' ? Mic : FileText;
  return (
    <div className={box}>
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </div>
  );
}

/**
 * Tài liệu tổ chức trong khung giữa workspace — dữ liệu từ OrganizationsPage (giống tab Tasks).
 */
export default function OrganizationDocumentsWorkspacePanel({
  files = [],
  loading = false,
  error = '',
  onReload,
  isDarkMode,
  onOpenInWorkspace,
}) {
  const { t } = useAppStrings();
  const { categoryMeta, countsByCategory, totalBytes } = useOrgDocumentCategoryMeta(files);

  const [activeCategory, setActiveCategory] = useState('all');
  const [docQuery, setDocQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const muted = isDarkMode ? 'text-[#8e9297]' : 'text-slate-500';
  const title = isDarkMode ? 'text-white' : 'text-slate-900';
  const listBorder = isDarkMode ? 'border-white/[0.06]' : 'border-slate-200/80';
  const listItemActive = isDarkMode
    ? 'bg-cyan-500/15 border-cyan-500/40 text-white'
    : 'bg-cyan-50 border-cyan-300 text-slate-900';
  const listItemIdle = isDarkMode
    ? 'border-transparent hover:bg-white/[0.05] text-slate-200'
    : 'border-transparent hover:bg-slate-50 text-slate-800';

  const filterOptions = useMemo(
    () =>
      categoryMeta.map((c) => ({
        id: c.id,
        label:
          c.id !== 'all' && (countsByCategory[c.id] ?? 0) > 0
            ? `${c.label} (${countsByCategory[c.id]})`
            : c.label,
        icon: c.icon,
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
    return list.filter((f) => `${f.name} ${f.channelName} ${f.category}`.toLowerCase().includes(q));
  }, [files, activeCategory, docQuery]);

  const selectedFile = useMemo(
    () => filteredFiles.find((f) => f.id === selectedId) || null,
    [filteredFiles, selectedId]
  );

  const handleDownload = (file) => {
    if (!file?.url) return;
    window.open(file.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={`text-sm font-semibold ${title}`}>{t('documents.orgTitle')}</h3>
          <p className={`text-[11px] ${muted}`}>
            {files.length} {t('documents.orgStatTotal').toLowerCase()} · {formatFileSize(totalBytes)}
          </p>
        </div>
      </div>

      <PageSearchToolbar
        className="mb-3"
        value={docQuery}
        onChange={setDocQuery}
        placeholder={t('documents.orgSearchPlaceholder')}
        isDarkMode={isDarkMode}
        id="workspace-org-documents-search"
        aria-label={t('documents.searchAria')}
      >
        <SearchFilterChips
          aria-label={t('documents.orgCategoryAria')}
          options={filterOptions}
          value={activeCategory}
          onChange={setActiveCategory}
          isDarkMode={isDarkMode}
          size="sm"
        />
      </PageSearchToolbar>

      <div className={`flex min-h-0 flex-1 overflow-hidden rounded-xl border ${listBorder}`}>
        <div
          className={`flex w-[min(100%,280px)] shrink-0 flex-col border-r ${listBorder} ${
            isDarkMode ? 'bg-[#0f1219]' : 'bg-slate-50/80'
          }`}
        >
          <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto p-2">
            {loading && files.length === 0 ? (
              <div className={`flex flex-col items-center py-10 ${muted}`}>
                <Loader2 className="h-6 w-6 animate-spin opacity-70" />
                <p className="mt-2 text-xs">{t('documents.orgLoading')}</p>
              </div>
            ) : error && files.length === 0 ? (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-center">
                <p className="text-xs text-rose-300">{error}</p>
                <button
                  type="button"
                  onClick={() => onReload?.()}
                  className="mt-2 rounded-lg bg-rose-600/80 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {t('documents.orgRetry')}
                </button>
              </div>
            ) : filteredFiles.length === 0 ? (
              <p className={`py-8 text-center text-xs ${muted}`}>{t('documents.orgEmpty')}</p>
            ) : (
              <ul className="space-y-1">
                {filteredFiles.map((file) => {
                  const active = selectedId === file.id;
                  return (
                    <li key={file.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(file.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition ${
                          active ? listItemActive : listItemIdle
                        }`}
                      >
                        <FileRowIcon file={file} isDark={isDarkMode} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-xs font-semibold ${title}`}>
                            {file.name}
                          </span>
                          <span className={`block truncate text-[10px] ${muted}`}>
                            #{file.channelName}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className={`min-w-0 flex-1 overflow-y-auto p-4 ${isDarkMode ? 'bg-[#11141C]' : 'bg-white'}`}>
          {selectedFile ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <FileRowIcon file={selectedFile} isDark={isDarkMode} />
                <div className="min-w-0 flex-1">
                  <h4 className={`text-base font-semibold ${title}`}>{selectedFile.name}</h4>
                  <p className={`text-xs ${muted}`}>
                    #{selectedFile.channelName} · {formatFileSize(selectedFile.sizeBytes)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedFile.url ? (
                  <button
                    type="button"
                    onClick={() => handleDownload(selectedFile)}
                    className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('documents.orgOpenFile')}
                  </button>
                ) : null}
                {selectedFile.roomId && onOpenInWorkspace ? (
                  <button
                    type="button"
                    onClick={() => onOpenInWorkspace(selectedFile)}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      isDarkMode
                        ? 'bg-white/[0.08] text-white hover:bg-white/[0.12]'
                        : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    {t('documents.orgOpenInChannel')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className={`py-12 text-center text-sm ${muted}`}>{t('documents.orgPickFileHint')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
