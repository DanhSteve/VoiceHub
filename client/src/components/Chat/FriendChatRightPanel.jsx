import { useMemo, useState } from 'react';
import { Calendar, FileText, LayoutGrid, Link2, Phone } from 'lucide-react';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/gi;

function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const raw = text.match(URL_REGEX);
  return raw ? [...new Set(raw)] : [];
}

function formatShortDate(iso, localeTag) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(localeTag === 'en' ? 'en-US' : 'vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function fileDisplayName(message, fileFallback) {
  const fm = message?.fileMeta;
  const original = typeof fm?.originalName === 'string' ? fm.originalName.trim() : '';
  if (original) return original;

  const content = String(message?.content ?? '');
  if (!/^https?:\/\//i.test(content)) return fileFallback;
  try {
    const pathOnly = content.split('?')[0];
    const u = new URL(pathOnly);
    const last = u.pathname.split('/').filter(Boolean).pop() || '';
    const decoded = decodeURIComponent(last.replace(/\+/g, ' '));
    const stripped = decoded.replace(/^[0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12}_/i, '');
    return stripped || decoded || fileFallback;
  } catch {
    return fileFallback;
  }
}

function isStorageAttachmentUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /storage\.googleapis\.com|firebasestorage\.app|googleapis\.com\/storage/i.test(url);
}

function avatarNode(friend) {
  const a = friend?.avatar;
  if (typeof a === 'string' && a.startsWith('http')) {
    return <img src={a} alt="" className="h-full w-full object-cover" />;
  }
  return <span className="text-3xl">{a || '👤'}</span>;
}

/**
 * Sidebar phải — chat 1-1: hồ sơ, lối tắt, tab, ghim / lịch (mockup).
 */
export default function FriendChatRightPanel({
  friend,
  messages = [],
  onMute,
  onPin,
  onCreateGroup,
}) {
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const { isDarkMode } = useTheme();
  const [tab, setTab] = useState('chung');
  const [openMedia, setOpenMedia] = useState(true);
  const [openFiles, setOpenFiles] = useState(true);

  const { images, files, links } = useMemo(() => {
    const imgs = [];
    const flist = [];
    const linkItems = [];

    const fileFb = t('friendChat.fileAttachment');
    for (const m of messages) {
      if (!m) continue;
      const msgType = m.messageType || 'text';
      const content = String(m.content ?? '');
      const id = m._id || m.id;

      if (msgType === 'image') {
        imgs.push({ id, preview: content, at: m.createdAt });
      } else if (msgType === 'file') {
        flist.push({
          id,
          name: fileDisplayName(m, fileFb),
          at: m.createdAt,
          url: /^https?:\/\//i.test(content) ? content : null,
        });
      }

      const urls = extractUrls(content);
      const contentPath = content.split('?')[0];
      for (const url of urls) {
        const urlPath = url.split('?')[0];
        if ((msgType === 'file' || msgType === 'image') && urlPath === contentPath) {
          continue;
        }
        if (msgType === 'file' && isStorageAttachmentUrl(url)) {
          continue;
        }
        linkItems.push({
          id: `${id}-${url}`,
          url,
          title: url.length > 48 ? `${url.slice(0, 45)}…` : url,
          at: m.createdAt,
        });
      }
    }

    const byTime = (a, b) =>
      new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();

    return {
      images: [...imgs].sort(byTime).slice(0, 8),
      files: [...flist].sort(byTime).slice(0, 6),
      links: [...linkItems].sort(byTime).slice(0, 8),
    };
  }, [messages, t]);

  const daysSinceFirstMsg = useMemo(() => {
    const sorted = [...messages]
      .filter((m) => m?.createdAt)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (!sorted.length) return null;
    const startMs = new Date(sorted[0].createdAt).getTime();
    return Math.max(0, Math.floor((Date.now() - startMs) / 86400000));
  }, [messages]);

  const isOnline = friend?.status === 'online';

  const shell = isDarkMode
    ? 'hidden h-full w-[min(320px,32vw)] shrink-0 flex-col overflow-hidden border-l border-white/[0.06] bg-[#0b0c14] lg:flex'
    : 'hidden h-full w-[min(320px,32vw)] shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-slate-50 lg:flex';
  const hairline = isDarkMode ? 'border-white/[0.06]' : 'border-slate-200';
  const hairlineT = isDarkMode ? 'border-t border-white/[0.06]' : 'border-t border-slate-200';
  const hairlineB = isDarkMode ? 'border-b border-white/[0.06]' : 'border-b border-slate-200';
  const panelMuted = isDarkMode ? 'bg-white/[0.03]' : 'bg-white';
  const titleMain = isDarkMode ? 'text-white' : 'text-slate-900';
  const subtitleMuted = isDarkMode ? 'text-cyan-300/90' : 'text-cyan-700';
  const labelCaps = isDarkMode ? 'text-gray-500' : 'text-slate-500';
  const bodyText = isDarkMode ? 'text-gray-200' : 'text-slate-700';
  const linkAccent = isDarkMode ? 'text-violet-300 hover:bg-white/[0.06]' : 'text-cyan-700 hover:bg-slate-100';
  const sectionBtn = isDarkMode
    ? 'flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-white/[0.03]'
    : 'flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-slate-900 hover:bg-slate-100/80';
  const thumbBg = isDarkMode ? 'border border-white/[0.06] bg-[#14151c]' : 'border border-slate-200 bg-slate-100';
  const fileRow = isDarkMode
    ? 'flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] p-2'
    : 'flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm';
  const dashedEmpty = isDarkMode
    ? 'rounded-xl border border-dashed border-white/[0.08] px-3 py-6 text-center text-xs text-gray-500'
    : 'rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500';
  const insetCard = isDarkMode
    ? 'rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-4 text-center text-xs text-gray-500'
    : 'rounded-xl border border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-500 shadow-sm';
  const statBox = isDarkMode
    ? 'rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-3 text-center'
    : 'rounded-xl border border-slate-200 bg-white px-2 py-3 text-center shadow-sm';
  const footerBtn = isDarkMode
    ? 'rounded-lg bg-white/[0.05] px-2 py-1.5 text-[10px] text-gray-400 hover:text-white'
    : 'rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-200 hover:text-slate-900';
  const avatarRing = isDarkMode ? 'ring-[#0b0c14]' : 'ring-slate-50';
  const onlineDotBorder = isDarkMode ? 'border-[#0b0c14]' : 'border-slate-50';

  const tabs = useMemo(
    () => [
      { id: 'chung', label: t('friendChat.tabChung'), Icon: LayoutGrid },
      { id: 'files', label: t('friendChat.tabTep'), Icon: FileText },
      { id: 'links', label: t('friendChat.tabLink'), Icon: Link2 },
      { id: 'cal', label: t('friendChat.tabLich'), Icon: Calendar },
    ],
    [t]
  );

  if (!friend) return null;

  return (
    <aside className={shell}>
      <div className={`shrink-0 px-4 py-4 ${hairlineB}`}>
        <div className="relative mx-auto flex max-w-[240px] flex-col items-center">
          <div
            className={`h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-cyan-600 to-teal-600 ring-4 shadow-xl ${avatarRing}`}
          >
            {avatarNode(friend)}
          </div>
          <span
            className={`absolute bottom-1 right-4 h-3.5 w-3.5 rounded-full border-2 ${onlineDotBorder} ${
              isOnline ? 'bg-emerald-500' : 'bg-gray-500'
            }`}
          />
        </div>
        <h4 className={`mt-3 text-center text-lg font-bold ${titleMain}`}>{friend.name}</h4>
        <p className={`text-center text-[11px] font-semibold uppercase tracking-wide ${subtitleMuted}`}>
          {t('friendChat.rightMemberBadge')}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className={`rounded-xl border px-2 py-2 text-center ${hairline} ${panelMuted}`}>
            <div className={`text-[10px] uppercase tracking-wide ${labelCaps}`}>{t('friendChat.rightTz')}</div>
            <div className={`text-xs font-medium ${bodyText}`}>GMT+7</div>
          </div>
          <div className={`rounded-xl border px-2 py-2 text-center ${hairline} ${panelMuted}`}>
            <div className={`text-[10px] uppercase tracking-wide ${labelCaps}`}>{t('friendChat.rightStatus')}</div>
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400/90">
              {isOnline ? t('friendChat.statusIdle') : t('friendChat.offline')}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
          >
            <Phone className="h-4 w-4" />
            {t('friendChat.rightCall')}
          </button>
          <button
            type="button"
            className={
              isDarkMode
                ? 'flex items-center justify-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.06] py-3 text-sm font-semibold text-white transition hover:bg-white/[0.1]'
                : 'flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50'
            }
          >
            <Calendar className="h-4 w-4" />
            {t('friendChat.rightCalendar')}
          </button>
        </div>
      </div>

      <div className={`flex shrink-0 gap-1 px-2 ${hairlineB}`}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-t-lg py-2 text-[10px] font-semibold uppercase tracking-wide transition ${
              tab === id
                ? isDarkMode
                  ? 'border-b-2 border-cyan-400 text-white'
                  : 'border-b-2 border-cyan-600 text-slate-900'
                : isDarkMode
                  ? 'text-gray-500 hover:text-gray-300'
                  : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay">
        <div className="px-3 py-3">
          <h5 className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${labelCaps}`}>{t('friendChat.pinnedTitle')}</h5>
          <p className={dashedEmpty}>{t('friendChat.pinnedEmpty')}</p>
        </div>

        <div className={`px-3 py-3 ${hairlineT}`}>
          <h5 className={`mb-2 text-[10px] font-bold uppercase tracking-widest ${labelCaps}`}>{t('friendChat.todayCalTitle')}</h5>
          <p className={insetCard}>{t('friendChat.todayCalEmpty')}</p>
        </div>

        {tab === 'chung' && (
          <>
            <section className={hairlineT}>
              <button type="button" onClick={() => setOpenMedia((o) => !o)} className={sectionBtn}>
                {t('friendChat.mediaSection')}
                <span className={labelCaps}>{openMedia ? '▾' : '▸'}</span>
              </button>
              {openMedia && (
                <div className="px-3 pb-3">
                  {images.length === 0 ? (
                    <p className={`py-2 text-xs ${labelCaps}`}>{t('friendChat.mediaEmpty')}</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {images.map((img) => (
                        <div
                          key={img.id}
                          className={`flex aspect-square items-center justify-center overflow-hidden rounded-lg text-[10px] ${thumbBg} ${labelCaps}`}
                        >
                          {img.preview?.startsWith('http') ? (
                            <img src={img.preview} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span>🖼️</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className={hairlineT}>
              <button type="button" onClick={() => setOpenFiles((o) => !o)} className={sectionBtn}>
                {t('friendChat.filesSection')}
                <span className={labelCaps}>{openFiles ? '▾' : '▸'}</span>
              </button>
              {openFiles && (
                <div className="space-y-2 px-3 pb-3">
                  {files.length === 0 ? (
                    <p className={`py-2 text-xs ${labelCaps}`}>{t('friendChat.filesEmpty')}</p>
                  ) : (
                    files.map((f) => (
                      <div key={f.id} className={fileRow}>
                        <span className="text-lg">📄</span>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-xs font-medium ${titleMain}`}>{f.name}</div>
                          <div className={`text-[10px] ${labelCaps}`}>{formatShortDate(f.at, locale)}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'files' && (
          <div className={`px-3 py-3 text-xs ${hairlineT} ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}>
            {files.length === 0 ? t('friendChat.filesTabEmpty') : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li key={f.id} className={`truncate ${bodyText}`}>
                    {f.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === 'links' && (
          <div className={`px-3 py-3 ${hairlineT}`}>
            {links.length === 0 ? (
              <p className={`text-xs ${labelCaps}`}>{t('friendChat.linksEmpty')}</p>
            ) : (
              links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mb-2 block rounded-lg border p-2 text-xs ${
                    isDarkMode ? 'border-white/[0.06] bg-white/[0.03]' : 'border-slate-200 bg-white shadow-sm'
                  } ${linkAccent}`}
                >
                  <div className={`truncate font-medium ${titleMain}`}>{l.title}</div>
                  <div className={`truncate text-[11px] ${labelCaps}`}>{hostFromUrl(l.url)}</div>
                </a>
              ))
            )}
          </div>
        )}

        {tab === 'cal' && (
          <div className={`px-3 py-4 text-center text-xs ${hairlineT} ${labelCaps}`}>
            {t('friendChat.calTabEmpty')}
          </div>
        )}

        <div className={`mt-auto grid grid-cols-2 gap-2 px-3 py-4 ${hairlineT}`}>
          <div className={statBox}>
            <div className={`text-[9px] font-bold uppercase tracking-wider ${labelCaps}`}>{t('friendChat.statChatStart')}</div>
            <div className={`mt-1 text-lg font-bold ${titleMain}`}>
              {daysSinceFirstMsg != null ? `${daysSinceFirstMsg}d` : '—'}
            </div>
          </div>
          <div className={statBox}>
            <div className={`text-[9px] font-bold uppercase tracking-wider ${labelCaps}`}>{t('friendChat.statChannel')}</div>
            <div className={`mt-1 text-lg font-bold ${titleMain}`}>1</div>
          </div>
        </div>

        <div className={`flex flex-wrap justify-center gap-2 px-2 py-3 ${hairlineT}`}>
          <button type="button" onClick={onMute} className={footerBtn}>
            {t('friendChat.footerMute')}
          </button>
          <button type="button" onClick={onPin} className={footerBtn}>
            {t('friendChat.footerPin')}
          </button>
          <button type="button" onClick={onCreateGroup} className={footerBtn}>
            {t('friendChat.footerGroup')}
          </button>
        </div>
      </div>
    </aside>
  );
}
