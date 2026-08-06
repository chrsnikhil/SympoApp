import { useState } from 'react';

/**
 * StorylineScreen — Briefing / narrative screen.
 *
 * Functional logic:
 *   - Shows 4 briefing panels one at a time
 *   - "Next Panel" button reveals next panel
 *   - After all 4 revealed → button becomes "Proceed to Sector Assignment"
 *   - onContinue() called when proceeding
 * NO database calls — purely narrative.
 */

const BRIEFING_PANELS = [
  "The Lattice — a multiversal engineering network holding seventeen dimensions together — has fractured. Sectors are collapsing one by one. Your team's been selected for recovery duty. Don't look so honored.",
  "A shredded blueprint is sealed inside your assigned envelope. Twenty pieces. Assemble it. When it's done, it'll reveal a location name — that's your first target. Miss a piece, and you'll be chasing ghosts.",
  "Find the location. Search it. You're looking for a sealed code card matching your sector color — and only your color. Other teams have their own cards in their own spots. Touch theirs and you've wasted your own time.",
  "Enter the code. Seal the breach. Every second counts — but carelessness costs more than speed. Move with purpose. The Lattice doesn't give second chances. But I do. Unlimited retries. Now move.",
];

export default function StorylineScreen({ onContinue }) {
  const [visiblePanels, setVisiblePanels] = useState(1);

  function handleNext() {
    if (visiblePanels < BRIEFING_PANELS.length) {
      setVisiblePanels((prev) => prev + 1);
    } else {
      onContinue();
    }
  }

  const allRevealed = visiblePanels >= BRIEFING_PANELS.length;

  return (
    <div className="page">
      <div className="page-content">
        <h2>Mission Briefing</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
          {BRIEFING_PANELS.slice(0, visiblePanels).map((text, i) => (
            <div key={i} className="panel-border">
              <p style={{ margin: 0 }}>
                <strong>Panel {i + 1}/{BRIEFING_PANELS.length}:</strong> {text}
              </p>
            </div>
          ))}
        </div>

        <button
          className={allRevealed ? 'btn-primary' : ''}
          onClick={handleNext}
        >
          {allRevealed
            ? 'Proceed to Sector Assignment →'
            : `Next Panel (${visiblePanels}/${BRIEFING_PANELS.length}) →`}
        </button>
      </div>
    </div>
  );
}
