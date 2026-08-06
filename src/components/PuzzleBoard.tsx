import React from "react";
import PuzzlePiece from "./PuzzlePiece";

interface PuzzleBoardProps {
  placedPieces: (number | null)[];
  onDrop: (
    e: React.DragEvent<HTMLDivElement>,
    cellIndex: number
  ) => void;
}

export default function PuzzleBoard({
  placedPieces,
  onDrop,
}: PuzzleBoardProps) {

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="grid grid-cols-3 gap-2 bg-[#120819] border border-red-500/20 p-2 rounded-xl w-full max-w-[320px] aspect-square mx-auto shadow-[0_0_20px_rgba(220,38,38,0.1)]">

      {placedPieces.map((pieceId, idx) => (

        <div
          key={idx}
          onDragOver={handleDragOver}
          onDrop={(e) => onDrop(e, idx)}
          className="w-full h-full bg-black/40 rounded-lg border-2 border-dashed border-white/20 flex items-center justify-center relative overflow-hidden"
        >

          {pieceId !== null ? (

            <PuzzlePiece
              id={pieceId}
              imageSrc={`/uploads/ctf/easy-03-qr-puzzle/piece-${pieceId}.png`}
              draggable={false}
              onDragStart={() => {}}
            />

          ) : (

            <span className="text-white/10 font-bold text-sm select-none">
              {idx + 1}
            </span>

          )}

        </div>

      ))}

    </div>
  );
}