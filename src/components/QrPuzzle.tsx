import React, { useState, useEffect } from "react";
import PuzzleBoard from "./PuzzleBoard";
import PuzzlePiece from "./PuzzlePiece";
import ProgressBar from "./ProgressBar";

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

export default function QrPuzzle() {
  const createShuffledPieces = () => {
    const pieces = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }

    return pieces;
  };

  const [trayPieces, setTrayPieces] = useState<number[]>([]);
  const [boardPieces, setBoardPieces] = useState<(number | null)[]>(
    Array(9).fill(null)
  );
  const [completed, setCompleted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setTrayPieces(createShuffledPieces());
    setMounted(true);
  }, []);

  const correctCount = boardPieces.filter(Boolean).length;

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    id: number
  ) => {
    e.dataTransfer.setData("text/plain", id.toString());
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    cellIndex: number
  ) => {
    e.preventDefault();

    if (checking) return;

    if (boardPieces[cellIndex] !== null) return;

    const droppedId = parseInt(
      e.dataTransfer.getData("text/plain"),
      10
    );

    if (!droppedId) return;

    setTrayPieces((prev) => prev.filter((p) => p !== droppedId));

    setBoardPieces((prev) => {
      const next = [...prev];
      next[cellIndex] = droppedId;
      return next;
    });
  };

  useEffect(() => {
    if (correctCount !== 9) return;

    setChecking(true);

    const solved = boardPieces.every(
      (piece, index) => piece === index + 1
    );

    if (solved) {
      setMessage("✔ QR Successfully Reconstructed");
      setCompleted(true);
      setChecking(false);
      return;
    }

    setMessage(" Incorrect Reconstruction... Reshuffling");

    setTimeout(() => {
      setBoardPieces(Array(9).fill(null));
      setTrayPieces(createShuffledPieces());
      setChecking(false);
      setMessage("");
    }, 1200);
  }, [boardPieces]);

  if (!mounted) return null;

  return (
    <div className="flex flex-col items-center gap-8 w-full">

      <div className="w-full flex flex-col items-center gap-3">

        {!completed ? (
          <ProgressBar
            correctCount={correctCount}
            totalCount={9}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <h3 className="text-2xl font-black uppercase text-emerald-400">
              ✔ QR Successfully Reconstructed
            </h3>

            <p className="text-gray-300">
              Scan the QR code to obtain the flag.
            </p>
          </div>
        )}

        {message && !completed && (
          <div className="text-red-400 font-bold">
            {message}
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row justify-center gap-12 w-full max-w-4xl">

        {!completed && (
          <div className="w-full max-w-[320px]">

            <h4 className="text-center text-sm font-black uppercase tracking-widest text-red-400 mb-4">
              Scrambled Pieces
            </h4>

            <div className="grid grid-cols-3 gap-2 bg-[#120819] border border-white/5 p-4 rounded-xl aspect-square">

              {trayPieces.map((id) => (

                <div
                  key={id}
                  className="aspect-square w-full h-full"
                >
                  <PuzzlePiece
                    id={id}
                    imageSrc={`/uploads/ctf/medium-03-qr-puzzle/${PIECE_FILES[id]}`}
                    draggable={!checking}
                    onDragStart={handleDragStart}
                  />
                </div>

              ))}

              {Array.from({
                length: 9 - trayPieces.length,
              }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square border border-dashed border-white/10 rounded-md"
                />
              ))}
            </div>
          </div>
        )}

        <div className="w-full max-w-[320px]">

          {!completed && (
            <h4 className="text-center text-sm font-black uppercase tracking-widest text-red-400 mb-4">
              Reconstruction Board
            </h4>
          )}

          {completed ? (

            <div className="aspect-square rounded-xl overflow-hidden border-4 border-emerald-500">

              <img
                src="/uploads/ctf/medium-03-qr-puzzle/complete.png"
                alt="QR"
                className="w-full h-full object-cover"
              />

            </div>

          ) : (

            <PuzzleBoard
              placedPieces={boardPieces}
              onDrop={handleDrop}
            />

          )}

        </div>

      </div>

    </div>
  );
}