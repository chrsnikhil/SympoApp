import { useState } from 'react';
import { registerOrResumeTeam } from '../services/teamService';

/**
 * TeamEntry — Team registration screen.
 *
 * Functional logic:
 *   - Validates team number input (empty, non-numeric, ≤ 0)
 *   - Calls registerOrResumeTeam() → creates new team or resumes existing
 *   - If team is already complete → shows "already completed" with "Start New Team"
 *   - On success → onRegistered(teamData)
 */
export default function TeamEntry({ onRegistered, onStartNewTeam }) {
  const [teamNumber, setTeamNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [completedTeamInfo, setCompletedTeamInfo] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setCompletedTeamInfo(null);
    setLoading(true);

    const { data: team, error: serviceErr } = await registerOrResumeTeam(teamNumber);

    setLoading(false);

    if (serviceErr) {
      setError(serviceErr);
      return;
    }

    if (team) {
      if (team.status === 'complete') {
        setCompletedTeamInfo(team);
      } else {
        onRegistered(team);
      }
    }
  }

  function handleStartNewTeamClick() {
    setCompletedTeamInfo(null);
    setTeamNumber('');
    setError('');
    if (onStartNewTeam) {
      onStartNewTeam();
    }
  }

  return (
    <div className="page">
      <div className="page-content">
        <h1>Team Identification</h1>

        <p>
          Enter your assigned Team Number to initialize sector recovery. Returning
          operatives will resume their active mission.
        </p>

        {completedTeamInfo ? (
          <div className="panel-border" style={{ padding: '16px', marginTop: '16px' }}>
            <h3>Mission Already Completed</h3>
            <p>
              Team <strong>#{completedTeamInfo.team_number}</strong> has already finished
              this sector recovery.
            </p>
            <button onClick={handleStartNewTeamClick}>
              Start New Team →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ maxWidth: '400px', marginTop: '16px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label htmlFor="team-number-input">Team Number</label>
              <input
                id="team-number-input"
                type="text"
                inputMode="numeric"
                value={teamNumber}
                onChange={(e) => setTeamNumber(e.target.value)}
                placeholder="e.g. 101"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Authorizing...' : 'Authorize Team →'}
            </button>
          </form>
        )}

        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  );
}
