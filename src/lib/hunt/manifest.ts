/**
 * The four loose case items, and where each one is left lying.
 *
 * These are one task between them, not four: section 5 of the room (see
 * ROOM_SECTIONS in @/lib/hunt/roomTasks). Each carries two letters of that
 * section's code on its face, readable only once it is picked up and turned
 * over, and the four together spell the word the player has to type.
 *
 * ARRAY ORDER IS LETTER ORDER. MysteryRoom.tsx splits the section's code into
 * ROOM_MANIFEST.length equal pieces and shows piece `i` on item `i` — it never
 * assembles anything from the order a player happens to collect them in, only
 * from this fixed order. Keep that in mind before reordering this array or
 * changing the length of the code it carries.
 *
 * `shape` selects the geometry MysteryRoomProp draws. `model` overrides it
 * with a GLB: point it at a path under public/ and Model
 * (MysteryRoomModel.tsx) loads it instead, with its own Suspense fallback and
 * an error boundary that fails loudly rather than quietly falling back to the
 * primitive. So swapping in real art really is a manifest edit, with no change
 * needed to either component.
 *
 * The other four sections are not in here, because none of them is an object
 * lying somewhere: they are a pinboard, a wall of books, a workbench and a
 * pair of mounted stags, and each owns its own component and its own
 * coordinates.
 */
export type PropShape = "folder" | "tin" | "satchel" | "tape";

export interface PropSlot {
  id: string;
  label: string;
  /** Primitive geometry to draw when `model` is null. */
  shape: PropShape;
  model: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

export const ROOM_MANIFEST: PropSlot[] = [
  {
    id: "p1",
    label: "Case folder",
    shape: "folder",
    model: null,
    // Resting on the desk top (y = 0.6).
    position: [-2.03, 0.63, -2.88],
    rotation: [0, 0.43, 0],
    scale: 1,
  },
  {
    id: "p2",
    label: "Deed tin",
    shape: "tin",
    model: null,
    // Second shelf of the bookcase (plank top y = 1.1).
    position: [2.4, 1.19, -2.62],
    rotation: [0, -0.22, 0],
    scale: 1,
  },
  {
    id: "p3",
    label: "Courier satchel",
    shape: "satchel",
    model: null,
    // On the pallet (top y = 0.1).
    position: [-2.6, 0.23, 1.9],
    rotation: [0, 1.1, 0],
    scale: 1,
  },
  {
    id: "p4",
    label: "Data reel",
    shape: "tape",
    model: null,
    // On the terminal table (top y = 0.7).
    position: [0.5, 0.75, -3.95],
    rotation: [0, 0.35, 0],
    scale: 1,
  },
];
