'use client';
import React, { useState, useEffect } from 'react';
import {
  validateCoordinatorPassword,
  fetchDashboardTeams,
  revealLocation,
  resetTeam,
  overrideTeamComplete,
} from '@/services/teamService';
import { VARIANT_COLORS } from '@/lib/constants';
import { supabase } from '@/lib/supabaseClient';

/**
 * Screen 09: Coordinator Dashboard (09-coordinator-dashboard)
 * Password-gated dashboard (server-side edge function validation).
 * Live table with polling & Realtime:
 *   - "Reveal" action when status = 'awaiting_reveal'
 *   - Amber NEEDS_REVEAL / Red STUCK tags for teams > 8 min
 *   - Reset action (resets status to 'not_started' & clears all counters)
 *   - Override to complete fallback
 */
export default function CoordinatorDashboard() {
  const [authToken, setAuthToken] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAuthToken(sessionStorage.getItem('coord_token') || '');
    }
  }, []);

  // 1. Password authentication submission
  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    // Try Edge Function first
    const { success, token, error } = await validateCoordinatorPassword(passwordInput);

    if (success && token) {
      setAuthLoading(false);
      sessionStorage.setItem('coord_token', token);
      setAuthToken(token);
      return;
    }

    // Fallback: if Edge Function is unavailable, validate client-side
    // against NEXT_PUBLIC_COORDINATOR_PASSWORD env var
    const edgeFunctionDown = error && (
      error.includes('Failed to send') ||
      error.includes('FetchError') ||
      error.includes('Failed to fetch') ||
      error.includes('Network') ||
      error.includes('edge function')
    );

    if (edgeFunctionDown) {
      const envPassword = process.env.NEXT_PUBLIC_COORDINATOR_PASSWORD || 'kenrich@202';
      if (passwordInput.trim() === envPassword.trim()) {
        const actualPassword = passwordInput.trim();
        sessionStorage.setItem('coord_token', actualPassword);
        setAuthToken(actualPassword);
        setAuthLoading(false);
        return;
      }
    }

    setAuthLoading(false);
    setAuthError(
      edgeFunctionDown
        ? 'ACCESS DENIED: Invalid Authorization Key.'
        : (error || 'ACCESS DENIED: Invalid Authorization Key.')
    );
  }

  // 2. Fetch teams and poll/subscribe
  useEffect(() => {
    if (!authToken) return;

    async function loadData() {
      const { data } = await fetchDashboardTeams();
      setTeams(data || []);
      setLoading(false);
    }

    loadData();
    const interval = setInterval(loadData, 3000);

    const channel = supabase
      .channel('coordinator-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams' },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [authToken]);

  // Handler for Reveal button click
  async function handleReveal(teamNumber) {
    setActionLoading((prev) => ({ ...prev, [teamNumber]: 'reveal' }));
    
    // Instant optimistic UI update
    setTeams((prev) =>
      prev.map((t) =>
        t.team_number === teamNumber
          ? { ...t, status: 'checkpoint_a_done', checkpoint_a_time: new Date().toISOString() }
          : t
      )
    );

    await revealLocation(teamNumber, authToken);
    const { data } = await fetchDashboardTeams();
    if (data) setTeams(data);
    setActionLoading((prev) => ({ ...prev, [teamNumber]: null }));
  }

  // Handler for Reset button click
  async function handleReset(teamNumber) {
    if (!window.confirm(`Are you sure you want to reset Team #${teamNumber} back to not_started?`)) return;
    setActionLoading((prev) => ({ ...prev, [teamNumber]: 'reset' }));
    
    // Instant optimistic UI update
    setTeams((prev) =>
      prev.map((t) =>
        t.team_number === teamNumber
          ? { ...t, status: 'not_started', start_time: null, checkpoint_a_time: null, complete_time: null }
          : t
      )
    );

    await resetTeam(teamNumber, authToken);
    const { data } = await fetchDashboardTeams();
    if (data) setTeams(data);
    setActionLoading((prev) => ({ ...prev, [teamNumber]: null }));
  }

  // Handler for Override to complete
  async function handleOverride(teamNumber) {
    if (!window.confirm(`Manually override Team #${teamNumber} status to COMPLETE?`)) return;
    setActionLoading((prev) => ({ ...prev, [teamNumber]: 'override' }));
    
    // Instant optimistic UI update
    setTeams((prev) =>
      prev.map((t) =>
        t.team_number === teamNumber
          ? { ...t, status: 'complete', complete_time: new Date().toISOString() }
          : t
      )
    );

    await overrideTeamComplete(teamNumber, authToken);
    const { data } = await fetchDashboardTeams();
    if (data) setTeams(data);
    setActionLoading((prev) => ({ ...prev, [teamNumber]: null }));
  }

  // Helper to format timestamps
  function formatTime(isoStr) {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Helper to calculate duration
  function formatDuration(startTime, completeTime) {
    if (!startTime || !completeTime) return '—';
    const start = new Date(startTime).getTime();
    const end = new Date(completeTime).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }

  // Check if team is stuck or needs reveal past 8 minutes
  function getVisualFlag(team) {
    if (!team.start_time) return null;
    const now = Date.now();
    const startTime = new Date(team.start_time).getTime();
    const elapsedMins = (now - startTime) / (1000 * 60);

    if (team.status === 'awaiting_reveal' && elapsedMins >= 8) {
      return <span className="px-2 py-1 bg-[#ffb300]/20 text-[#ffb300] border border-[#ffb300] font-['Space_Mono'] text-xs font-bold uppercase animate-pulse">NEEDS_REVEAL</span>;
    }
    if (team.status === 'in_progress' && elapsedMins >= 8) {
      return <span className="px-2 py-1 bg-[#93000a]/30 text-[#ffb4ab] border border-[#ffb4ab] font-['Space_Mono'] text-xs font-bold uppercase animate-pulse">STUCK</span>;
    }
    return null;
  }

  // Password Gate Screen
  if (!authToken) {
    return (
      <div className="min-h-screen bg-[#141313] text-[#e5e2e1] flex items-center justify-center p-6 font-['Courier_Prime'] relative">
        <div className="fixed inset-0 scanlines pointer-events-none opacity-60"></div>
        <div className="w-full max-w-md bg-[#0e0e0e] border-4 border-[#3a3939] p-8 shadow-2xl relative z-10">
          <div className="flex items-center gap-2 mb-4 text-[#00fbfb]">
            <span className="material-symbols-outlined">shield_lock</span>
            <span className="font-['Space_Mono'] text-xs font-bold tracking-widest uppercase">COORDINATOR ACCESS</span>
          </div>

          <h1 className="font-['Anton'] text-4xl text-[#ffffff] uppercase tracking-wider mb-2">AUTHENTICATE</h1>
          <p className="font-['Courier_Prime'] text-sm text-[#8e9192] mb-6">
            ENTER COORDINATOR AUTHORIZATION KEY TO ACCESS MISSION CONTROL.
          </p>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="ENTER KEY CODE"
                className="w-full bg-[#141313] border-2 border-[#8e9192] focus:border-[#00fbfb] text-[#ffffff] font-['Space_Mono'] p-3 pr-12 outline-none uppercase font-bold text-lg"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e9192] hover:text-[#00fbfb] transition-colors"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined text-xl">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            {authError && (
              <div className="p-3 border border-[#ffb4ab] bg-[#93000a]/20 text-[#ffb4ab] font-['Space_Mono'] text-xs uppercase">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 border-2 border-[#ffffff] bg-transparent text-[#ffffff] font-['Anton'] text-xl uppercase tracking-wider hover:bg-[#ffffff] hover:text-[#141313] transition-all disabled:opacity-50"
            >
              {authLoading ? 'VERIFYING...' : 'ACCESS DASHBOARD'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard Main Screen
  return (
    <div className="min-h-screen bg-[#141313] text-[#e5e2e1] font-['Courier_Prime'] flex flex-col justify-between relative">
      <div className="fixed inset-0 scanlines pointer-events-none opacity-60 z-50"></div>
      <div className="fixed inset-0 noise pointer-events-none opacity-10 z-40"></div>

      {/* Header */}
      <header className="fixed top-0 w-full z-40 flex justify-between items-center px-6 py-4 bg-[#141313]/90 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="font-['Anton'] text-2xl text-[#ffffff] uppercase tracking-tighter italic">
            BLUEPRINT RECOVERY
          </span>
          <span className="font-['Space_Mono'] text-xs text-[#00fbfb] bg-[#00fbfb]/10 border border-[#00fbfb] px-2 py-0.5 uppercase">
            COORDINATOR DASHBOARD
          </span>
        </div>
        <button
          onClick={() => {
            sessionStorage.removeItem('coord_token');
            setAuthToken('');
          }}
          className="font-['Space_Mono'] text-xs text-[#ffb4ab] hover:underline"
        >
          [ LOGOUT ]
        </button>
      </header>

      {/* Main Table */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 pt-24 pb-16 relative z-10">
        <div className="mb-6 flex justify-between items-end border-b-2 border-[#444748] pb-4">
          <div>
            <h1 className="font-['Anton'] text-4xl text-[#ffffff] uppercase tracking-widest">
              MISSION CONTROL // LIVE FEED
            </h1>
            <p className="font-['Space_Mono'] text-xs text-[#8e9192] mt-1">
              MONITORING TEAMS: {teams.length} | POLLED EVERY 3s
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#0e0e0e] border-2 border-[#444748] overflow-x-auto shadow-2xl">
          <table className="w-full text-left border-collapse font-['Space_Mono'] text-xs">
            <thead>
              <tr className="border-b-2 border-[#444748] bg-[#201f1f] text-[#ffffff] uppercase">
                <th className="p-3">TEAM #</th>
                <th className="p-3">SECTOR / COLOR</th>
                <th className="p-3">STATUS</th>
                <th className="p-3">START</th>
                <th className="p-3">CHECKPOINT A</th>
                <th className="p-3">COMPLETE</th>
                <th className="p-3">DURATION</th>
                <th className="p-3">WRONG B</th>
                <th className="p-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="p-6 text-center text-[#8e9192]">
                    LOADING LIVE TEAM DATA...
                  </td>
                </tr>
              ) : teams.length === 0 ? (
                <tr>
                  <td colSpan="9" className="p-6 text-center text-[#8e9192]">
                    NO ACTIVE TEAMS REGISTERED YET.
                  </td>
                </tr>
              ) : (
                teams.map((team) => {
                  const variantInfo = VARIANT_COLORS[team.variant_number] || {};
                  const flag = getVisualFlag(team);
                  const isBusy = actionLoading[team.team_number];

                  return (
                    <tr key={team.team_number} className="border-b border-[#353434] hover:bg-[#201f1f] transition-colors">
                      <td className="p-3 font-bold text-[#ffffff] text-sm">#{team.team_number}</td>
                      <td className="p-3 font-bold" style={{ color: variantInfo.color?.toLowerCase() === 'grey' ? '#a0a0a0' : variantInfo.color?.toLowerCase() }}>
                        {variantInfo.sectorName || '—'} ({variantInfo.color || '—'})
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 uppercase text-[10px] font-bold border ${
                          team.status === 'complete'
                            ? 'bg-[#00fbfb]/10 text-[#00fbfb] border-[#00fbfb]'
                            : team.status === 'checkpoint_a_done'
                            ? 'bg-[#00dddd]/10 text-[#00dddd] border-[#00dddd]'
                            : team.status === 'awaiting_reveal'
                            ? 'bg-[#ffb300]/20 text-[#ffb300] border-[#ffb300]'
                            : 'bg-[#2a2a2a] text-[#8e9192] border-[#444748]'
                        }`}>
                          {team.status}
                        </span>
                        {flag && <span className="ml-2">{flag}</span>}
                      </td>
                      <td className="p-3 text-[#c4c7c8]">{formatTime(team.start_time)}</td>
                      <td className="p-3 text-[#c4c7c8]">{formatTime(team.checkpoint_a_time)}</td>
                      <td className="p-3 text-[#c4c7c8]">{formatTime(team.complete_time)}</td>
                      <td className="p-3 text-[#00fbfb] font-bold">{formatDuration(team.start_time, team.complete_time)}</td>
                      <td className="p-3 text-[#ffb4ab] font-bold">{team.wrong_attempts_b || 0}</td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {team.status === 'awaiting_reveal' && (
                            <button
                              onClick={() => handleReveal(team.team_number)}
                              disabled={isBusy}
                              className="px-3 py-1 bg-[#00fbfb] text-[#141313] font-['Anton'] text-sm uppercase hover:bg-[#ffffff] transition-colors"
                            >
                              REVEAL
                            </button>
                          )}
                          <button
                            onClick={() => handleReset(team.team_number)}
                            disabled={isBusy}
                            className="px-2 py-1 border border-[#8e9192] text-[#8e9192] hover:border-[#ffb4ab] hover:text-[#ffb4ab] transition-colors uppercase text-[10px]"
                          >
                            RESET
                          </button>
                          <button
                            onClick={() => handleOverride(team.team_number)}
                            disabled={isBusy}
                            className="px-2 py-1 border border-[#444748] text-[#8e9192] hover:border-[#00fbfb] hover:text-[#00fbfb] transition-colors uppercase text-[10px]"
                          >
                            OVERRIDE
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full z-40 px-6 py-2 flex justify-between items-center bg-[#141313] border-t-2 border-[#ffffff]/30 font-['Space_Mono'] text-xs text-[#8e9192]">
        <div>© BLUEPRINT_RECOVERY // COORDINATOR SYSTEM</div>
        <div className="text-[#00fbfb]">AUTHENTICATED SESSION</div>
      </footer>
    </div>
  );
}
