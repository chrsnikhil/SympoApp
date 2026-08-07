import { useState, useEffect, useRef } from 'react';
import { markReadyForReveal, getTeamByNumber, getRevealedLocation } from '../services/teamService';

/**
 * RevealFlow — Coordinator-confirmed location reveal screen.
 *
 * Manages three internal states:
 *
 * 1. "Mark Solved" (status = in_progress):
 *    - Button: "I've Solved It — Notify Coordinator"
 *    - Calls markReadyForReveal() on click
 *
 * 2. "Waiting" (status = ready_for_reveal):
 *    - Message: "Waiting for coordinator confirmation..."
 *    - Polls getTeamByNumber() every 3 seconds
 *    - Auto-transitions when status becomes location_revealed
 *
 * 3. "Location Revealed" (status = location_revealed):
 *    - Calls getRevealedLocation() to fetch the actual location
 *    - Displays: "Your breach point is: [LOCATION]"
 *    - Button: "Proceed to Physical Search →"
 *
 * Props: { teamData, onLocationRevealed }
 */

export default function RevealFlow({ teamData, onLocationRevealed }) {
  const [phase, setPhase] = useState('loading'); // loading | mark_solved | waiting | revealed
  const [revealedLocation, setRevealedLocation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentTeamData, setCurrentTeamData] = useState(teamData);
  const pollRef = useRef(null);

  // Guard against missing teamData
  if (!teamData) {
    return (
      <div className="page">
        <div className="error-msg">
          Error: Team session data missing. Please return to team entry.
        </div>
      </div>
    );
  }

  // Determine initial phase from current team status
  useEffect(() => {
    if (teamData.status === 'ready_for_reveal') {
      setPhase('waiting');
    } else if (teamData.status === 'location_revealed') {
      setPhase('revealed');
      fetchLocation();
    } else {
      setPhase('mark_solved');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling: when in waiting phase, check for status change every 3s
  useEffect(() => {
    if (phase !== 'waiting') return;

    async function poll() {
      const { data, error: pollErr } = await getTeamByNumber(teamData.team_number);
      if (pollErr || !data) return; // silently skip on error, will retry

      setCurrentTeamData(data);

      if (data.status === 'location_revealed' || data.status === 'complete') {
        setPhase('revealed');
        fetchLocation();
      } else if (data.status === 'in_progress') {
        // Coordinator sent the team back — show the button again
        setPhase('mark_solved');
      }
    }

    pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [phase, teamData.team_number]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchLocation() {
    const { location, error: locErr } = await getRevealedLocation(teamData.team_number);
    if (locErr) {
      setError(locErr);
    } else {
      setRevealedLocation(location);
    }
  }

  async function handleMarkSolved() {
    setError('');
    setLoading(true);

    const { data, error: markErr } = await markReadyForReveal(teamData.team_number);
    setLoading(false);

    if (markErr) {
      setError(markErr);
      return;
    }

    setCurrentTeamData(data);
    setPhase('waiting');
  }

  function handleProceed() {
    onLocationRevealed(currentTeamData, revealedLocation);
  }

  return (
    <div className="page">
      <div className="page-content">
        {/* Phase 1: Mark Solved */}
        {phase === 'mark_solved' && (
          <>
            <h1>Puzzle Complete?</h1>
            <p>Team #{teamData.team_number}</p>

            <p>
              Once your team has assembled the 20-piece blueprint puzzle and
              identified the location name, notify the coordinator for confirmation.
            </p>

            <button
              className="btn-primary"
              onClick={handleMarkSolved}
              disabled={loading}
              style={{ marginTop: '16px' }}
            >
              {loading ? 'Notifying...' : "I've Solved It — Notify Coordinator"}
            </button>
          </>
        )}

        {/* Phase 2: Waiting for coordinator */}
        {phase === 'waiting' && (
          <>
            <h1>Awaiting Confirmation</h1>
            <p>Team #{teamData.team_number}</p>

            <div className="info-msg" style={{ marginTop: '16px' }}>
              Your coordinator has been notified. Please wait while they verify
              and reveal your location.
            </div>

            <p style={{ marginTop: '16px', color: '#999', fontSize: '0.85rem' }}>
              Polling every 3 seconds... This screen will update automatically.
            </p>
          </>
        )}

        {/* Phase 3: Location Revealed */}
        {phase === 'revealed' && (
          <>
            <h1>Location Revealed</h1>
            <p>Team #{teamData.team_number}</p>

            {revealedLocation ? (
              <>
                <div className="panel-border" style={{ marginTop: '16px', padding: '20px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>Your breach point is:</p>
                  <p style={{ margin: '8px 0 0', fontSize: '1.5rem', fontWeight: 'bold' }}>
                    {revealedLocation}
                  </p>
                </div>

                <p style={{ marginTop: '16px' }}>
                  Travel to this location and search for the sealed code card
                  matching your sector color. Take only your team's card.
                </p>

                <button
                  className="btn-primary"
                  onClick={handleProceed}
                  style={{ marginTop: '16px' }}
                >
                  Proceed to Physical Search →
                </button>
              </>
            ) : (
              <p className="loading-text">Loading location...</p>
            )}
          </>
        )}

        {/* Loading state */}
        {phase === 'loading' && (
          <p className="loading-text">Loading...</p>
        )}

        {error && <div className="error-msg" style={{ marginTop: '12px' }}>{error}</div>}
      </div>
    </div>
  );
}
