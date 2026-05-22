/**
 * Chuẩn hóa response GET /messages và GET /messages/search (pageToken hoặc legacy page).
 */
export function parseMessageListPage(resp) {
  const payload = resp?.data ?? resp;
  const result = payload?.data ?? payload;
  const list = result?.messages ?? result?.items ?? result ?? [];
  const messages = Array.isArray(list) ? list : [];

  if (result?.nextPageToken != null || result?.hasMore != null) {
    return {
      messages,
      nextPageToken: result.nextPageToken || null,
      hasMore: Boolean(result.hasMore),
      totalPages: null,
      currentPage: null,
    };
  }

  const totalPages = result?.totalPages ?? 1;
  const currentPage = result?.currentPage ?? 1;
  return {
    messages,
    nextPageToken: null,
    hasMore: currentPage < totalPages,
    totalPages,
    currentPage,
  };
}
