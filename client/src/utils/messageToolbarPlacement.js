/**
 * Tìm ancestor gần nhất có overflow cuộn (khung chứa danh sách tin).
 */
export function getScrollableAncestor(el) {
  if (!el) return null;
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Ước lượng chiều cao ChannelMessageToolbar + khoảng mb-1/mt-1 */
const EST_TOOLBAR_PX = 48;
const GAP_PX = 8;

/**
 * true = đặt toolbar phía dưới bubble (không đủ chỗ phía trên trong khung cuộn).
 */
export function shouldPlaceToolbarBelowBubble(bubbleEl) {
  if (!bubbleEl) return false;
  const bubbleRect = bubbleEl.getBoundingClientRect();
  const scrollEl = getScrollableAncestor(bubbleEl);
  if (!scrollEl) {
    return bubbleRect.top < EST_TOOLBAR_PX + GAP_PX;
  }
  const containerRect = scrollEl.getBoundingClientRect();
  const spaceAbove = bubbleRect.top - containerRect.top;
  return spaceAbove < EST_TOOLBAR_PX + GAP_PX;
}
