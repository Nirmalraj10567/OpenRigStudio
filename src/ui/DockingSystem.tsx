import { useRef, useState, type ReactNode } from 'react';

export type DockPlacement = 'right' | 'bottom';

export interface DockLayoutState<T extends string> {
  placement: DockPlacement;
  collapsed: boolean;
  width: number;
  height: number;
  tabOrder: T[];
}

export interface DockTabDefinition<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

export const DOCK_LAYOUT_STORAGE_KEY = 'character-studio-dock-layout:v1';

export function defaultDockLayout<T extends string>(tabs: readonly T[]): DockLayoutState<T> {
  return { placement: 'right', collapsed: false, width: 360, height: 300, tabOrder: [...tabs] };
}

export function readDockLayout<T extends string>(tabs: readonly T[]): DockLayoutState<T> {
  const fallback = defaultDockLayout(tabs);
  try {
    const raw = JSON.parse(window.localStorage.getItem(DOCK_LAYOUT_STORAGE_KEY) ?? 'null') as Partial<DockLayoutState<T>> | null;
    if (!raw || !Array.isArray(raw.tabOrder)) return fallback;
    const valid = new Set(tabs);
    const order = raw.tabOrder.filter((id): id is T => typeof id === 'string' && valid.has(id));
    tabs.forEach(id => { if (!order.includes(id)) order.push(id); });
    return {
      placement: raw.placement === 'bottom' ? 'bottom' : 'right',
      collapsed: raw.collapsed === true,
      width: Number.isFinite(raw.width) ? Math.min(620, Math.max(280, Number(raw.width))) : fallback.width,
      height: Number.isFinite(raw.height) ? Math.min(420, Math.max(180, Number(raw.height))) : fallback.height,
      tabOrder: order,
    };
  } catch {
    return fallback;
  }
}

export function writeDockLayout<T extends string>(layout: DockLayoutState<T>): void {
  try { window.localStorage.setItem(DOCK_LAYOUT_STORAGE_KEY, JSON.stringify(layout)); } catch { /* dock preferences are optional */ }
}

export function DockingToolbar({
  placement,
  collapsed,
  onPlacement,
  onToggleCollapsed,
  onReset,
}: {
  placement: DockPlacement;
  collapsed: boolean;
  onPlacement: (placement: DockPlacement) => void;
  onToggleCollapsed: () => void;
  onReset: () => void;
}) {
  return (
    <div className="dock-layout-toolbar" role="toolbar" aria-label="Dock layout controls">
      <span className="dock-layout-label">DOCK</span>
      <button type="button" aria-label="Dock tools to the right" aria-pressed={placement === 'right'} onClick={() => onPlacement('right')} title="Dock tools to the right">R</button>
      <button type="button" aria-label="Dock tools to the bottom" aria-pressed={placement === 'bottom'} onClick={() => onPlacement('bottom')} title="Dock tools to the bottom">B</button>
      <button type="button" aria-label={collapsed ? 'Open tool dock' : 'Collapse tool dock'} onClick={onToggleCollapsed} title={collapsed ? 'Open tool dock' : 'Collapse tool dock'}>{collapsed ? '▣' : '—'}</button>
      <button type="button" aria-label="Reset dock layout" onClick={onReset} title="Reset dock layout">↺</button>
    </div>
  );
}

export function DockResizeHandle({ placement, size, onResize }: { placement: DockPlacement; size: number; onResize: (size: number) => void }) {
  const start = useRef<{ coordinate: number; size: number } | null>(null);
  return <div
    className={`dock-resize-handle ${placement}`}
    role="separator"
    aria-label={`Resize ${placement} tool dock`}
    aria-orientation={placement === 'right' ? 'vertical' : 'horizontal'}
    onPointerDown={event => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      start.current = { coordinate: placement === 'right' ? event.clientX : event.clientY, size };
    }}
    onPointerMove={event => {
      if (!start.current) return;
      const delta = start.current.coordinate - (placement === 'right' ? event.clientX : event.clientY);
      onResize(placement === 'right' ? Math.min(620, Math.max(280, start.current.size + delta)) : Math.min(420, Math.max(180, start.current.size + delta)));
    }}
    onPointerUp={event => { start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { start.current = null; }}
  />;
}

export function DockTabs<T extends string>({ definitions, order, activeId, onSelect, onReorder }: { definitions: readonly DockTabDefinition<T>[]; order: readonly T[]; activeId: T; onSelect: (id: T) => void; onReorder: (from: T, to: T) => void }) {
  const [dragged, setDragged] = useState<T | null>(null);
  const byId = new Map(definitions.map(definition => [definition.id, definition]));
  return <div className="dock-tabs" role="tablist" aria-label="Editor dock" onDragEnd={() => setDragged(null)}>
    {order.map(id => {
      const definition = byId.get(id);
      if (!definition) return null;
      return <button
        key={id}
        id={`${id}-tab`}
        role="tab"
        draggable
        className={dragged === id ? 'dock-tab-dragging' : ''}
        aria-selected={activeId === id}
        aria-controls={`${id}-dock`}
        title={`${definition.label} · drag to reorder`}
        onClick={() => onSelect(id)}
        onDragStart={event => { setDragged(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); }}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); const from = dragged ?? event.dataTransfer.getData('text/plain') as T; if (from && from !== id) onReorder(from, id); setDragged(null); }}
      >{definition.icon}<span>{definition.label}</span></button>;
    })}
  </div>;
}
