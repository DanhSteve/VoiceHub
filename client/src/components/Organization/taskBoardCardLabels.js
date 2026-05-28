/** Nhãn màu kiểu Trello — lưu id trong task.tags */
export const TASK_BOARD_LABELS = [
  { id: 'green', color: '#61bd4f' },
  { id: 'yellow', color: '#f2d600' },
  { id: 'orange', color: '#ff9f1a' },
  { id: 'red', color: '#eb5a46' },
  { id: 'purple', color: '#c377e0' },
  { id: 'blue', color: '#0079bf' },
];

export function labelById(id) {
  return TASK_BOARD_LABELS.find((l) => l.id === id);
}

export function parseCardLabelIds(tags) {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t) => TASK_BOARD_LABELS.some((l) => l.id === t));
}
