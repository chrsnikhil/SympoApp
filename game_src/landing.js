// ═══════════════════════════════════════════
// landing.js — Entry screen and transition logic
// ═══════════════════════════════════════════

export function initLanding() {
  const playBtn = document.getElementById('landing-play-btn');
  const htpSkipBtn = document.getElementById('htp-skip-btn');
  const hudHtpBtn = document.getElementById('hud-htp-btn');
  const landingPage = document.getElementById('landing-page');
  const htpPage = document.getElementById('how-to-play-page');
  const appContainer = document.getElementById('app-container');
  const landingBg = document.querySelector('.landing-bg');

  let autoSkipTimer = null;
  let gameStarted = false;

  // Fallback if background video fails to load
  if (landingBg) {
    landingBg.addEventListener('error', () => {
      landingBg.style.display = 'none';
      landingPage.style.background = 'radial-gradient(circle at center, #0a1520 0%, #000000 100%)';
    });
  }

  const dismissHtp = () => {
    if (autoSkipTimer) {
      clearTimeout(autoSkipTimer);
      autoSkipTimer = null;
    }
    if (htpSkipBtn) htpSkipBtn.classList.add('glitch-burst');
    
    setTimeout(() => {
      htpPage.style.opacity = '0';
      setTimeout(() => {
        htpPage.style.display = 'none';
        htpSkipBtn?.classList.remove('glitch-burst');
        
        if (!gameStarted) {
          gameStarted = true;
          transitionToGame();
        }
      }, 500);
    }, 250);
  };

  if (!playBtn) return; // Not on the landing page structure

  playBtn.addEventListener('click', () => {
    // 1. Trigger glitch burst on the button
    playBtn.classList.add('glitch-burst');

    // 2. Wait for burst to finish (~300ms) then transition to How To Play
    setTimeout(() => {
      // Fade out landing page
      landingPage.style.opacity = '0';
      
      setTimeout(() => {
        landingPage.style.display = 'none';
        
        if (htpPage) {
          // Show How To Play Page
          htpPage.style.display = 'flex';
          // Force reflow
          htpPage.offsetHeight;
          htpPage.style.opacity = '1';
          
          // Auto-skip after 60 seconds
          autoSkipTimer = setTimeout(dismissHtp, 60000);
        } else {
          // Directly transition to game if HTP page is missing
          transitionToGame();
        }
      }, 500); // Wait for opacity fade
    }, 250);
  });

  if (htpSkipBtn) {
    htpSkipBtn.addEventListener('click', dismissHtp);
  }

  if (hudHtpBtn) {
    hudHtpBtn.addEventListener('click', () => {
       // Show How To Play Page without auto-skip when triggered from HUD
       htpPage.style.display = 'flex';
       htpPage.offsetHeight; // Force reflow
       htpPage.style.opacity = '1';
    });
  }

  const transitionToGame = () => {
    // Show game app container and fade it in
    appContainer.style.display = 'block';
    
    // Force a synchronous layout recalculation
    appContainer.offsetHeight; 
    
    // Dispatch resize immediately
    window.dispatchEvent(new Event('resize'));

    // Small delay to allow display: block to apply before opacity transition
    setTimeout(() => {
      appContainer.style.opacity = '1';
      // Dispatch again just in case flex took time to settle
      window.dispatchEvent(new Event('resize'));
    }, 50);
  };
}
