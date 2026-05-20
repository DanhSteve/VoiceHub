import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import {
  TIER_META,
  TIER_ORDER,
  groupRolesByTier,
  moveRoleInColumns,
  normalizeRoleDisplayName,
  prioritiesFromColumns,
  resolveRoleTier,
} from './roleRbacUtils';

function DroppableTierColumn({ id, children, className = '', isOver }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] rounded-2xl transition-shadow ${className} ${
        isOver ? 'ring-2 ring-violet-400/50 ring-offset-2 ring-offset-[#0a0f1a]' : ''
      }`}
    >
      {children}
    </div>
  );
}

function DraggableRoleCard({ id, role, children }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { role },
  });

  return (
    <div
      ref={setNodeRef}
      className={`touch-none ${isDragging ? 'opacity-[0.28]' : ''}`}
    >
      <div
        {...listeners}
        {...attributes}
        className="flex cursor-grab gap-1 outline-none active:cursor-grabbing"
      >
        <span className="mt-2 flex shrink-0 items-start rounded-lg p-1 text-slate-500">
          <GripVertical className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function RoleCardContent({ role, onNameClick, onEdit, onDelete, isOverlay = false }) {
  const tierMeta = TIER_META.find((t) => t.id === resolveRoleTier(role));
  return (
    <div
      className={`group rounded-xl border border-slate-700/90 bg-[#0c1220] p-3 shadow-sm transition hover:border-slate-600 ${
        isOverlay ? 'shadow-2xl ring-2 ring-violet-500/40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onNameClick?.(role)}
          className="min-w-0 flex-1 text-left"
          title="Chi tiết vai trò"
          tabIndex={isOverlay ? -1 : undefined}
        >
          <div className="truncate text-sm font-bold text-white group-hover:text-violet-200">
            {normalizeRoleDisplayName(role.name)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            <span>Quyền kênh: cài đặt từng kênh</span>
            {tierMeta?.hint ? (
              <span className="mt-0.5 block truncate text-slate-600">{tierMeta.hint}</span>
            ) : null}
          </div>
        </button>
        {!isOverlay && (
          <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
            <button
              type="button"
              onClick={() => onEdit?.(role)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              title="Sửa"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete?.(role)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
              title="Xóa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RoleCardOverlay({ role, width }) {
  return (
    <div
      className="pointer-events-none cursor-grabbing"
      style={width ? { width: `${width}px` } : { minWidth: 220, maxWidth: 320 }}
    >
      <div className="flex gap-1 rotate-[0.5deg] scale-[1.02]">
        <span className="mt-2 flex shrink-0 p-1 text-slate-400">
          <GripVertical className="h-4 w-4" aria-hidden />
        </span>
        <RoleCardContent role={role} isOverlay />
      </div>
    </div>
  );
}

/**
 * Kanban 4 cấp vai trò (Điều hành / Khối / Phòng / Team) — lưu qua priority API.
 */
export default function RoleHierarchyKanban({
  roles,
  disabled = false,
  onRoleNameClick,
  onEdit,
  onDelete,
  onHierarchyPersist,
}) {
  const [columns, setColumns] = useState(() => groupRolesByTier(roles));
  const [activeRole, setActiveRole] = useState(null);
  const [overlayWidth, setOverlayWidth] = useState(null);
  const [overColumnId, setOverColumnId] = useState(null);

  useEffect(() => {
    setColumns(groupRolesByTier(roles));
  }, [roles]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const handleDragStart = (event) => {
    const role = event.active?.data?.current?.role;
    setActiveRole(role || null);
    const w = event.active?.rect?.current?.initial?.width;
    setOverlayWidth(w && w > 0 ? w : null);
  };

  const handleDragOver = (event) => {
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) {
      setOverColumnId(null);
      return;
    }
    if (TIER_ORDER.includes(overId)) {
      setOverColumnId(overId);
      return;
    }
    for (const tier of TIER_ORDER) {
      if ((columns[tier] || []).some((r) => String(r.id) === overId)) {
        setOverColumnId(tier);
        return;
      }
    }
    setOverColumnId(null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveRole(null);
    setOverlayWidth(null);
    setOverColumnId(null);
    if (!over || !active || disabled) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const nextColumns = moveRoleInColumns(columns, activeId, overId);
    if (!nextColumns) return;

    const prevSerialized = JSON.stringify(prioritiesFromColumns(columns));
    const nextUpdates = prioritiesFromColumns(nextColumns);
    const nextSerialized = JSON.stringify(nextUpdates);
    setColumns(nextColumns);

    if (prevSerialized !== nextSerialized && onHierarchyPersist) {
      await onHierarchyPersist(nextUpdates);
    }
  };

  const clearDrag = () => {
    setActiveRole(null);
    setOverlayWidth(null);
    setOverColumnId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDrag}
    >
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {TIER_META.map((tier) => (
          <DroppableTierColumn
            key={tier.id}
            id={tier.id}
            isOver={overColumnId === tier.id}
            className={`border bg-gradient-to-b ${tier.accent} ${tier.border} p-3`}
          >
            <div className="mb-3">
              <h4 className="text-sm font-bold text-white">{tier.title}</h4>
              <p className="text-[11px] text-slate-400">{tier.hint}</p>
              <p className="mt-1 text-[10px] text-slate-500">
                {(columns[tier.id] || []).length} vai trò
              </p>
            </div>
            <div className="space-y-2">
              {(columns[tier.id] || []).map((role) => (
                <DraggableRoleCard key={role.id} id={String(role.id)} role={role}>
                  <RoleCardContent
                    role={role}
                    onNameClick={onRoleNameClick}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                </DraggableRoleCard>
              ))}
              {(columns[tier.id] || []).length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-700/60 px-3 py-6 text-center text-xs text-slate-500">
                  Kéo vai trò vào đây
                </p>
              )}
            </div>
          </DroppableTierColumn>
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
        {activeRole ? <RoleCardOverlay role={activeRole} width={overlayWidth} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
