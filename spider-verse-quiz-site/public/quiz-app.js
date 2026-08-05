(function(){
  // ---------------- Dummy Data ----------------
  const AVATARS = [
    { name: "Miles Morales", universe: "Earth-1610", ability: "Invisibility & Venom Strike" },
    { name: "Gwen Stacy", universe: "Earth-65", ability: "Enhanced Agility" },
    { name: "Spider-Man India", universe: "Earth-50101", ability: "Mystic Spider Sense" },
    { name: "Spider-Punk", universe: "Earth-138", ability: "Break Every Rule" },
    { name: "Spider-Man Noir", universe: "Earth-90214", ability: "Shadow Stealth" },
    { name: "Spider-Ham", universe: "Earth-8311", ability: "Toon Physics" },
    { name: "Spider-Man 2099", universe: "Earth-928", ability: "Talons & Night Vision" },
    { name: "Scarlet Spider", universe: "Earth-616", ability: "Stinger Blast" },
    { name: "Peni Parker", universe: "Earth-14512", ability: "SP//dr Mech Sync" },
    { name: "Spider-Woman", universe: "Earth-616", ability: "Venom Blast" }
  ];

  const ROUND1_QUESTIONS = [
    { q: "What is the main purpose of the Banker's Algorithm in operating systems?",
      options: ["To speed up CPU scheduling", "To avoid deadlock by only granting requests that leave the system in a safe state", "To manage file storage", "To assign process priorities"], correct: 1 },
    { q: "Which data structure uses FIFO (First In, First Out) ordering?",
      options: ["Stack", "Queue", "Tree", "Graph"], correct: 1 },
    { q: "In networking, what does DNS primarily do?",
      options: ["Encrypts traffic", "Assigns IP addresses dynamically", "Translates domain names into IP addresses", "Compresses packets"], correct: 2 },
    { q: "What is the time complexity of binary search on a sorted array?",
      options: ["O(n)", "O(n log n)", "O(log n)", "O(1)"], correct: 2 },
    { q: "Which SQL clause is used to filter rows after a GROUP BY?",
      options: ["WHERE", "HAVING", "ORDER BY", "FILTER"], correct: 1 }
  ];

  const ROUND2_QUESTIONS = [
    { q: "In distributed systems, what does the CAP theorem say you must trade off?",
      options: ["Cost, Access, Performance", "Consistency, Availability, Partition tolerance", "Concurrency, Atomicity, Persistence", "Caching, API, Protocol"], correct: 1 },
    { q: "Which HTTP status code indicates a successful resource creation?",
      options: ["200", "201", "301", "404"], correct: 1 },
    { q: "What does the term 'race condition' describe?",
      options: ["A CPU running too fast", "Two processes competing for the same GPU", "An outcome depending on the timing of uncontrollable events", "A network speed test"], correct: 2 },
    { q: "Which of these is NOT a NoSQL database?",
      options: ["MongoDB", "Redis", "PostgreSQL", "Cassandra"], correct: 2 },
    { q: "In machine learning, what does 'overfitting' mean?",
      options: ["The model performs well on unseen data", "The model learns noise instead of the underlying pattern", "The model trains too slowly", "The dataset is too large"], correct: 1 }
  ];

  // ---------------- State ----------------
  const state = {
    token: null,
    avatar: null,
    r1Index: 0, r1Score: 0, r1Locked: false,
    r2Index: 0, r2Score: 0, r2Locked: false,
    startTime: null,
    r1Timer: null, r2Timer: null
  };

  const VIEWS = ['welcome', 'avatar', 'round1', 'transition', 'round2', 'results'];
  const STAMP_LABELS = { welcome: 'Issue: Welcome', avatar: 'Issue: Identity', round1: 'Issue: Round 1', transition: 'Issue: Interlude', round2: 'Issue: Round 2', results: 'Issue: Final' };

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1800);
  }

  function goTo(view) {
    VIEWS.forEach(v => {
      const el = document.getElementById('view-' + v);
      if (el) el.classList.remove('active');
    });
    const target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');
    const stamp = document.getElementById('status-stamp');
    if (stamp) stamp.textContent = STAMP_LABELS[view];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------- Screen 1: Welcome ----------------
  document.getElementById('enter-verse-btn').addEventListener('click', () => {
    const val = document.getElementById('token-input').value.trim();
    if (!val) {
      document.getElementById('token-error').classList.remove('hidden');
      return;
    }
    document.getElementById('token-error').classList.add('hidden');
    state.token = val;
    assignAvatar();
    goTo('avatar');
  });

  // ---------------- Screen 2: Avatar ----------------
  function assignAvatar() {
    const a = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    state.avatar = a;
    document.getElementById('avatar-name').textContent = a.name;
    document.getElementById('avatar-initial').textContent = a.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('avatar-token').textContent = '#' + state.token;
    document.getElementById('avatar-universe').textContent = a.universe;
    document.getElementById('avatar-ability').textContent = '"' + a.ability.toUpperCase() + '"';
    document.getElementById('avatar-card').classList.remove('pop-in');
    void document.getElementById('avatar-card').offsetWidth;
    document.getElementById('avatar-card').classList.add('pop-in');
  }

  document.getElementById('start-round1-btn').addEventListener('click', () => {
    state.startTime = Date.now();
    goTo('round1');
    renderQuestion(1);
  });

  // ---------------- Rounds: shared rendering ----------------
  function renderQuestion(round) {
    const isR1 = round === 1;
    const list = isR1 ? ROUND1_QUESTIONS : ROUND2_QUESTIONS;
    const idx = isR1 ? state.r1Index : state.r2Index;
    const item = list[idx];
    const prefix = isR1 ? 'r1' : 'r2';

    document.getElementById(prefix + '-qnum').textContent = 'Question ' + (idx + 1);
    document.getElementById(prefix + '-question').textContent = item.q;
    document.getElementById(prefix + '-counter').textContent = 'Question ' + (idx + 1) + ' / ' + list.length;
    document.getElementById(prefix + '-progress-bar').style.width = ((idx) / list.length * 100) + '%';
    document.getElementById(prefix + '-score').textContent = isR1 ? state.r1Score : state.r2Score;

    const optWrap = document.getElementById(prefix + '-options');
    optWrap.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];
    item.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      const tilt = ['comic-tilt-left', '', 'comic-tilt-right', '-rotate-1'][i % 4];
      btn.className = `quiz-answer group relative bg-surface comic-border p-6 ${tilt} hover:rotate-0 hover:scale-105 transition-all duration-200 text-left overflow-hidden min-h-[120px]`;
      btn.innerHTML = `<span class="absolute top-2 left-2 font-display-xl text-surface-container-highest opacity-70">${letters[i]}</span>
        <div class="relative z-10 h-full flex flex-col justify-end"><span class="font-headline-lg text-headline-lg-mobile">${opt}</span></div>`;
      btn.addEventListener('click', () => selectAnswer(round, i));
      optWrap.appendChild(btn);
    });

    startQuestionTimer(round);
  }

  function startQuestionTimer(round) {
    const isR1 = round === 1;
    const prefix = isR1 ? 'r1' : 'r2';
    clearInterval(isR1 ? state.r1Timer : state.r2Timer);
    if (isR1) state.r1Locked = false; else state.r2Locked = false;

    let seconds = 20;
    const timerEl = document.getElementById(prefix + '-timer');
    timerEl.textContent = '0:20';

    const interval = setInterval(() => {
      seconds--;
      const mins = Math.floor(seconds / 60);
      const secs = (seconds % 60).toString().padStart(2, '0');
      timerEl.textContent = `${mins}:${secs}`;
      if (seconds <= 0) {
        clearInterval(interval);
        selectAnswer(round, -1); // time's up, no selection
      }
    }, 1000);

    if (isR1) state.r1Timer = interval; else state.r2Timer = interval;
  }

  function selectAnswer(round, choiceIndex) {
    const isR1 = round === 1;
    const prefix = isR1 ? 'r1' : 'r2';
    const locked = isR1 ? state.r1Locked : state.r2Locked;
    if (locked) return;
    if (isR1) state.r1Locked = true; else state.r2Locked = true;
    clearInterval(isR1 ? state.r1Timer : state.r2Timer);

    const list = isR1 ? ROUND1_QUESTIONS : ROUND2_QUESTIONS;
    const idx = isR1 ? state.r1Index : state.r2Index;
    const item = list[idx];

    const buttons = document.querySelectorAll('#' + prefix + '-options .quiz-answer');
    if (choiceIndex >= 0 && buttons[choiceIndex]) {
      buttons[choiceIndex].classList.add('answer-selected', 'pop-in');
    }
    buttons.forEach(b => b.disabled = true);

    if (choiceIndex === item.correct) {
      if (isR1) state.r1Score++; else state.r2Score++;
    }

    setTimeout(() => {
      if (isR1) {
        state.r1Index++;
        if (state.r1Index >= ROUND1_QUESTIONS.length) {
          goTo('transition');
        } else {
          renderQuestion(1);
        }
      } else {
        state.r2Index++;
        if (state.r2Index >= ROUND2_QUESTIONS.length) {
          finishQuiz();
        } else {
          renderQuestion(2);
        }
      }
    }, 700);
  }

  // ---------------- Screen 4: Transition ----------------
  document.getElementById('continue-round2-btn').addEventListener('click', () => {
    goTo('round2');
    renderQuestion(2);
  });

  // ---------------- Screen 6: Results ----------------
  function finishQuiz() {
    const totalScore = state.r1Score + state.r2Score;
    const totalQuestions = ROUND1_QUESTIONS.length + ROUND2_QUESTIONS.length;
    const accuracy = Math.round((totalScore / totalQuestions) * 100);
    const elapsedSec = Math.floor((Date.now() - state.startTime) / 1000);
    const mins = Math.floor(elapsedSec / 60);
    const secs = (elapsedSec % 60).toString().padStart(2, '0');

    let rank = 'Legend';
    if (accuracy >= 90) rank = 'Multiverse Master';
    else if (accuracy >= 75) rank = 'Spider Genius';
    else if (accuracy >= 50) rank = 'Web Warrior';

    document.getElementById('res-avatar-name').textContent = state.avatar.name;
    document.getElementById('res-avatar-initial').textContent = state.avatar.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('res-score').textContent = totalScore;
    document.getElementById('res-accuracy').textContent = accuracy + '%';
    document.getElementById('res-time').textContent = `${mins}:${secs}`;
    document.getElementById('res-token').textContent = '#' + state.token;
    document.getElementById('res-rank').textContent = rank;

    goTo('results');
  }

  document.getElementById('exit-btn').addEventListener('click', () => {
    // Reset state for the next team at this kiosk
    state.token = null; state.avatar = null;
    state.r1Index = 0; state.r1Score = 0; state.r1Locked = false;
    state.r2Index = 0; state.r2Score = 0; state.r2Locked = false;
    document.getElementById('token-input').value = '';
    clearInterval(state.r1Timer); clearInterval(state.r2Timer);
    goTo('welcome');
  });
})();
