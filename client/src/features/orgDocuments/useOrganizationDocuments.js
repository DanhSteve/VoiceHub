import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import api from '../../services/api';
import { organizationAPI } from '../../services/api/organizationAPI';
import { fetchOrgMessageSearch } from '../search/orgChatSearchConfig';
import {
  flattenChannelsFromStructure,
  mapLibraryDocumentToOrgFile,
  mapMessageToOrgFile,
  ORG_FILE_CATEGORIES,
  unwrapApiPayload,
} from './orgDocumentUtils';

const MAX_ATTACHMENT_PAGES = 8;
const PAGE_LIMIT = 50;

async function fetchAllOrgAttachments(organizationId, signal) {
  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= MAX_ATTACHMENT_PAGES) {
    const data = await fetchOrgMessageSearch([], '', {
      organizationId,
      hasAttachment: true,
      page,
      limit: PAGE_LIMIT,
      signal,
    });
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    all.push(...messages);
    totalPages = Math.max(1, Number(data?.totalPages) || 1);
    if (messages.length === 0) break;
    page += 1;
  }

  return all;
}

export function useOrganizationDocuments(organizationId) {
  const { t, locale } = useAppStrings();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orgName, setOrgName] = useState('');
  const abortRef = useRef(null);

  const categoryMeta = useMemo(() => {
    const labelKey = {
      all: 'documents.orgCategoryAll',
      channel_chat: 'documents.orgCategoryChannelChat',
      channel_voice: 'documents.orgCategoryChannelVoice',
      voice_meeting: 'documents.orgCategoryVoiceMeeting',
      announcement: 'documents.orgCategoryAnnouncement',
      library: 'documents.orgCategoryLibrary',
      image: 'documents.orgCategoryImages',
    };
    const hintKey = {
      channel_chat: 'documents.orgCategoryChannelChatHint',
      channel_voice: 'documents.orgCategoryChannelVoiceHint',
      voice_meeting: 'documents.orgCategoryVoiceMeetingHint',
      announcement: 'documents.orgCategoryAnnouncementHint',
      library: 'documents.orgCategoryLibraryHint',
      image: 'documents.orgCategoryImagesHint',
    };
    return ORG_FILE_CATEGORIES.map((def) => ({
      ...def,
      label: t(labelKey[def.id] || labelKey.all),
      hint: hintKey[def.id] ? t(hintKey[def.id]) : '',
    }));
  }, [t]);

  const load = useCallback(async () => {
    if (!organizationId) {
      setFiles([]);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError('');

    try {
      const [structureRes, orgRes, messages, docsRes] = await Promise.all([
        organizationAPI.getStructure(organizationId),
        organizationAPI.getOrganization(organizationId).catch(() => null),
        fetchAllOrgAttachments(organizationId, ac.signal),
        api
          .get('/documents', {
            params: { organizationId, limit: 100 },
            signal: ac.signal,
            skipGlobalErrorHandling: true,
          })
          .catch(() => null),
      ]);

      if (ac.signal.aborted) return;

      const structureBody = unwrapApiPayload(structureRes);
      const branches = Array.isArray(structureBody?.branches)
        ? structureBody.branches
        : Array.isArray(structureBody)
          ? structureBody
          : [];
      const channels = flattenChannelsFromStructure(branches);
      const channelByRoomId = new Map(channels.map((ch) => [ch._id, ch]));

      const orgBody = orgRes ? unwrapApiPayload(orgRes) : null;
      const org = orgBody?.organization ?? orgBody;
      setOrgName(String(org?.name || org?.title || '').trim());

      const attachmentFiles = messages.map((m) =>
        mapMessageToOrgFile(m, channelByRoomId, t, locale)
      );

      let libraryFiles = [];
      if (docsRes) {
        const docsBody = unwrapApiPayload(docsRes?.data ?? docsRes);
        const inner = docsBody?.documents !== undefined ? docsBody : docsBody?.data ?? docsBody;
        const list = Array.isArray(inner?.documents)
          ? inner.documents
          : Array.isArray(inner)
            ? inner
            : [];
        libraryFiles = list.map((doc) => mapLibraryDocumentToOrgFile(doc, t, locale));
      }

      const merged = [...attachmentFiles, ...libraryFiles].sort((a, b) => {
        const ta = new Date(a.raw?.createdAt || a.raw?.updatedAt || 0).getTime();
        const tb = new Date(b.raw?.createdAt || b.raw?.updatedAt || 0).getTime();
        return tb - ta;
      });

      setFiles(merged);
    } catch (err) {
      if (err?.name === 'AbortError' || ac.signal.aborted) return;
      setError(err?.message || t('documents.orgLoadError'));
      setFiles([]);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [organizationId, t, locale]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const countsByCategory = useMemo(() => {
    const counts = { all: files.length };
    for (const f of files) {
      counts[f.category] = (counts[f.category] || 0) + 1;
    }
    return counts;
  }, [files]);

  const totalBytes = useMemo(
    () => files.reduce((sum, f) => sum + (Number(f.sizeBytes) || 0), 0),
    [files]
  );

  return {
    files,
    loading,
    error,
    orgName,
    reload: load,
    categoryMeta,
    countsByCategory,
    totalBytes,
  };
}
