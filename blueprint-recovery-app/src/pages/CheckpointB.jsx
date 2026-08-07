import { useState } from 'react';
import { validateCheckpoint } from '../services/teamService';

/**
 * CheckpointB — Final access code verification screen.
 *
 * Functional logic:
 *   - Form: access code input → validateCheckpoint(teamNumber, 'B', code)
 *   - On correct: 1.2s delay → onSuccess(updatedTeam)
 *   - On wrong: rotating rejection messages, increment attempts counter
 *   - Guards against missing teamData
 *   - Input disabled after confirmation
 */

const REJECTION_LINES = [
  "Invalid code. That's not the one. Go back and look again — it's there.",
  "Wrong access code. The breach won't seal with guesswork. Find the card.",
  "Negative. The access code doesn't match. Double-check the card color.",
];

export default function CheckpointB({ teamData, onSuccess }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(teamData?.wrong_attempts_b || 0);
  const [confirmed, setConfirmed] = useState(false);

  if (!teamData) {
    return (
      <div className="page">
        <div className="error-msg">
          Error: Team session data missing. Please return to team entry.
        </div>
      </div>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError('Please enter an access code.');
      return;
    }

    setLoading(true);

    const result = await validateCheckpoint(teamData.team_number, 'B', trimmedCode);
    setLoading(false);

    if (result.error && !result.updatedTeam && !result.correct) {
      setError(result.error);
      return;
    }

    if (result.correct) {
      setConfirmed(true);
      setTimeout(() => {
        onSuccess(result.updatedTeam || teamData);
      }, 300);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      const rejectionLine = REJECTION_LINES[(newAttempts - 1) % REJECTION_LINES.length];
      setError(rejectionLine);
    }
  }

  return (
    <div className="page">
      <div className="page-content">
        <h1>Checkpoint B — Final Access Code</h1>

        <p>Team #{teamData.team_number}</p>

        <p>
          Enter the access code from the sealed card you found at the breach point.
          This is the final step — one correct entry seals the sector.
        </p>

        <form onSubmit={handleSubmit} style={{ maxWidth: '400px', marginTop: '16px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="code-input">Access Code</label>
            <input
              id="code-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. RED-1234"
              required
              disabled={loading || confirmed}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || confirmed}
          >
            {loading ? 'Verifying...' : confirmed ? '✓ Sector Sealed' : 'Seal The Breach →'}
          </button>
        </form>

        {error && <div className="error-msg">{error}</div>}
        {attempts > 0 && !error && (
          <div className="info-msg">
            Wrong attempts: {attempts}
          </div>
        )}
        {confirmed && (
          <div className="info-msg" style={{ marginTop: '12px' }}>
            ✓ Sector sealed! Completing mission...
          </div>
        )}
      </div>
    </div>
  );
}
