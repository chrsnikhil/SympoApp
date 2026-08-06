/**
 * PhysicalSearchScreen — Holding screen while team searches physically.
 *
 * Functional logic:
 *   - Displays the revealed location name so the team knows where to go
 *   - Instructions to search for the code card
 *   - Single "Enter Access Code" button → onReady()
 * NO database calls — purely narrative/holding.
 */

export default function PhysicalSearchScreen({ teamData, revealedLocation, onReady }) {
  return (
    <div className="page">
      <div className="page-content" style={{ textAlign: 'center' }}>
        <h2>Searching for Breach Point</h2>

        {revealedLocation && (
          <div className="panel-border" style={{ margin: '16px 0', padding: '16px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Your location:</p>
            <p style={{ margin: '4px 0 0', fontSize: '1.3rem', fontWeight: 'bold' }}>
              {revealedLocation}
            </p>
          </div>
        )}

        <p>
          Travel to the designated site and search for the sealed code card
          matching your sector color.
        </p>

        <p style={{ fontWeight: 600 }}>
          Take only your team's color-coded card. Leave everything else undisturbed.
        </p>

        <button className="btn-primary" onClick={onReady} style={{ marginTop: '16px' }}>
          Enter Access Code →
        </button>
      </div>
    </div>
  );
}
