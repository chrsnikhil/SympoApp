import React from "react";
import PuzzlePiece from "./PuzzlePiece";

interface PuzzleBoardProps {
  placedPieces: (number | null)[];
  onDrop: (
    e: React.DragEvent<HTMLDivElement>,
    cellIndex: number
  ) => void;
}

const PIECE_FILES: Record<number, string> = {
  1: "q_7x9a2.png",
  2: "q_3m8k1.png",
  3: "q_9p4v7.png",
  4: "q_1b6w5.png",
  5: "q_8z2y4.png",
  6: "q_4c7j9.png",
  7: "q_0t3e6.png",
  8: "q_5r1u8.png",
  9: "q_2n9h3.png",
};

export default function PuzzleBoard({
  placedPieces,
  onDrop,
}: PuzzleBoardProps) {

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="grid grid-cols-3 gap-2 bg-[#120819] border border-red-500/20 p-2 rounded-xl w-full max-w-[320px] aspect-square mx-auto shadow-[0_0_20px_rgba(220,38,38,0.1)] shrink-0 overflow-hidden">

      {placedPieces.map((pieceId, idx) => (

        <div
          key={idx}
          onDragOver={handleDragOver}
          onDrop={(e) => onDrop(e, idx)}
          className="w-full h-full aspect-square bg-black/40 rounded-lg border border-dashed border-white/20 flex items-center justify-center relative overflow-hidden box-border"
        >

          {pieceId !== null ? (

            <PuzzlePiece
              id={pieceId}
              imageSrc={`/uploads/ctf/medium-03-qr-puzzle/${PIECE_FILES[pieceId]}`}
              draggable={false}
              onDragStart={() => {}}
            />

          ) : (

            <span className="text-white/10 font-bold text-xs select-none">
              +
            </span>

          )}

        </div>

      ))}

    </div>
  );
}