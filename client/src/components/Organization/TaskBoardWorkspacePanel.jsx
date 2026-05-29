import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, Circle, Eye, GripVertical, MoreHorizontal, Pencil, Plus, X } from 'lucide-react';
import TaskBoardCardActionsMenu from './TaskBoardCardActionsMenu';
import TaskBoardCardDetailModal from './TaskBoardCardDetailModal';
import TaskBoardListActionsMenu from './TaskBoardListActionsMenu';
import { labelById, parseCardLabelIds } from './taskBoardCardLabels';

const LIST_WIDTH = 'w-[272px]';
const CARD_OVERLAY_WIDTH = 'w-[248px]';
const COLUMN_ENTER =
  'animate-[taskBoardColumnIn_280ms_ease-out] motion-reduce:animate-none';

const cardSortId = (cardId) => `card-${cardId}`;
const parseCardSortId = (id) => String(id).replace(/^card-/, '');
const listColId = (listId) => `list-col-${listId}`;
const listCardsDropId = (listId) => `list-cards-${listId}`;
const parseListColId = (id) => String(id).replace(/^list-col-/, '');
const parseListCardsDropId = (id) => String(id).replace(/^list-cards-/, '');

function sortCardsByPosition(a, b) {
  const pa = Number(a?.position) || 0;
  const pb = Number(b?.position) || 0;
  if (pa !== pb) return pa - pb;
  return new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0);
}

function assigneeInitials(person) {
  const base = String(person?.displayName || person?.name || person?.username || person?.avatar || '').trim();
  if (!base) {
    const tail = String(person?.userId || '').trim().slice(-2).toUpperCase();
    return tail || '??';
  }
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1 && parts[0].length <= 3) return parts[0].toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

function cardAssignees(card) {
  const list = Array.isArray(card?.assignees) ? card.assignees : [];
  if (list.length > 0) {
    return list.map((m) => ({
      ...m,
      displayName: String(m?.displayName || m?.name || m?.username || card?.assigneeName || '').trim(),
    }));
  }
  if (card?.assigneeId) {
    return [
      {
        userId: String(card.assigneeId),
        displayName: String(card.assigneeName || '').trim(),
      },
    ];
  }
  return [];
}

function buildListMap(boardDetail, optimisticLists) {
  const lists = [
    ...(Array.isArray(boardDetail?.lists) ? boardDetail.lists : []),
    ...optimisticLists,
  ];
  const cards = Array.isArray(boardDetail?.cards) ? boardDetail.cards : [];
  const byList = new Map(lists.map((l) => [String(l._id), { ...l, cards: [] }]));
  for (const card of cards) {
    const key = String(card?.listId || '');
    if (!byList.has(key)) continue;
    byList.get(key).cards.push(card);
  }
  for (const list of byList.values()) {
    list.cards.sort(sortCardsByPosition);
  }
  return [...byList.values()].sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function buildCardItemsByList(listMap) {
  const out = {};
  for (const list of listMap) {
    out[String(list._id)] = [...(list.cards || [])].sort(sortCardsByPosition);
  }
  return out;
}

function findCardContainer(cardId, itemsByList) {
  const cid = String(cardId);
  return Object.keys(itemsByList).find((listId) =>
    (itemsByList[listId] || []).some((c) => String(c._id) === cid)
  );
}

function KanbanListColumn({
  list,
  isDarkMode,
  listColumnShell,
  columnEnterClass,
  onMenuClick,
  cardSortableIds,
  isCardsOver,
  children,
}) {
  const listId = String(list._id);
  const { setNodeRef: setListDragRef, setActivatorNodeRef, attributes, listeners, transform, isDragging } =
    useDraggable({
      id: listColId(listId),
      data: { type: 'list', listId },
    });
  const { setNodeRef: setCardsDropRef } = useDroppable({
    id: listCardsDropId(listId),
    data: { type: 'list-cards', listId },
  });
  const { setNodeRef: setListColDropRef, isOver: isListColOver } = useDroppable({
    id: listColId(listId),
    data: { type: 'list-col', listId },
  });

  const setColumnRef = (node) => {
    setListDragRef(node);
    setListColDropRef(node);
  };

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: isDragging ? 40 : undefined }
    : undefined;

  return (
    <div
      ref={setColumnRef}
      style={style}
      className={`${LIST_WIDTH} shrink-0 ${columnEnterClass} flex max-h-full flex-col rounded-xl border transition-shadow duration-300 ${listColumnShell} ${
        list.isOptimistic ? 'opacity-90' : ''
      } ${isListColOver || isCardsOver ? 'ring-2 ring-cyan-400/50' : ''} ${isDragging ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className={`shrink-0 cursor-grab rounded p-0.5 active:cursor-grabbing ${
            isDarkMode ? 'text-slate-500 hover:bg-white/10' : 'text-slate-400 hover:bg-slate-200'
          }`}
          aria-label="Kéo danh sách"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{list.title}</h3>
        {list.isWatching || list.watcherCount > 0 ? (
          <span
            className={`flex items-center gap-0.5 text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}
            title="Người theo dõi"
          >
            <Eye className="h-3 w-3" />
            {list.watcherCount > 0 ? list.watcherCount : ''}
          </span>
        ) : null}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMenuClick(e);
          }}
          className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-200'}`}
          aria-label="Thao tác danh sách"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div ref={setCardsDropRef} className="flex min-h-0 flex-1 flex-col">
        <SortableContext items={cardSortableIds} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </div>
  );
}

function KanbanSortableCard({
  card,
  isDarkMode,
  cardShell,
  onOpenDetail,
  onOpenMenu,
  onToggleComplete,
  renderCardBody,
}) {
  const id = cardSortId(card._id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { type: 'card', cardId: String(card._id), listId: String(card.listId) },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="touch-none">
      <div
        {...listeners}
        {...attributes}
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(card)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onOpenDetail(card);
        }}
        className={`group relative cursor-grab rounded-lg border px-2 py-2 text-xs transition-shadow hover:shadow-md active:cursor-grabbing ${cardShell}`}
      >
        {renderCardBody(card, { onOpenMenu, onToggleComplete })}
      </div>
    </div>
  );
}

export default function TaskBoardWorkspacePanel({
  isDarkMode,
  workspaceSlug = '',
  boards = [],
  accessibleBoards = [],
  selectedBoardId = '',
  boardDetail = null,
  boardBackground = '',
  loadingBoards = false,
  loadingBoardDetail = false,
  onAddList,
  onAddCard,
  onMoveCard,
  onUpdateCard,
  onReorderList,
  onRefresh,
}) {
  const [optimisticLists, setOptimisticLists] = useState([]);
  const [addingListOpen, setAddingListOpen] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [submittingList, setSubmittingList] = useState(false);
  const [cardDraftByList, setCardDraftByList] = useState({});
  const [cardComposerOpen, setCardComposerOpen] = useState({});
  const [menuList, setMenuList] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [cardMenuCard, setCardMenuCard] = useState(null);
  const [cardMenuAnchor, setCardMenuAnchor] = useState(null);
  const [detailCard, setDetailCard] = useState(null);
  const [detailPanel, setDetailPanel] = useState('detail');
  const [draggingListId, setDraggingListId] = useState('');
  const [draggingCard, setDraggingCard] = useState(null);
  const [cardItemsByList, setCardItemsByList] = useState({});
  const [cardsOverListId, setCardsOverListId] = useState('');
  const boardScrollRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  useEffect(() => {
    setOptimisticLists([]);
    setAddingListOpen(false);
    setNewListTitle('');
    setCardComposerOpen({});
    setCardDraftByList({});
  }, [selectedBoardId]);

  useEffect(() => {
    if (!detailCard || !boardDetail?.cards) return;
    const fresh = boardDetail.cards.find((c) => String(c._id) === String(detailCard._id));
    if (fresh) setDetailCard(fresh);
  }, [boardDetail, detailCard?._id]);

  const listMap = useMemo(
    () => buildListMap(boardDetail, optimisticLists),
    [boardDetail, optimisticLists]
  );

  const skipCardLayoutSyncRef = useRef(false);
  const cardDragSnapshotRef = useRef({ cardId: '', listId: '', index: -1 });

  useEffect(() => {
    if (skipCardLayoutSyncRef.current) return;
    if (!selectedBoardId || loadingBoardDetail || !boardDetail) {
      if (!selectedBoardId) setCardItemsByList({});
      return;
    }
    setCardItemsByList(buildCardItemsByList(listMap));
  }, [selectedBoardId, loadingBoardDetail, boardDetail, listMap]);

  const boardSurfaceStyle = useMemo(() => {
    if (!boardBackground || !String(boardBackground).trim()) return undefined;
    const bg = String(boardBackground).trim();
    if (bg.startsWith('linear-gradient') || bg.startsWith('url(')) {
      return { background: bg };
    }
    return { backgroundColor: bg };
  }, [boardBackground]);

  const handleSubmitNewList = useCallback(async () => {
    const title = String(newListTitle || '').trim();
    if (!title || submittingList) return;

    const tempId = `temp-list-${Date.now()}`;
    const optimistic = {
      _id: tempId,
      title,
      order: (listMap.length + 1) * 1000,
      isOptimistic: true,
    };

    setOptimisticLists((prev) => [...prev, optimistic]);
    setNewListTitle('');
    setAddingListOpen(false);
    setSubmittingList(true);

    try {
      await onAddList?.(title);
      setOptimisticLists((prev) => prev.filter((l) => String(l._id) !== tempId));
    } catch {
      setOptimisticLists((prev) => prev.filter((l) => String(l._id) !== tempId));
      setAddingListOpen(true);
      setNewListTitle(title);
    } finally {
      setSubmittingList(false);
    }
  }, [newListTitle, submittingList, listMap.length, onAddList]);

  const listColumnShell = isDarkMode
    ? 'bg-[#22272b]/95 border-white/10 text-slate-100'
    : 'bg-slate-100/95 border-slate-200 text-slate-900';

  const cardShell = isDarkMode
    ? 'bg-[#2b3038] border-white/10 text-slate-100 shadow-sm'
    : 'bg-white border-slate-200 text-slate-900 shadow-sm';

  const boardsForMove = accessibleBoards.length ? accessibleBoards : boards;

  const handleListDragEnd = useCallback(
    (event) => {
      const { active, over } = event;
      setDraggingListId('');
      if (!over || !active) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (!activeId.startsWith('list-col-') || !overId.startsWith('list-col-')) return;
      const fromId = parseListColId(activeId);
      const toId = parseListColId(overId);
      if (fromId === toId) return;
      const toIndex = listMap.findIndex((l) => String(l._id) === toId);
      if (toIndex < 0) return;
      onReorderList?.(fromId, toIndex + 1);
    },
    [listMap, onReorderList]
  );

  const handleCardDragStart = useCallback((event) => {
    const activeId = String(event.active.id);
    if (!activeId.startsWith('card-')) return;
    skipCardLayoutSyncRef.current = true;
    const cardId = parseCardSortId(activeId);
    const listId = findCardContainer(cardId, cardItemsByList);
    const card = (cardItemsByList[listId] || []).find((c) => String(c._id) === cardId);
    if (card) setDraggingCard(card);
    setDraggingListId('');
  }, [cardItemsByList]);

  const handleCardDragOver = useCallback((event) => {
    const { active, over } = event;
    if (!over || !active) return;
    const activeId = String(active.id);
    if (!activeId.startsWith('card-')) return;

    const activeCardId = parseCardSortId(activeId);
    const overId = String(over.id);
    const activeContainer = findCardContainer(activeCardId, cardItemsByList);
    let overContainer = '';
    if (overId.startsWith('list-cards-')) {
      overContainer = parseListCardsDropId(overId);
    } else if (overId.startsWith('card-')) {
      overContainer = findCardContainer(parseCardSortId(overId), cardItemsByList);
    }
    if (!activeContainer || !overContainer) return;
    setCardsOverListId(overContainer);

    if (activeContainer === overContainer && !overId.startsWith('list-cards-')) {
      const overCardId = parseCardSortId(overId);
      if (activeCardId === overCardId) return;
    }

    setCardItemsByList((prev) => {
      const activeItems = [...(prev[activeContainer] || [])];
      const overItems = activeContainer === overContainer ? activeItems : [...(prev[overContainer] || [])];
      const activeIndex = activeItems.findIndex((c) => String(c._id) === activeCardId);
      if (activeIndex < 0) return prev;

      let newIndex;
      if (overId.startsWith('list-cards-')) {
        newIndex = overItems.length;
      } else {
        const overIndex = overItems.findIndex((c) => String(c._id) === parseCardSortId(overId));
        if (overIndex < 0) return prev;
        const isBelow =
          active.rect.current?.translated &&
          over.rect &&
          active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        newIndex = overIndex + (isBelow ? 1 : 0);
      }

      let nextState;
      if (activeContainer === overContainer) {
        if (newIndex > activeIndex) newIndex -= 1;
        if (newIndex === activeIndex) return prev;
        nextState = {
          ...prev,
          [activeContainer]: arrayMove(activeItems, activeIndex, newIndex),
        };
      } else {
        const itemsCopy = [...activeItems];
        const [moved] = itemsCopy.splice(activeIndex, 1);
        const nextOver = [...overItems];
        nextOver.splice(newIndex, 0, { ...moved, listId: overContainer });
        nextState = {
          ...prev,
          [activeContainer]: itemsCopy,
          [overContainer]: nextOver,
        };
      }

      const targetListId = activeContainer === overContainer ? activeContainer : overContainer;
      const targetIndex = (nextState[targetListId] || []).findIndex((c) => String(c._id) === activeCardId);
      if (targetIndex >= 0) {
        cardDragSnapshotRef.current = { cardId: activeCardId, listId: targetListId, index: targetIndex };
      }
      return nextState;
    });
  }, [cardItemsByList]);

  const handleCardDragEnd = useCallback(
    async (event) => {
      const { active, over } = event;
      const activeCardId = parseCardSortId(String(active.id));
      setDraggingCard(null);
      setCardsOverListId('');

      const releaseCardLayoutLock = () => {
        skipCardLayoutSyncRef.current = false;
      };

      if (!over) {
        setCardItemsByList(buildCardItemsByList(listMap));
        releaseCardLayoutLock();
        return;
      }

      const snap = cardDragSnapshotRef.current;
      const listId =
        snap.cardId === activeCardId && snap.listId
          ? snap.listId
          : findCardContainer(activeCardId, cardItemsByList);
      const index =
        snap.cardId === activeCardId && snap.index >= 0
          ? snap.index
          : (cardItemsByList[listId] || []).findIndex((c) => String(c._id) === activeCardId);

      if (!listId || index < 0) {
        setCardItemsByList(buildCardItemsByList(listMap));
        releaseCardLayoutLock();
        return;
      }

      try {
        await onMoveCard?.(activeCardId, listId, index);
        setDetailCard((prev) =>
          prev && String(prev._id) === activeCardId ? { ...prev, listId } : prev
        );
      } catch {
        setCardItemsByList(buildCardItemsByList(listMap));
      } finally {
        releaseCardLayoutLock();
      }
    },
    [cardItemsByList, listMap, onMoveCard]
  );

  const handleDragStart = useCallback(
    (event) => {
      const id = String(event.active.id);
      if (id.startsWith('card-')) {
        handleCardDragStart(event);
        return;
      }
      if (id.startsWith('list-col-')) {
        setDraggingCard(null);
        setDraggingListId(parseListColId(id));
      }
    },
    [handleCardDragStart]
  );

  const handleDragEnd = useCallback(
    (event) => {
      const id = String(event.active.id);
      if (id.startsWith('card-')) {
        handleCardDragEnd(event);
        return;
      }
      if (id.startsWith('list-col-')) {
        handleListDragEnd(event);
      }
    },
    [handleCardDragEnd, handleListDragEnd]
  );

  const handleDragCancel = useCallback(() => {
    setDraggingListId('');
    setDraggingCard(null);
    setCardsOverListId('');
    setCardItemsByList(buildCardItemsByList(listMap));
    skipCardLayoutSyncRef.current = false;
  }, [listMap]);

  const openListMenu = (list, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuAnchor(rect);
    setMenuList(list);
  };

  const openCardMenu = (card, event) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setCardMenuAnchor(rect);
    setCardMenuCard(card);
  };

  const openCardDetail = (card, panel = 'detail') => {
    setDetailCard(card);
    setDetailPanel(panel);
  };

  const listTitleForCard = (card) => {
    const list = listMap.find((l) => String(l._id) === String(card?.listId || ''));
    return list?.title || '';
  };

  const toggleCardComplete = async (card, event) => {
    event.stopPropagation();
    const isDone = String(card?.status || '') === 'done';
    try {
      await onUpdateCard?.(String(card._id), { status: isDone ? 'todo' : 'done' });
    } catch {
      /* toast from parent */
    }
  };

  const renderCardBody = (card, { onOpenMenu, onToggleComplete }) => {
    const labelIds = parseCardLabelIds(card.tags);
    const isDone = String(card?.status || '') === 'done';
    const assignees = cardAssignees(card);
    const visibleAssignees = assignees.length > 3 ? assignees.slice(0, 2) : assignees.slice(0, 3);
    const overflowAssigneeCount = assignees.length > 3 ? assignees.length - 2 : 0;
    return (
      <>
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onToggleComplete(card, e)}
            title={isDone ? 'Đánh dấu chưa hoàn tất' : 'Đánh dấu hoàn tất'}
            className="mt-0.5 shrink-0 rounded-full"
          >
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <Circle className={`h-4 w-4 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            )}
          </button>
          <div className="min-w-0 flex-1 pr-5">
            {labelIds.length > 0 ? (
              <div className="mb-1.5 flex flex-wrap gap-1">
                {labelIds.map((id) => {
                  const l = labelById(id);
                  if (!l) return null;
                  return (
                    <span
                      key={id}
                      className="h-1.5 min-w-[32px] flex-1 rounded-full"
                      style={{ backgroundColor: l.color, maxWidth: 48 }}
                    />
                  );
                })}
              </div>
            ) : null}
            <div className={`font-semibold ${isDone ? 'text-slate-400 line-through' : ''}`}>{card.title}</div>
          </div>
        </div>
        {card.dueDate ? (
          <div className={`mt-1 text-[10px] ${isDarkMode ? 'text-amber-300/90' : 'text-amber-700'}`}>
            {new Date(card.dueDate).toLocaleDateString('vi-VN')}
          </div>
        ) : null}
        {visibleAssignees.length > 0 ? (
          <div className="mt-1.5 flex items-center gap-1">
            {visibleAssignees.map((m, idx) => (
              <span
                key={`${m.userId || m.displayName || 'assignee'}-${idx}`}
                title={m.displayName || 'Thành viên phụ trách'}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-semibold text-white"
              >
                {assigneeInitials(m)}
              </span>
            ))}
            {overflowAssigneeCount > 0 ? (
              <span
                className={`text-[10px] font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}
                title={`${overflowAssigneeCount} thành viên khác`}
              >
                +{overflowAssigneeCount}
              </span>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          title="Chỉnh sửa thẻ"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => onOpenMenu(card, e)}
          className={`absolute right-1.5 top-1.5 rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 ${
            isDarkMode ? 'hover:bg-white/15' : 'hover:bg-slate-200'
          }`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <style>{`
        @keyframes taskBoardColumnIn {
          from {
            opacity: 0;
            transform: translateX(-16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>

      {!loadingBoards && boards.length === 0 ? (
        <div
          className={`m-4 rounded-xl border border-dashed p-4 text-sm ${
            isDarkMode ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600'
          }`}
        >
          Chưa có Task Board. Chuột phải vào team ở cột trái → «Tạo Task Board».
        </div>
      ) : !selectedBoardId ? (
        <div
          className={`m-4 rounded-xl border border-dashed p-4 text-sm ${
            isDarkMode ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600'
          }`}
        >
          Chọn một Task Board để xem danh sách và công việc.
        </div>
      ) : loadingBoardDetail ? (
        <div className={`m-4 rounded-xl p-4 text-sm ${isDarkMode ? 'bg-white/5 text-slate-300' : 'bg-white text-slate-600'}`}>
          Đang tải nội dung board...
        </div>
      ) : (
        <div
          ref={boardScrollRef}
          className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-3 pb-4 pt-3"
          style={boardSurfaceStyle}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleCardDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="flex h-full min-h-[min(520px,calc(100vh-220px))] items-start gap-3">
              {listMap.map((list) => {
                const listKey = String(list._id);
                const composerOpen = Boolean(cardComposerOpen[listKey]);
                const listCards = cardItemsByList[listKey] || [];
                const cardSortableIds = listCards.map((c) => cardSortId(c._id));
                return (
                  <KanbanListColumn
                    key={listKey}
                    list={list}
                    isDarkMode={isDarkMode}
                    listColumnShell={listColumnShell}
                    columnEnterClass={COLUMN_ENTER}
                    onMenuClick={(e) => openListMenu(list, e)}
                    cardSortableIds={cardSortableIds}
                    isCardsOver={cardsOverListId === listKey}
                  >
                  <div className="scrollbar-overlay min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-1">
                    {listCards.map((card) => (
                      <KanbanSortableCard
                        key={card._id}
                        card={card}
                        isDarkMode={isDarkMode}
                        cardShell={cardShell}
                        onOpenDetail={(c) => openCardDetail(c, 'detail')}
                        onOpenMenu={openCardMenu}
                        onToggleComplete={toggleCardComplete}
                        renderCardBody={renderCardBody}
                      />
                    ))}
                  </div>

                  <div className="p-2 pt-0">
                    {composerOpen ? (
                      <div className="space-y-2">
                        <textarea
                          value={cardDraftByList[listKey] || ''}
                          onChange={(e) =>
                            setCardDraftByList((prev) => ({ ...prev, [listKey]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Nhập tiêu đề thẻ..."
                          className={`w-full resize-none rounded-lg border px-2 py-1.5 text-xs outline-none ${
                            isDarkMode
                              ? 'border-white/15 bg-[#1a1d26] text-white'
                              : 'border-slate-200 bg-white text-slate-900'
                          }`}
                          autoFocus
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!String(cardDraftByList[listKey] || '').trim()}
                            onClick={() => {
                              const title = String(cardDraftByList[listKey] || '').trim();
                              if (!title) return;
                              onAddCard?.(list._id, { listId: list._id, title });
                              setCardDraftByList((prev) => ({ ...prev, [listKey]: '' }));
                              setCardComposerOpen((prev) => ({ ...prev, [listKey]: false }));
                            }}
                            className="rounded-md bg-[#5865F2] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            Thêm thẻ
                          </button>
                          <button
                            type="button"
                            className={`rounded-md p-1 ${
                              isDarkMode ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-200'
                            }`}
                            onClick={() => {
                              setCardComposerOpen((prev) => ({ ...prev, [listKey]: false }));
                              setCardDraftByList((prev) => ({ ...prev, [listKey]: '' }));
                            }}
                            aria-label="Đóng"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCardComposerOpen((prev) => ({ ...prev, [listKey]: true }))}
                        className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                          isDarkMode
                            ? 'text-slate-300 hover:bg-white/10'
                            : 'text-slate-600 hover:bg-slate-200/80'
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Thêm thẻ
                      </button>
                    )}
                  </div>
                  </KanbanListColumn>
                );
              })}

            <div
              className={`${LIST_WIDTH} shrink-0 transition-all duration-300 ease-out`}
              style={{ transitionProperty: 'transform, opacity, margin' }}
            >
              {addingListOpen ? (
                <div
                  className={`rounded-xl border p-2 shadow-lg ${listColumnShell} animate-[taskBoardColumnIn_220ms_ease-out]`}
                >
                  <input
                    value={newListTitle}
                    onChange={(e) => setNewListTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmitNewList();
                      }
                      if (e.key === 'Escape') {
                        setAddingListOpen(false);
                        setNewListTitle('');
                      }
                    }}
                    placeholder="Nhập tên danh sách..."
                    className={`w-full rounded-lg border px-2.5 py-2 text-sm outline-none ${
                      isDarkMode
                        ? 'border-white/15 bg-[#1a1d26] text-white placeholder:text-slate-500'
                        : 'border-slate-200 bg-white text-slate-900'
                    }`}
                    autoFocus
                    disabled={submittingList}
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!newListTitle.trim() || submittingList}
                      onClick={handleSubmitNewList}
                      className="rounded-md bg-[#5865F2] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {submittingList ? 'Đang thêm...' : 'Thêm danh sách'}
                    </button>
                    <button
                      type="button"
                      disabled={submittingList}
                      onClick={() => {
                        setAddingListOpen(false);
                        setNewListTitle('');
                      }}
                      className={`rounded-md p-1.5 ${
                        isDarkMode ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-200'
                      }`}
                      aria-label="Hủy"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingListOpen(true)}
                  className={`flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm font-medium transition-all duration-300 ease-out hover:brightness-110 ${
                    isDarkMode
                      ? 'bg-white/15 text-slate-200 hover:bg-white/20'
                      : 'bg-slate-200/90 text-slate-700 hover:bg-slate-300/90'
                  }`}
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Thêm danh sách khác
                </button>
              )}
            </div>
            </div>
            <DragOverlay dropAnimation={null}>
              {draggingCard ? (
                <div
                  className={`${CARD_OVERLAY_WIDTH} cursor-grabbing rounded-lg border px-2 py-2 text-xs shadow-2xl ${cardShell}`}
                >
                  {renderCardBody(draggingCard, {
                    onOpenMenu: () => {},
                    onToggleComplete: (c, e) => e.stopPropagation(),
                  })}
                </div>
              ) : draggingListId ? (
                <div
                  className={`${LIST_WIDTH} rounded-xl border p-2 opacity-90 shadow-2xl ${listColumnShell}`}
                >
                  <div className="truncate text-sm font-semibold">
                    {listMap.find((l) => String(l._id) === draggingListId)?.title || ''}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      <TaskBoardListActionsMenu
        isOpen={Boolean(menuList && menuAnchor)}
        anchorRect={menuAnchor}
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        list={menuList}
        lists={listMap}
        boards={boardsForMove}
        currentBoardId={selectedBoardId}
        onClose={() => {
          setMenuList(null);
          setMenuAnchor(null);
        }}
        onOpenAddCard={() => {
          if (!menuList) return;
          setCardComposerOpen((prev) => ({ ...prev, [String(menuList._id)]: true }));
        }}
        onRefresh={onRefresh}
      />

      <TaskBoardCardActionsMenu
        isOpen={Boolean(cardMenuCard && cardMenuAnchor)}
        anchorRect={cardMenuAnchor}
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        card={cardMenuCard}
        lists={listMap}
        currentBoardId={selectedBoardId}
        onClose={() => {
          setCardMenuCard(null);
          setCardMenuAnchor(null);
        }}
        onOpenCard={(c, panel) => openCardDetail(c, panel)}
        onRefresh={onRefresh}
      />

      <TaskBoardCardDetailModal
        isOpen={Boolean(detailCard)}
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        card={detailCard}
        boardId={selectedBoardId}
        listTitle={detailCard ? listTitleForCard(detailCard) : ''}
        lists={listMap}
        initialPanel={detailPanel}
        onClose={() => {
          setDetailCard(null);
          setDetailPanel('detail');
        }}
        onRefresh={onRefresh}
        onUpdateCard={async (cardId, patch) => {
          await onUpdateCard?.(cardId, patch);
          setDetailCard((prev) => (prev && String(prev._id) === String(cardId) ? { ...prev, ...patch } : prev));
        }}
      />
    </div>
  );
}
