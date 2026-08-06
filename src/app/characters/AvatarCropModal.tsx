"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  imageSrc: string;
  onCrop: (croppedBlob: Blob) => void;
  onCancel: () => void;
};

export default function AvatarCropModal({ imageSrc, onCrop, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [exporting, setExporting] = useState(false);

  // Load image element
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => {
      setImgElement(img);
      setOffset({ x: 0, y: 0 });
      setZoom(1);
    };
  }, [imageSrc]);

  // Draw crop preview canvas
  useEffect(() => {
    if (!imgElement || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width; // 320px viewport
    ctx.clearRect(0, 0, size, size);

    // Compute scaled dimensions to fill square viewport
    const scale = Math.max(size / imgElement.width, size / imgElement.height) * zoom;
    const drawWidth = imgElement.width * scale;
    const drawHeight = imgElement.height * scale;

    const centerX = size / 2 + offset.x;
    const centerY = size / 2 + offset.y;

    const drawX = centerX - drawWidth / 2;
    const drawY = centerY - drawHeight / 2;

    ctx.save();
    ctx.drawImage(imgElement, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
  }, [imgElement, zoom, offset]);

  // Handle Drag / Pan
  function handleMouseDown(e: React.MouseEvent) {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }

  function handleMouseUp() {
    setIsDragging(false);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      });
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  }

  function handleTouchEnd() {
    setIsDragging(false);
  }

  // Export 512x512 cropped image blob
  function handleConfirmCrop() {
    if (!imgElement) return;
    setExporting(true);

    const exportCanvas = document.createElement("canvas");
    const targetSize = 512; // Output resolution: 512x512 px
    exportCanvas.width = targetSize;
    exportCanvas.height = targetSize;

    const ctx = exportCanvas.getContext("2d");
    if (!ctx) {
      setExporting(false);
      return;
    }

    const viewSize = 320;
    const ratio = targetSize / viewSize;

    const scale = Math.max(viewSize / imgElement.width, viewSize / imgElement.height) * zoom;
    const drawWidth = imgElement.width * scale * ratio;
    const drawHeight = imgElement.height * scale * ratio;

    const centerX = targetSize / 2 + offset.x * ratio;
    const centerY = targetSize / 2 + offset.y * ratio;

    const drawX = centerX - drawWidth / 2;
    const drawY = centerY - drawHeight / 2;

    ctx.drawImage(imgElement, drawX, drawY, drawWidth, drawHeight);

    exportCanvas.toBlob(
      (blob) => {
        setExporting(false);
        if (blob) {
          onCrop(blob);
        }
      },
      "image/webp",
      0.88,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-fadeIn">
      <div className="panel w-full max-w-md space-y-4 p-5 sm:p-6 shadow-2xl bg-[color:var(--surface-solid)] border-[var(--line)]">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Frame & Crop Avatar (512×512)</h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs muted hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Interactive Canvas Viewport */}
        <div className="flex justify-center">
          <div
            className="relative h-80 w-80 overflow-hidden rounded-2xl border-2 border-blue-500/40 cursor-grab active:cursor-grabbing shadow-inner bg-slate-900"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <canvas ref={canvasRef} width={320} height={320} className="h-full w-full" />
            <div className="pointer-events-none absolute inset-0 rounded-2xl border border-white/20 shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        </div>

        {/* Zoom Slider Controls */}
        <div className="space-y-1 px-2">
          <div className="flex items-center justify-between text-xs muted font-medium">
            <span>Zoom</span>
            <span>{zoom.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <p className="text-[11px] muted text-center mt-1">
            Drag image to center character face perfectly
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={exporting}
            className="btn-outline btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmCrop}
            disabled={exporting}
            className="btn-primary btn-sm px-4"
          >
            {exporting ? "Cropping 512×512..." : "Crop & Save Avatar"}
          </button>
        </div>
      </div>
    </div>
  );
}
