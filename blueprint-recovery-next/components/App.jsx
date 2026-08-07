'use client';
import React, { useState, useEffect } from 'react';
import { getTeamByNumber } from '@/services/teamService';
import { supabase } from '@/lib/supabaseClient';
import GlitchTransition from '@/components/GlitchTransition';

import InitializingScreen from '@/components/pages/InitializingScreen';
import HeroPage from '@/components/pages/HeroPage';
import TeamIdentification from '@/components/pages/TeamIdentification';
import MissionBriefing from '@/components/pages/MissionBriefing';
import EvidenceSecured from '@/components/pages/EvidenceSecured';
import VenueReveal from '@/components/pages/VenueReveal';
import FinalAccessCode from '@/components/pages/FinalAccessCode';
import SectorSealed from '@/components/pages/SectorSealed';

/**
 * App — Blueprint Recovery Root State Machine (With Dynamic Storage Clearing & Refresh Sync)
 */

export default function App() {
  const savedTeamNumber = typeof window !== 'undefined' ? localStorage.getItem('blueprint_team_number') : null;
  const hasTeamToResume = !!savedTeamNumber;

  const initAlreadyShown = typeof window !== 'undefined' ? sessionStorage.getItem('blueprint_init_shown') : false;
  const freshStartScreen = initAlreadyShown ? 'hero' : 'initializing';

  // Determine starting screen with refresh memory & storage deletion check
  const getInitialScreen = () => {
    if (typeof window === 'undefined') return freshStartScreen;

    // 1. URL search parameter override (e.g. ?screen=venue_reveal)
    const params = new URLSearchParams(window.location.search);
    const urlScreen = params.get('screen');
    if (urlScreen) return urlScreen;

    // 2. If localStorage team number was deleted, clear sessionStorage screen and return fresh start screen
    const storedTeamNum = localStorage.getItem('blueprint_team_number');
    if (!storedTeamNum) {
      sessionStorage.removeItem('blueprint_current_screen');
      const initShown = sessionStorage.getItem('blueprint_init_shown');
      return initShown ? 'hero' : 'initializing';
    }

    // 3. Refresh memory in sessionStorage
    const savedScreen = sessionStorage.getItem('blueprint_current_screen');
    if (savedScreen) return savedScreen;

    // 4. Fresh start default
    return freshStartScreen;
  };

  const [screen, setScreenState] = useState(getInitialScreen);
  const [teamData, setTeamData] = useState(null);
  const [resumeLoading, setResumeLoading] = useState(hasTeamToResume);

  // Helper to change screen and persist to sessionStorage for page refresh memory
  function changeScreen(nextScreen) {
    setScreenState(nextScreen);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('blueprint_current_screen', nextScreen);
    }
  }

  // Resume active team session on mount & subscribe to realtime status changes (e.g. coordinator reset/override)
  useEffect(() => {
    if (!hasTeamToResume) {
      setResumeLoading(false);
      return;
    }

    const teamNum = parseInt(savedTeamNumber, 10);

    async function attemptResume() {
      const { data } = await getTeamByNumber(teamNum);

      if (data && data.status && data.status !== 'not_started') {
        setTeamData(data);
        
        // If no explicit refresh screen stored, use DB status screen
        const savedScreen = sessionStorage.getItem('blueprint_current_screen');
        const params = new URLSearchParams(window.location.search);
        const urlScreen = params.get('screen');

        if (urlScreen) {
          changeScreen(urlScreen);
        } else if (savedScreen) {
          changeScreen(savedScreen);
        } else {
          changeScreen(statusToScreen(data.status));
        }
      } else {
        localStorage.removeItem('blueprint_team_number');
        sessionStorage.removeItem('blueprint_current_screen');
        changeScreen(freshStartScreen);
      }

      setResumeLoading(false);
    }

    attemptResume();

    // Subscribe to realtime status changes for this team
    const channel = supabase
      .channel(`team-session-${teamNum}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `team_number=eq.${teamNum}` },
        (payload) => {
          const updated = payload.new;
          if (!updated) return;
          if (updated.status === 'not_started') {
            localStorage.removeItem('blueprint_team_number');
            sessionStorage.removeItem('blueprint_current_screen');
            setTeamData(null);
            changeScreen('hero');
          } else if (updated.status === 'complete') {
            setTeamData(updated);
            changeScreen('sector_sealed');
          } else {
            setTeamData(updated);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function statusToScreen(status) {
    switch (status) {
      case 'in_progress':
        return 'mission_briefing';
      case 'awaiting_reveal':
        return 'evidence_secured';
      case 'checkpoint_a_done':
        return 'venue_reveal';
      case 'complete':
        return 'sector_sealed';
      default:
        return freshStartScreen;
    }
  }

  // Screen transition handlers
  function handleInitComplete() {
    sessionStorage.setItem('blueprint_init_shown', 'true');
    changeScreen('hero');
  }

  function handleTeamRegistered(registeredData) {
    setTeamData(registeredData);
    localStorage.setItem('blueprint_team_number', registeredData.team_number.toString());
    changeScreen('mission_briefing');
  }

  if (resumeLoading) {
    return (
      <div className="min-h-screen bg-[#050505] text-[#e5e2e1] flex items-center justify-center font-['Courier_Prime']">
        <p className="animate-pulse text-[#00fbfb] text-lg font-bold">&gt; ESTABLISHING SECURE CONNECTION...</p>
      </div>
    );
  }

  function renderCurrentScreen() {
    switch (screen) {
      case 'initializing':
        return <InitializingScreen onComplete={handleInitComplete} />;

      case 'hero':
        return <HeroPage onBeginRecovery={() => changeScreen('team_identification')} />;

      case 'team_identification':
        return <TeamIdentification onRegistered={handleTeamRegistered} />;

      case 'mission_briefing':
        return (
          <MissionBriefing
            teamData={teamData}
            onContinue={() => changeScreen('evidence_secured')}
          />
        );

      case 'evidence_secured':
        return (
          <EvidenceSecured
            teamData={teamData}
            onRevealUnlocked={(updatedData) => {
              setTeamData(updatedData);
              changeScreen('venue_reveal');
            }}
          />
        );

      case 'venue_reveal':
        return (
          <VenueReveal
            teamData={teamData}
            onProceed={() => changeScreen('final_access_code')}
          />
        );

      case 'final_access_code':
        return (
          <FinalAccessCode
            teamData={teamData}
            onSuccess={(updatedData) => {
              setTeamData(updatedData);
              changeScreen('sector_sealed');
            }}
          />
        );

      case 'sector_sealed':
        return <SectorSealed teamData={teamData} />;

      default:
        return <InitializingScreen onComplete={handleInitComplete} />;
    }
  }

  return (
    <GlitchTransition activeKey={screen}>
      {renderCurrentScreen()}
    </GlitchTransition>
  );
}
