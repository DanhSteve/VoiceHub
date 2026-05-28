import { useMemo } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import { ORG_FILE_CATEGORIES } from './orgDocumentUtils';
import { useOrganizationDocumentsOverview } from '../../hooks/queries/useOrganizationDocumentsOverview';

export function useOrganizationDocuments(organizationId, { enabled = true } = {}) {
  const { t } = useAppStrings();
  const {
    files,
    isLoading: loading,
    isFetching,
    isError,
    error: queryError,
    orgName,
    reload,
    overview,
  } = useOrganizationDocumentsOverview(organizationId, { enabled });

  const error = isError
    ? queryError?.response?.data?.message ||
      queryError?.response?.data?.error ||
      queryError?.message ||
      t('documents.orgLoadError')
    : '';

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
    loading: loading || (enabled && isFetching && !overview),
    error,
    orgName,
    reload,
    categoryMeta,
    countsByCategory,
    totalBytes,
    overview,
  };
}
