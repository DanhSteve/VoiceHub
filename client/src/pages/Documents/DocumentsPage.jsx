import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { ConfirmDialog, Dropdown, GlassCard, GradientButton, Modal } from '../../components/Shared';
import { useTheme } from '../../context/ThemeContext';
import { threeFramePageHeader } from '../../theme/shellTheme';
import { useAppStrings } from '../../locales/appStrings';
import { PageSearchBar, SearchFilterChips } from '../../features/search';

const DEMO_DOCS = [
  {
    id: 1,
    name: 'Kế Hoạch Dự Án Q1.pdf',
    size: '2.4 MB',
    type: '📄',
    color: 'from-red-500 to-orange-500',
    category: 'Tài liệu',
    owner: 'Sarah Chen',
    modified: '2 giờ trước',
    shared: true,
    starred: true,
  },
  {
    id: 2,
    name: 'Hệ Thống Thiết Kế.fig',
    size: '15.8 MB',
    type: '🎨',
    color: 'from-purple-600 to-pink-600',
    category: 'Thiết kế',
    owner: 'Emma Wilson',
    modified: '1 ngày trước',
    shared: true,
    starred: false,
  },
  {
    id: 3,
    name: 'Biên Bản Họp.docx',
    size: '124 KB',
    type: '📝',
    color: 'from-blue-500 to-cyan-500',
    category: 'Văn bản',
    owner: 'Mike Ross',
    modified: '3 ngày trước',
    shared: false,
    starred: true,
  },
  {
    id: 4,
    name: 'Báo Cáo Phân Tích.xlsx',
    size: '892 KB',
    type: '📊',
    color: 'from-green-500 to-emerald-500',
    category: 'Bảng tính',
    owner: 'David Kim',
    modified: '1 tuần trước',
    shared: true,
    starred: false,
  },
  {
    id: 5,
    name: 'Presentation_Demo.pptx',
    size: '5.2 MB',
    type: '📽️',
    color: 'from-orange-500 to-red-500',
    category: 'Trình chiếu',
    owner: 'Lisa Park',
    modified: '2 tuần trước',
    shared: true,
    starred: false,
  },
  {
    id: 6,
    name: 'Code_Review_Notes.md',
    size: '45 KB',
    type: '💻',
    color: 'from-cyan-500 to-blue-500',
    category: 'Code',
    owner: 'Tom Zhang',
    modified: '4 ngày trước',
    shared: false,
    starred: true,
  },
];

const DEMO_FOLDERS = [
  { name: 'Dự Án', count: 12, icon: '📁', color: 'from-purple-600 to-pink-600' },
  { name: 'Thiết Kế', count: 24, icon: '🎨', color: 'from-blue-500 to-cyan-500' },
  { name: 'Tài Liệu', count: 8, icon: '📄', color: 'from-green-500 to-emerald-500' },
  { name: 'Ảnh & Video', count: 45, icon: '🖼️', color: 'from-orange-500 to-red-500' },
];

function DocumentsPage() {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const headerStrip = threeFramePageHeader(isDarkMode);

  const [viewMode, setViewMode] = useState('grid');
  const [currentFolder, setCurrentFolder] = useState('root');
  /** Lọc thư mục nhanh (minh họa) */
  const [activeFolder, setActiveFolder] = useState(null);
  /** Từ khóa tìm theo tên (minh họa — API GET /documents hỗ trợ q khi nối dữ liệu thật) */
  const [docNameQuery, setDocNameQuery] = useState('');
  /** all | starred | shared */
  const [listFilter, setListFilter] = useState('all');
  const [selectedFile, setSelectedFile] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteConfirmFileId, setDeleteConfirmFileId] = useState(null);

  const handleStarFile = (fileId) => {
    toast.success(t('documents.toastStar'));
  };

  const handleDownloadFile = (file) => {
    toast(t('documents.toastDownloading', { name: file.name }), { icon: '⬇️' });
  };

  const handleDeleteFile = (fileId) => {
    toast.success(t('documents.toastDeleted'));
  };

  const handleShareFile = (file) => {
    setShowShareModal(file);
  };

  const handleUploadStart = () => {
    setShowUploadModal(true);
    // Simulate upload
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      setUploadProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setShowUploadModal(false);
          setUploadProgress(0);
          toast.success(t('documents.toastUploadOk'));
        }, 500);
      }
    }, 200);
  };

  const storageUsed = 45.8; // GB
  const storageTotal = 100; // GB
  const storagePercent = (storageUsed / storageTotal) * 100;

  const docListFilterOptions = useMemo(
    () => [
      { id: 'all', label: t('documents.listFilterAll'), icon: '📋' },
      { id: 'starred', label: t('documents.listFilterStarred'), icon: '⭐' },
      { id: 'shared', label: t('documents.listFilterShared'), icon: '🔗' },
    ],
    [t]
  );

  const toastDemoNoApi = (action) => {
    toast(t('documents.toastNoApi', { action }), { icon: 'ℹ️' });
  };

  const filteredDocs = useMemo(() => {
    let list = [...DEMO_DOCS];
    if (activeFolder === 'Thiết Kế') list = list.filter((d) => d.category === 'Thiết kế');
    else if (activeFolder === 'Tài Liệu') list = list.filter((d) => d.category === 'Tài liệu');
    else if (activeFolder === 'Ảnh & Video') list = [];
    if (listFilter === 'starred') list = list.filter((d) => d.starred);
    if (listFilter === 'shared') list = list.filter((d) => d.shared);
    const dq = docNameQuery.trim().toLowerCase();
    if (dq) list = list.filter((d) => String(d.name || '').toLowerCase().includes(dq));
    return list;
  }, [activeFolder, listFilter, docNameQuery]);

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className="flex h-full min-h-0 flex-col">
            {/* Header */}
            <div className={`p-6 ${headerStrip}`}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-4xl font-black text-gradient mb-2">{t('documents.title')}</h1>
                  <p className={`text-base leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
                    {t('documents.subtitle')}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all flex items-center gap-2 font-semibold"
                  >
                    {viewMode === 'grid' ? t('documents.viewList') : t('documents.viewGrid')}
                  </button>
                  <GradientButton variant="primary" onClick={handleUploadStart}>
                    {t('documents.upload')}
                  </GradientButton>
                </div>
              </div>
              <div className="mb-4 max-w-xl space-y-2">
                <PageSearchBar
                  value={docNameQuery}
                  onChange={setDocNameQuery}
                  placeholder={t('documents.searchPlaceholder')}
                  isDarkMode={isDarkMode}
                  id="documents-name-search"
                  aria-label={t('documents.searchAria')}
                />
                <SearchFilterChips
                  aria-label={t('documents.listFilterAria')}
                  options={docListFilterOptions}
                  value={listFilter}
                  onChange={setListFilter}
                  isDarkMode={isDarkMode}
                  size="sm"
                />
              </div>
              {/* Storage Bar */}
              <GlassCard>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">{t('documents.storageUsed')}</span>
                  <span className="text-sm font-bold text-white">{storageUsed} GB / {storageTotal} GB</span>
                </div>
                <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all"
                    style={{ width: `${storagePercent}%` }}
                  ></div>
                </div>
              </GlassCard>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6">
              {/* Quick Access Folders */}
              <div className="mb-8">
                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">{t('documents.foldersTitle')}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {DEMO_FOLDERS.map((folder, idx) => (
                    <GlassCard
                      key={idx}
                      hover
                      onClick={() => {
                        setActiveFolder(folder.name);
                        setCurrentFolder(folder.name);
                        toast(t('documents.toastFiltered', { name: folder.name }), { icon: '📁' });
                      }}
                      className="cursor-pointer group animate-slideUp"
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${folder.color} flex items-center justify-center text-2xl mb-3`}>
                        {folder.icon}
                      </div>
                      <h3 className="font-bold text-white mb-1 group-hover:text-gradient transition-colors">{folder.name}</h3>
                      <p className="text-gray-400 text-sm">
                        {folder.count} {t('documents.filesSuffix')}
                      </p>
                    </GlassCard>
                  ))}
                </div>
                {activeFolder && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFolder(null);
                      setCurrentFolder('root');
                      toast(t('documents.toastFilterClear'), { icon: '✓' });
                    }}
                    className="mt-3 text-sm text-cyan-400/90 underline-offset-2 hover:underline"
                  >
                    {t('documents.clearFolderFilter')}
                  </button>
                )}
              </div>

              {/* Recent Files */}
              <div>
                <div className="mb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">{t('documents.recentTitle')}</h2>
                </div>

                {filteredDocs.length === 0 ? (
                  <p className="py-12 text-center text-gray-400">
                    {t('documents.filterEmpty')}
                  </p>
                ) : viewMode === 'grid' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-visible">
                    {filteredDocs.map((doc, idx) => (
                      <GlassCard
                        key={doc.id}
                        hover
                        className="animate-slideUp group cursor-pointer !overflow-visible relative z-0 hover:z-10"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div
                            onClick={() => setSelectedFile(doc)}
                            className={`w-14 h-14 rounded-xl bg-gradient-to-br ${doc.color} flex items-center justify-center text-3xl shadow-lg hover:scale-110 transition-transform cursor-pointer`}
                          >
                            {doc.type}
                          </div>
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleStarFile(doc.id)}
                              className={
                                doc.starred
                                  ? 'text-yellow-400 text-lg hover:scale-125 transition-transform'
                                  : 'text-gray-600 text-lg hover:text-yellow-400 hover:scale-125 transition-all'
                              }
                            >
                              ⭐
                            </button>
                            {doc.shared && <span className="text-blue-400 text-lg">🔗</span>}
                          </div>
                        </div>
                        <h3
                          onClick={() => setSelectedFile(doc)}
                          className="font-bold text-white mb-2 group-hover:text-gradient transition-colors line-clamp-2"
                        >
                          {doc.name}
                        </h3>
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                          <span>{doc.size}</span>
                          <span className="px-2 py-0.5 rounded-full glass text-xs">{doc.category}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
                          <span>👤 {doc.owner}</span>
                          <span>•</span>
                          <span>{doc.modified}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedFile(doc)}
                            className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm font-semibold"
                          >
                            {t('documents.view')}
                          </button>
                          <button
                            onClick={() => handleDownloadFile(doc)}
                            className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm font-semibold"
                          >
                            ⬇️
                          </button>
                          <Dropdown
                            trigger={
                              <button className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all">
                                ⋯
                              </button>
                            }
                            align="right"
                          >
                            <button
                              onClick={() => handleShareFile(doc)}
                              className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
                            >
                              {t('documents.shareAction')}
                            </button>
                            <button
                              type="button"
                              onClick={() => toastDemoNoApi(t('documents.demoRename'))}
                              className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
                            >
                              {t('documents.renameAction')}
                            </button>
                            <button
                              type="button"
                              onClick={() => toastDemoNoApi(t('documents.demoMove'))}
                              className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
                            >
                              {t('documents.moveAction')}
                            </button>
                            <button
                              type="button"
                              onClick={() => toastDemoNoApi(t('documents.demoCopy'))}
                              className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
                            >
                              {t('documents.copyAction')}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmFileId(doc.id)}
                              className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2 text-red-400"
                            >
                              🗑️ {t('common.delete')}
                            </button>
                          </Dropdown>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredDocs.map((doc, idx) => (
                      <GlassCard
                        key={doc.id}
                        hover
                        className="animate-slideUp group cursor-pointer"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            onClick={() => setSelectedFile(doc)}
                            className={`w-12 h-12 rounded-xl bg-gradient-to-br ${doc.color} flex items-center justify-center text-2xl flex-shrink-0 hover:scale-110 transition-transform cursor-pointer`}
                          >
                            {doc.type}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3
                              onClick={() => setSelectedFile(doc)}
                              className="font-bold text-white mb-1 group-hover:text-gradient transition-colors truncate"
                            >
                              {doc.name}
                            </h3>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>{doc.size}</span>
                              <span>•</span>
                              <span>{doc.category}</span>
                              <span>•</span>
                              <span>{t('documents.byOwner', { owner: doc.owner })}</span>
                              <span>•</span>
                              <span>{doc.modified}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleStarFile(doc.id)}
                              className={
                                doc.starred
                                  ? 'text-yellow-400 hover:scale-125 transition-transform'
                                  : 'text-gray-600 hover:text-yellow-400 hover:scale-125 transition-all'
                              }
                            >
                              ⭐
                            </button>
                            {doc.shared && <span className="text-blue-400">🔗</span>}
                            <button
                              onClick={() => setSelectedFile(doc)}
                              className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm font-semibold"
                            >
                              {t('documents.view')}
                            </button>
                            <button
                              onClick={() => handleDownloadFile(doc)}
                              className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all"
                            >
                              ⬇️
                            </button>
                            <Dropdown
                              trigger={
                                <button className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all">
                                  ⋯
                                </button>
                              }
                              align="right"
                            >
                              <button
                                onClick={() => handleShareFile(doc)}
                                className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
                              >
                                {t('documents.shareAction')}
                              </button>
                              <button
                                type="button"
                                onClick={() => toastDemoNoApi(t('documents.demoRename'))}
                                className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
                              >
                                {t('documents.renameAction')}
                              </button>
                              <button
                                type="button"
                                onClick={() => toastDemoNoApi(t('documents.demoMove'))}
                                className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
                              >
                                {t('documents.moveAction')}
                              </button>
                              <button
                                type="button"
                                onClick={() => toastDemoNoApi(t('documents.demoCopy'))}
                                className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2"
                              >
                                {t('documents.copyAction')}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmFileId(doc.id)}
                                className="w-full text-left px-4 py-2 hover:bg-white/10 transition-colors flex items-center gap-2 text-red-400"
                              >
                                🗑️ {t('common.delete')}
                              </button>
                            </Dropdown>
                          </div>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        }
      />

    {/* File Preview Modal */}
    <Modal 
      isOpen={selectedFile !== null} 
      onClose={() => setSelectedFile(null)}
      title={selectedFile?.name}
      size="xl"
    >
      {selectedFile && (
        <div className="space-y-4">
          {/* File Preview */}
          <div className="glass-strong rounded-xl p-8 flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <div className={`w-32 h-32 rounded-2xl bg-gradient-to-br ${selectedFile.color} flex items-center justify-center text-6xl mb-6 mx-auto shadow-2xl`}>
                {selectedFile.type}
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">{selectedFile.name}</h3>
              <p className="text-gray-400 mb-4">{selectedFile.size} • {selectedFile.category}</p>
              <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
                <span>👤 {selectedFile.owner}</span>
                <span>•</span>
                <span>📅 {selectedFile.modified}</span>
              </div>
            </div>
          </div>

          {/* File Info & Actions */}
          <div className="grid grid-cols-2 gap-4">
            <GlassCard>
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>ℹ️</span> {t('documents.fileInfoTitle')}
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('documents.typeLabel')}</span>
                  <span className="text-white font-semibold">{selectedFile.category}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('documents.sizeLabel')}</span>
                  <span className="text-white font-semibold">{selectedFile.size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('documents.ownerLabel')}</span>
                  <span className="text-white font-semibold">{selectedFile.owner}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">{t('documents.editedLabel')}</span>
                  <span className="text-white font-semibold">{selectedFile.modified}</span>
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>👥</span> {t('documents.accessRights')}
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xs font-bold">
                    SC
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-semibold">Sarah Chen</div>
                    <div className="text-gray-500 text-xs">{t('documents.roleOwner')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-xs font-bold">
                    EW
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-semibold">Emma Wilson</div>
                    <div className="text-gray-500 text-xs">{t('documents.canEditNote')}</div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <GradientButton 
              variant="primary" 
              onClick={() => handleDownloadFile(selectedFile)}
              className="flex-1"
            >
              {t('documents.downloadBtn')}
            </GradientButton>
            <GradientButton 
              variant="secondary" 
              onClick={() => {
                setShowShareModal(selectedFile);
                setSelectedFile(null);
              }}
              className="flex-1"
            >
              {t('documents.shareBtn')}
            </GradientButton>
            <button 
              onClick={() => setSelectedFile(null)}
              className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              {t('documents.close')}
            </button>
          </div>
        </div>
      )}
    </Modal>

    {/* Upload Progress Modal */}
    <Modal 
      isOpen={showUploadModal} 
      onClose={() => {}}
      title={t('documents.uploadingTitle')}
      size="md"
    >
      <div className="space-y-4">
        <GlassCard>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
              📄
            </div>
            <div className="flex-1">
              <div className="font-bold text-white">Document.pdf</div>
              <div className="text-sm text-gray-500">2.4 MB</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">{t('documents.progressLabel')}</span>
              <span className="text-white font-bold">{uploadProgress}%</span>
            </div>
            <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
                style={{width: `${uploadProgress}%`}}
              ></div>
            </div>
          </div>
        </GlassCard>

        {uploadProgress === 100 && (
          <div className="text-center text-green-400 font-semibold animate-slideUp">
            {t('documents.uploadComplete')}
          </div>
        )}
      </div>
    </Modal>

    {/* Share Modal */}
    <Modal 
      isOpen={showShareModal !== null} 
      onClose={() => setShowShareModal(null)}
      title={t('documents.shareModalTitle')}
      size="md"
    >
      {showShareModal && (
        <div className="space-y-4">
          <GlassCard>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${showShareModal.color} flex items-center justify-center text-2xl`}>
                {showShareModal.type}
              </div>
              <div>
                <div className="font-bold text-white">{showShareModal.name}</div>
                <div className="text-sm text-gray-500">{showShareModal.size}</div>
              </div>
            </div>
          </GlassCard>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              {t('documents.addUsersLabel')}
            </label>
            <div className="flex gap-2">
              <input 
                type="email"
                placeholder={t('documents.emailPlaceholder')}
                className="flex-1 glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all"
              />
              <GradientButton
                variant="primary"
                type="button"
                onClick={() => toast(t('documents.toastEmailDemo'), { icon: '✉️' })}
              >
                {t('documents.add')}
              </GradientButton>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              {t('documents.peopleAccess')}
            </label>
            <div className="space-y-2">
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-sm font-bold">
                      SC
                    </div>
                    <div>
                      <div className="font-semibold text-white">Sarah Chen</div>
                      <div className="text-xs text-gray-500">sarah@company.com</div>
                    </div>
                  </div>
                  <select className="glass px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                    <option>{t('documents.roleOwner')}</option>
                    <option>{t('documents.roleEdit')}</option>
                    <option>{t('documents.roleView')}</option>
                  </select>
                </div>
              </GlassCard>

              <GlassCard>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-sm font-bold">
                      EW
                    </div>
                    <div>
                      <div className="font-semibold text-white">Emma Wilson</div>
                      <div className="text-xs text-gray-500">emma@company.com</div>
                    </div>
                  </div>
                  <select className="glass px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm">
                    <option>{t('documents.roleEdit')}</option>
                    <option>{t('documents.roleView')}</option>
                  </select>
                </div>
              </GlassCard>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              {t('documents.shareLinkLabel')}
            </label>
            <div className="flex gap-2">
              <input 
                type="text"
                value="https://app.company.com/share/abc123"
                readOnly
                className="flex-1 glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm"
              />
              <button 
                onClick={() => toast.success(t('documents.toastCopyLink'))}
                className="glass px-4 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
              >
                {t('documents.copyLink')}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <GradientButton 
              variant="primary" 
              onClick={() => {
                toast.success(t('documents.toastSaveShare'));
                setShowShareModal(null);
              }}
              className="flex-1"
            >
              {t('documents.saveChangesBtn')}
            </GradientButton>
            <button 
              onClick={() => setShowShareModal(null)}
              className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              {t('nav.cancel')}
            </button>
          </div>
        </div>
      )}
    </Modal>

    <ConfirmDialog
      isOpen={deleteConfirmFileId != null}
      onClose={() => setDeleteConfirmFileId(null)}
      onConfirm={() => {
        if (deleteConfirmFileId != null) handleDeleteFile(deleteConfirmFileId);
      }}
      title={t('documents.confirmFileDeleteTitle')}
      message={t('documents.confirmFileDeleteMsg')}
      confirmText={t('common.delete')}
      cancelText={t('nav.cancel')}
    />
    </>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-8xl mb-6 animate-float">🚀</div>
        <h1 className="text-6xl font-black text-gradient mb-4">404</h1>
        <p className="text-2xl text-gray-400 mb-8">Lost in space?</p>
        <Link to="/">
          <GradientButton variant="primary">Go Home</GradientButton>
        </Link>
      </div>
    </div>
  );
}

// ============= NOTIFICATIONS PAGE =============

export default DocumentsPage;
