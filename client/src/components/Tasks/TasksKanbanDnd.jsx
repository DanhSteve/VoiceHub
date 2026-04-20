import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GlassCard } from '../Shared';

export const COL_TODO = 'col-todo';
export const COL_PROGRESS = 'col-progress';
export const COL_DONE = 'col-done';

function overlayOptsForStatus(status) {
  if (status === 'done') return { glow: false, doneStyle: true };
  if (status === 'in_progress' || status === 'review') return { glow: true, doneStyle: false };
  return { glow: false, doneStyle: false };
}

function DroppableColumn({ id, children, className = '', isDarkMode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const ringOver = isDarkMode
    ? 'ring-purple-500/60 ring-offset-transparent'
    : 'ring-cyan-500/45 ring-offset-sky-50/80';
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[120px] rounded-xl transition-[box-shadow] ${className} ${
        isOver ? `ring-2 ${ringOver} ring-offset-2` : ''
      }`}
    >
      {children}
    </div>
  );
}

function DraggableTaskCard({ id, task, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { task },
  });
  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} className={`touch-none ${isDragging ? 'opacity-[0.28]' : ''}`}>
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing outline-none">
        {children}
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {{ todo: object[], inProgress: object[], done: object[] }} props.columns
 * @param {(task: object) => string} props.getAssigneeLabel
 * @param {(task: object) => void} props.onCardClick
 * @param {(task: object, fromCol: string, toCol: string) => void} props.onDropOnColumn — COL_TODO | COL_PROGRESS | COL_DONE
 * @param {(task: object, assigneeLabel: string, opts: { glow: boolean, doneStyle: boolean }) => React.ReactNode} props.renderCardInner
 */
export default function TasksKanbanDnd({ columns, getAssigneeLabel, onCardClick, onDropOnColumn, renderCardInner }) {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const [activeTask, setActiveTask] = useState(null);
  const cardSurface = isDarkMode
    ? ''
    : '!border !border-slate-200/90 !bg-white/95 shadow-sm !backdrop-blur-sm';
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 10 },
    })
  );

  const handleDragStart = (event) => {
    const t = event.active?.data?.current?.task;
    setActiveTask(t || null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over || !active) return;
    const task = active.data?.current?.task;
    if (!task) return;
    const overId = String(over.id);
    if (!overId.startsWith('col-')) return;

    const fromStatus = task.status;
    const fromCol =
      fromStatus === 'done'
        ? COL_DONE
        : fromStatus === 'in_progress' || fromStatus === 'review'
          ? COL_PROGRESS
          : COL_TODO;

    if (overId === fromCol) return;
    onDropOnColumn(task, fromCol, overId);
  };

  const handleDragCancel = () => setActiveTask(null);

  const wrapCard = (task, opts) => {
    const dragId = `task-${task._id}`;
    return (
      <DraggableTaskCard key={dragId} id={dragId} task={task}>
        <GlassCard
          hover
          glow={opts.glow}
          className={`group animate-slideUp ${opts.doneStyle ? 'opacity-80 hover:opacity-100' : ''} ${cardSurface}`}
          onClick={(e) => {
            e.stopPropagation();
            onCardClick(task);
          }}
        >
          {renderCardInner(task, getAssigneeLabel(task), opts)}
        </GlassCard>
      </DraggableTaskCard>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-cyan-600 to-teal-600" />
              <h2
                className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
              >
                {t('tasks.statusTodo')}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-sm font-bold ${
                  isDarkMode ? 'glass' : 'border border-slate-200 bg-slate-100 text-slate-800'
                }`}
              >
                {columns.todo.length}
              </span>
            </div>
          </div>
          <DroppableColumn id={COL_TODO} isDarkMode={isDarkMode} className="space-y-3 flex-1 pb-2">
            {columns.todo.map((t) => wrapCard(t, { glow: false, doneStyle: false }))}
          </DroppableColumn>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-pulse" />
              <h2
                className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
              >
                {t('tasks.statusInProgress')}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-sm font-bold ${
                  isDarkMode ? 'glass' : 'border border-slate-200 bg-slate-100 text-slate-800'
                }`}
              >
                {columns.inProgress.length}
              </span>
            </div>
          </div>
          <DroppableColumn id={COL_PROGRESS} isDarkMode={isDarkMode} className="space-y-3 flex-1 pb-2">
            {columns.inProgress.map((t) => wrapCard(t, { glow: true, doneStyle: false }))}
          </DroppableColumn>
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-500 to-emerald-500" />
              <h2
                className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
              >
                {t('tasks.statusDone')}
              </h2>
              <span
                className={`px-2 py-0.5 rounded-full text-sm font-bold ${
                  isDarkMode ? 'glass' : 'border border-slate-200 bg-slate-100 text-slate-800'
                }`}
              >
                {columns.done.length}
              </span>
            </div>
          </div>
          <DroppableColumn id={COL_DONE} isDarkMode={isDarkMode} className="space-y-3 flex-1 pb-2">
            {columns.done.map((t) => wrapCard(t, { glow: false, doneStyle: true }))}
          </DroppableColumn>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 220, easing: 'ease' }}>
        {activeTask ? (
          <div className="w-[min(100%,320px)] rotate-1 scale-[1.02] opacity-90 shadow-2xl pointer-events-none">
            <GlassCard
              className={`ring-2 ${isDarkMode ? 'ring-purple-500/40' : 'ring-cyan-500/35 border border-slate-200/90 !bg-white/95'} ${cardSurface}`}
            >
              {renderCardInner(
                activeTask,
                getAssigneeLabel(activeTask),
                overlayOptsForStatus(activeTask.status)
              )}
            </GlassCard>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
