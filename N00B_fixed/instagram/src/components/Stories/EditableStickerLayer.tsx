import React, { useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

interface EditableStickerLayerProps {
  x: number; // percent of canvas width, center-anchored
  y: number; // percent of canvas height, center-anchored
  width: number; // percent of canvas width
  rotation: number; // degrees
  canvasRef: React.RefObject<HTMLElement>;
  active: boolean;
  onSelect: () => void;
  onChange: (next: { x: number; y: number; width: number; rotation: number }) => void;
  onTap?: () => void;
  onDelete?: () => void;
  onDragStateChange?: (dragging: boolean, overTrash: boolean) => void;
  minWidthPct?: number;
  maxWidthPct?: number;
  children: React.ReactNode;
}

// A generic drag / pinch-resize / rotate wrapper for story & post canvas layers (text, stickers,
// mentions, etc.). One corner handle controls both scale and rotation at once, matching the
// Instagram/Snapchat editor gesture. Dragging the body into the bottom trash band deletes it.
export const EditableStickerLayer: React.FC<EditableStickerLayerProps> = ({
  x,
  y,
  width,
  rotation,
  canvasRef,
  active,
  onSelect,
  onChange,
  onTap,
  onDelete,
  onDragStateChange,
  minWidthPct = 12,
  maxWidthPct = 92,
  children,
}) => {
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const dragMovedRef = useRef(false);

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    onSelect();
    dragMovedRef.current = false;
    setDragging(true);
    onDragStateChange?.(true, false);

    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startX = x;
    const startY = y;

    const handleMove = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startClientX) / rect.width) * 100;
      const dy = ((ev.clientY - startClientY) / rect.height) * 100;
      if (Math.abs(dx) > 0.6 || Math.abs(dy) > 0.6) dragMovedRef.current = true;
      const nx = Math.min(100, Math.max(0, startX + dx));
      const ny = Math.min(100, Math.max(0, startY + dy));
      const trashActive = ny > 87;
      setOverTrash(trashActive);
      onDragStateChange?.(true, trashActive);
      onChange({ x: nx, y: ny, width, rotation });
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setDragging(false);
      onDragStateChange?.(false, false);
      if (overTrash) {
        onDelete?.();
      } else if (!dragMovedRef.current) {
        onTap?.();
      }
      setOverTrash(false);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleHandlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerPxX = rect.left + (x / 100) * rect.width;
    const centerPxY = rect.top + (y / 100) * rect.height;
    const startDist = Math.hypot(e.clientX - centerPxX, e.clientY - centerPxY) || 1;
    const startAngle = Math.atan2(e.clientY - centerPxY, e.clientX - centerPxX) * (180 / Math.PI);
    const startWidthPx = (width / 100) * rect.width;
    const startRotation = rotation;

    const handleMove = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - centerPxX, ev.clientY - centerPxY);
      const angle = Math.atan2(ev.clientY - centerPxY, ev.clientX - centerPxX) * (180 / Math.PI);
      const scaleFactor = dist / startDist;
      const newWidthPx = Math.max(
        (minWidthPct / 100) * rect.width,
        Math.min((maxWidthPct / 100) * rect.width, startWidthPx * scaleFactor)
      );
      const newWidthPct = (newWidthPx / rect.width) * 100;
      onChange({ x, y, width: newWidthPct, rotation: startRotation + (angle - startAngle) });
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const showHandle = active || dragging;

  return (
    <div
      className="absolute select-none touch-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        zIndex: dragging ? 50 : active ? 40 : 30,
        cursor: dragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={handleBodyPointerDown}
    >
      <div
        className={`relative transition-opacity ${overTrash ? 'opacity-30' : 'opacity-100'} ${
          showHandle ? 'outline outline-2 outline-dashed outline-[#00FF66]/70 outline-offset-4 rounded-md' : ''
        }`}
      >
        {children}
        {showHandle && (
          <div
            onPointerDown={handleHandlePointerDown}
            className="absolute -bottom-4 -right-4 w-7 h-7 rounded-full bg-[#00FF66] border-2 border-black shadow-lg flex items-center justify-center cursor-nwse-resize touch-none"
            style={{ transform: `rotate(${-rotation}deg)` }}
          >
            <RotateCw className="w-3.5 h-3.5 text-black" />
          </div>
        )}
      </div>
    </div>
  );
};
