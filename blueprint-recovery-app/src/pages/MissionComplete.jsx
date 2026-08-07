import { VARIANT_COLORS } from '../lib/constants';

/**
 * MissionComplete — Final completion screen.
 *
 * Functional logic:
 *   - Reads teamData for: team_number, variant_number, start_time, complete_time,
 *     ready_for_reveal_time, location_revealed_time, wrong_attempts_b
 *   - Calculates duration (complete_time - start_time)
 *   - Displays all mission data
 *   - "Start Next Team" button → onStartNextTeam() (clears session)
 */

export default function MissionComplete({ teamData, onStartNextTeam }) {
  const variant = VARIANT_COLORS[teamData.variant_number];

  const startTime = new Date(teamData.start_time);
  const completeTime = new Date(teamData.complete_time);
  const durationMs = completeTime - startTime;
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationSeconds = Math.floor((durationMs % 60000) / 1000);

  return (
    <div className="page">
      <div className="page-content" style={{ textAlign: 'center' }}>
        <h1>Sector Sealed</h1>
        <p>Mission Complete — Breach Contained</p>

        <div style={{ fontSize: '2rem', fontWeight: 'bold', margin: '16px 0' }}>
          {durationMinutes}m {durationSeconds}s
        </div>

        <div className="panel-border" style={{ textAlign: 'left', marginBottom: '24px' }}>
          <table>
            <tbody>
              <tr>
                <td>Team</td>
                <td><strong>#{teamData.team_number}</strong></td>
              </tr>
              <tr>
                <td>Sector</td>
                <td>
                  <span
                    className="color-swatch"
                    style={{ backgroundColor: variant.color }}
                  />
                  <strong>{variant.color}</strong> — {variant.sectorName}
                </td>
              </tr>
              <tr>
                <td>Start</td>
                <td>{startTime.toLocaleTimeString()}</td>
              </tr>
              <tr>
                <td>Puzzle Solved</td>
                <td>
                  {teamData.ready_for_reveal_time
                    ? new Date(teamData.ready_for_reveal_time).toLocaleTimeString()
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Location Revealed</td>
                <td>
                  {teamData.location_revealed_time
                    ? new Date(teamData.location_revealed_time).toLocaleTimeString()
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Sealed</td>
                <td>{completeTime.toLocaleTimeString()}</td>
              </tr>
              <tr>
                <td>Wrong Code Attempts</td>
                <td>{teamData.wrong_attempts_b}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p>Return to the coordinator. Proceed to the next round.</p>

        <button onClick={onStartNextTeam} className="btn-primary">
          Start Next Team →
        </button>
      </div>
    </div>
  );
}
