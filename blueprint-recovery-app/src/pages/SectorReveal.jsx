import { VARIANT_COLORS } from '../lib/constants';

/**
 * SectorReveal — Sector assignment display screen.
 *
 * Functional logic:
 *   - Reads teamData.variant_number → looks up color + sector name from VARIANT_COLORS
 *   - Displays team number, variant, color swatch, sector name
 *   - Instructions to collect envelope
 *   - "Proceed to Checkpoint A" button → onContinue()
 * NO database calls — purely display.
 */

export default function SectorReveal({ teamData, onContinue }) {
  const variant = VARIANT_COLORS[teamData.variant_number];

  return (
    <div className="page">
      <div className="page-content">
        <h1>Sector Assignment</h1>

        <div className="panel-border" style={{ marginBottom: '24px' }}>
          <table>
            <tbody>
              <tr>
                <td>Team Number</td>
                <td><strong>#{teamData.team_number}</strong></td>
              </tr>
              <tr>
                <td>Variant Number</td>
                <td>{teamData.variant_number}</td>
              </tr>
              <tr>
                <td>Sector Color</td>
                <td>
                  <span
                    className="color-swatch"
                    style={{ backgroundColor: variant.color }}
                  />
                  <strong>{variant.color}</strong>
                </td>
              </tr>
              <tr>
                <td>Sector Name</td>
                <td>{variant.sectorName}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="info-msg" style={{ marginBottom: '24px' }}>
          Collect envelope <strong>#{teamData.variant_number}</strong> (
          <strong>{variant.color}</strong>) from the coordinator.
          Assemble the 20-piece blueprint puzzle inside — it will reveal a location name.
        </div>

        <button onClick={onContinue} className="btn-primary">
          I Have My Envelope — Continue →
        </button>
      </div>
    </div>
  );
}
