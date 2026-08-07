import React, { useState, useEffect } from 'react';
import { registerOrResumeTeam } from '../services/teamService';

/**
 * Screen 03: Team Identification (03-team-identification)
 * Case file manila folder layout with typewriter team number input.
 * Enhanced with 5-Second RGB Color Glitch effect (no extra background animations).
 */
export default function TeamIdentification({ onRegistered }) {
  const [teamInput, setTeamInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [rgbGlitch, setRgbGlitch] = useState(false);

  useEffect(() => {
    // Strict 5-Second RGB Color Glitch Interval
    const rgbInterval = setInterval(() => {
      setRgbGlitch(true);
      setTimeout(() => setRgbGlitch(false), 350);
    }, 5000);

    return () => clearInterval(rgbInterval);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage('');

    const cleanInput = teamInput.trim();
    if (!cleanInput) {
      setErrorMessage('Please enter a team number before verifying.');
      return;
    }

    const num = parseInt(cleanInput, 10);
    if (isNaN(num) || num < 1 || num > 60) {
      setErrorMessage('INVALID IDENTIFIER — Please enter a valid team number between 1 and 60.');
      return;
    }

    setLoading(true);
    const { data, isAlreadyRegistered, error } = await registerOrResumeTeam(cleanInput);
    setLoading(false);

    if (isAlreadyRegistered || error === 'ALREADY_REGISTERED') {
      setErrorMessage(`SECTOR ENCRYPTION LOCKED — Team #${cleanInput} is already registered. Please consult your Event Coordinator to reset if needed.`);
      return;
    }

    if (error || !data) {
      setErrorMessage(error || 'Failed to register team. Please try again.');
      return;
    }

    // App.jsx handles persisting team_number to localStorage
    onRegistered?.(data);
  }

  return (
    <div className={`min-h-screen font-['Courier_Prime'] text-[#e5e2e1] bg-[#141313] relative overflow-x-hidden flex flex-col justify-between transition-all ${rgbGlitch ? 'hue-rotate-90 saturate-200' : ''}`}>
      {/* Ambient Scanlines & Noise */}
      <div className="fixed inset-0 scanlines pointer-events-none z-40 opacity-70"></div>
      <div className="fixed inset-0 noise pointer-events-none z-41 opacity-5"></div>

      {/* 5-Second RGB Color Glitch Burst Overlay */}
      {rgbGlitch && (
        <>
          <div className="fixed inset-0 z-50 pointer-events-none mix-blend-screen opacity-90 transition-all duration-75 animate-pulse bg-[linear-gradient(90deg,rgba(255,0,85,0.3)_0%,rgba(0,251,251,0.3)_100%)] shadow-[inset_0_0_100px_rgba(255,0,85,0.5)]"></div>
          <div className="fixed inset-0 z-51 pointer-events-none mix-blend-color-dodge opacity-80 backdrop-invert-[0.15] translate-x-[4px] -translate-y-[2px]"></div>
        </>
      )}

      {/* Top Header — Transparent & Blended */}
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 bg-transparent backdrop-blur-sm bg-gradient-to-b from-[#141313]/70 via-[#141313]/30 to-transparent border-b-2 border-[#ffffff]/20 border-dashed">
        <div className="flex items-center gap-4">
          <span className={`font-['Anton'] text-2xl text-[#ffffff] uppercase tracking-tighter italic transition-all ${rgbGlitch ? '[text-shadow:-4px_0_#ff0055,4px_0_#00fbfb]' : ''}`}>
            BLUEPRINT RECOVERY
          </span>
        </div>
        <div className="flex gap-4 text-[#ffffff]">
          <span className="material-symbols-outlined">settings_input_component</span>
          <span className="material-symbols-outlined">terminal</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center pt-24 pb-16 px-6 relative z-10">
        <div className={`manila-folder w-full max-w-4xl p-8 md:p-12 relative transform -rotate-1 md:rotate-1 mt-8 bg-[#C2B280] text-[#141313] rounded-tr-xl shadow-2xl transition-all ${rgbGlitch ? 'border-4 border-[#00fbfb] shadow-[0_0_30px_rgba(255,0,85,0.7)] translate-x-[2px] -translate-y-[2px]' : ''}`}>
          {/* Folder Tab */}
          <div className="absolute -top-8 left-0 h-8 w-1/3 bg-[#C2B280] border-t-2 border-r-2 border-[#141313]/30 rounded-tr-lg">
            <p className="font-['Space_Mono'] text-xs px-4 py-2 opacity-60 text-[#141313]">FILE: BR-99-ALPHA</p>
          </div>

          {/* Evidence Tag */}
          <div className={`evidence-tag font-['Space_Mono'] text-xs font-bold bg-[#e5e2e1] text-[#141313] border border-[#141313] absolute -top-3 right-4 px-3 py-1 rotate-12 shadow-md transition-all ${rgbGlitch ? 'bg-[#ff0055] text-white border-[#00fbfb]' : ''}`}>
            EXHIBIT A
          </div>

          {/* Header Section */}
          <div className="flex flex-col sm:flex-row justify-between items-start mb-8 border-b-2 border-[#141313]/20 pb-4">
            <div>
              <h1 className={`font-['Anton'] text-4xl md:text-5xl uppercase tracking-tighter mb-1 text-[#141313] transition-all ${rgbGlitch ? '[text-shadow:-5px_0_#ff0055,5px_0_#00fbfb]' : ''}`}>
                TEAM IDENTIFICATION
              </h1>
              <p className="font-['Space_Mono'] text-xs opacity-80 text-[#141313]">FORM 404-B // CLEARANCE LEVEL: OMEGA</p>
            </div>
            <div className={`ink-stamp text-[#93000a] border-4 border-[#93000a] px-4 py-1 font-['Anton'] text-xl tracking-widest mt-4 sm:mt-0 transform -rotate-6 transition-all ${rgbGlitch ? 'border-[#00fbfb] text-[#00fbfb] bg-[#141313]' : ''}`}>
              TOP SECRET
            </div>
          </div>

          {/* Document Body */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8">
            <div className="md:col-span-7 space-y-4 text-sm md:text-base leading-relaxed text-[#141313]">
              <p>
                SUBJECT: Operation <span className="bg-[#141313] text-[#141313] hover:text-[#C2B280] hover:bg-[#0e0e0e] transition-colors cursor-pointer px-1">SHATTERED GLASS</span>. Personnel deployed to Sector <span className="bg-[#141313] text-[#141313] hover:text-[#C2B280] hover:bg-[#0e0e0e] transition-colors cursor-pointer px-1">7G</span> reported anomalies consistent with cognitive intrusion.
              </p>
              <p>
                Initial contact established at 0400 hours. The operative identified themselves as part of TEAM <span className="bg-[#141313] text-[#141313] hover:text-[#C2B280] hover:bg-[#0e0e0e] transition-colors cursor-pointer px-1">CLASSIFIED_STRING</span>, but physical identification tags were destroyed.
              </p>
              <p className="font-bold">
                AUTHORIZATION REQUIRED: Input assigned team identifier below (1 to 60) to decrypt operational logs.
              </p>
            </div>

            {/* Attached Evidence Image */}
            <div className="md:col-span-5 relative">
              <div className={`border-4 border-[#141313]/40 p-2 transform rotate-2 bg-[#dcd0a6] shadow-md transition-all ${rgbGlitch ? 'border-[#ff0055] scale-105' : ''}`}>
                <img
                  className={`object-cover w-full h-44 filter grayscale contrast-125 sepia-[.2] transition-all ${rgbGlitch ? 'contrast-200 saturate-200 invert-[0.1]' : ''}`}
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuALIkJw7aBWt3E2SdfIGBBvJgG0LnWPSVLOgpQfwYgnJPNATugt-Gjt5wEqspUqLcy3N4xpKZdWiN-TdhVF8W4bmRaCPRDth7yVy1qG9KQI8xBkL8C6b7L6Fgx9skYNtz7sAKYJ33Lt4p3ZZDn2PwrsJglhLChJrcL0QWtQ46YQJb9wEqrDmTqtA28zOKecK3K6qgDgxYzlzFftZL3w8DWTekoPRFiXXoizdRU24hZpCZLsMyz4OMER"
                  alt="Detective Desk Evidence"
                />
                <p className="font-['Space_Mono'] text-xs mt-2 text-center opacity-70">REF: DESK_01</p>
              </div>
            </div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="mt-6 p-6 border-2 border-[#141313]/40 border-dashed relative bg-[#C2B280]/50">
            <label className="block font-['Space_Mono'] text-xs font-bold mb-3 text-[#141313]" htmlFor="team-number">
              INPUT REQUIRED: TEAM NUMBER (1 - 60)
            </label>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl text-[#141313]">&gt;</span>
              <input
                id="team-number"
                type="number"
                min="1"
                max="60"
                required
                value={teamInput}
                onChange={(e) => setTeamInput(e.target.value)}
                placeholder="ENTER TEAM NUMBER (1-60)"
                className="w-full max-w-sm bg-transparent border-b-2 border-[#141313] focus:border-[#00fbfb] text-[#141313] font-['Courier_Prime'] text-xl p-1 outline-none font-bold"
                disabled={loading}
              />
            </div>

            {/* Error Message Box */}
            {errorMessage && (
              <div className="mt-4 p-3 border-2 border-[#93000a] bg-[#93000a]/10 text-[#93000a] font-['Space_Mono'] text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">warning</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`mt-6 border-4 border-[#141313] text-[#141313] px-8 py-3 font-['Anton'] text-2xl uppercase hover:bg-[#141313] hover:text-[#C2B280] transition-colors relative group disabled:opacity-50 ${rgbGlitch ? 'border-[#00fbfb] text-[#00fbfb] bg-[#141313]' : ''}`}
            >
              {loading ? 'VERIFYING...' : 'VERIFY IDENTITY'}
              <span className="absolute inset-0 border-4 border-[#00fbfb] opacity-0 group-hover:opacity-100 group-hover:translate-x-1 group-hover:translate-y-1 transition-all pointer-events-none -z-10"></span>
            </button>
          </form>

          {/* AWAITING_INPUT Stamp */}
          <div className="absolute bottom-6 right-6 border-4 border-[#00fbfb] text-[#00fbfb] px-4 py-1 font-['Anton'] text-xl tracking-widest transform rotate-3 bg-[#141313]/90 shadow-lg">
            AWAITING_INPUT
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full z-50 px-6 py-2 flex justify-between items-center bg-[#141313] border-t-2 border-[#ffffff]/30 font-['Space_Mono'] text-xs text-[#8e9192]">
        <div>© BLUEPRINT_RECOVERY // SYSTEM_STATUS: DEGRADED</div>
        <div className="flex gap-4">
          <span className="opacity-70">FORM: 404-B</span>
          <span className="text-[#00fbfb] underline">CLEARANCE: OMEGA</span>
        </div>
      </footer>
    </div>
  );
}
