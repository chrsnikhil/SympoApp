import React from "react";

interface PuzzlePieceProps {
  id: number;
  imageSrc: string;
  draggable: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, id: number) => void;
}

export default function PuzzlePiece({ id, imageSrc, draggable, onDragStart }: PuzzlePieceProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, id)}
      className={`w-full h-full relative group ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      }`}
    >
      <img
        src={imageSrc}
        alt="QR Fragment"
        className="w-full h-full object-cover rounded-md pointer-events-none border border-white/10"
      />
    </div>
  );
}
