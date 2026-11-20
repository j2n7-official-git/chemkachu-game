/* ============================================================================
 * FILENAME: src/js/player_session.js
 * MODULE: Menu Login Validation & Centered Sky-Blue Glow Selector
 * ============================================================================ */

const SESSION_KEY = 'chemkachu_active_player';

let currentSession = {
  recordId: null,
  playerName: '',
  difficulty: 'easy',
  score: 0
};

export function initLoginMenu(onStartGameCallback) {
  const gameSpace = document.getElementById('gameSpace');
  const menuOverlay = document.getElementById('menuView');
  const nameInput = document.getElementById('playerNameInput');
  const errorBubble = document.getElementById('nameErrorBubble');
  const diffGroup = document.getElementById('menuDiffGroup');
  const sliderFrame = document.getElementById('diffSliderFrame');
  const diffButtons = Array.from(document.querySelectorAll('.menu-diff-btn'));
  const startBtn = document.getElementById('startGameBtn');

  if (!menuOverlay || !nameInput || !startBtn) return;

  let bubbleTimer = null;

  // Tính tọa độ khung phát sáng nhỏ hơn nút 2px mỗi cạnh để glow tỏa đều từ tâm (shadow giữa)
  const moveSliderToIndex = (index) => {
    if (!diffGroup || !sliderFrame || index < 0 || index >= diffButtons.length) return;

    diffButtons.forEach((btn, i) => {
      btn.classList.toggle('is-selected', i === index);
    });

    const groupWidth = diffGroup.clientWidth;
    const groupHeight = diffGroup.clientHeight;
    if (groupWidth === 0) return;

    const gap = 8; // Khớp gap: 8px của .menu-diff-group
    const colWidth = (groupWidth - gap * 2) / 3;

    const targetWidth = colWidth - 8;
    const targetHeight = groupHeight - 8;
    const targetLeft = index * (colWidth + gap) + 4;
    const targetTop = 4;

    sliderFrame.style.width = `${targetWidth}px`;
    sliderFrame.style.height = `${targetHeight}px`;
    sliderFrame.style.transform = `translate(${targetLeft}px, ${targetTop}px)`;
  };

  const syncActiveSlider = () => {
    const activeIdx = diffButtons.findIndex(btn => btn.classList.contains('is-selected'));
    moveSliderToIndex(activeIdx >= 0 ? activeIdx : 0);
  };

  // Tự động tính lại tâm glow mỗi khi Navbar của bạn em expand/collapse làm đổi độ rộng
  if (diffGroup && window.ResizeObserver) {
    new ResizeObserver(syncActiveSlider).observe(diffGroup);
  }
  requestAnimationFrame(syncActiveSlider);

  // Chuyển nút mức độ: nút cũ thu nhỏ viền trắng, nút mới phồng +2px viền xanh sáng
  diffButtons.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      currentSession.difficulty = btn.dataset.diff;
      moveSliderToIndex(idx);
    });
  });

  nameInput.addEventListener('input', () => {
    if (nameInput.value.trim().length > 0) hideErrorBubble();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startBtn.click();
  });

  // UPDATE: THÊM SOUND ERROR VÔ GAME VÀ TỪ HÀM SHOW ERROR BUBBLE, TỰ ĐỘNG PHÁT SOUND VÀ LÀMM
  const errorAudio = new Audio('./src/sfx/chem_error_sign.wav');
  function showErrorBubble(msg) {
    if (!errorBubble) return;
    errorBubble.textContent = msg;
    errorBubble.classList.add('visible');

    // Phát âm thanh báo lỗi (reset về 0s để bấm liên tiếp vẫn kêu ngay)
    errorAudio.currentTime = 0;
    errorAudio.play().catch(() => {});

    nameInput.classList.remove('input-shake');
    void nameInput.offsetWidth;
    nameInput.classList.add('input-shake');
    nameInput.focus();

    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideErrorBubble, 3500);
  }

  function hideErrorBubble() {
    if (!errorBubble) return;
    errorBubble.classList.remove('visible');
    nameInput.classList.remove('input-shake');
  }

  //--------------------------------------------------------------------------------//

  // Bấm CHƠI: Kiểm tra tên -> Lưu session -> Ẩn Slide 1 & Mở khóa Header + Bàn chơi
startBtn.addEventListener('click', async () => {
    const cleanName = nameInput.value.trim();

    if (!cleanName) {
      showErrorBubble('ERROR: Bạn cần nhập tên trước khi chơi');
      return;
    }

    currentSession.recordId = null;
    currentSession.playerName = cleanName;
    currentSession.score = 0;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));

    menuOverlay.classList.add('menu-hidden');
    if (gameSpace) gameSpace.classList.remove('is-menu-state');

    if (typeof onStartGameCallback === 'function') {
      onStartGameCallback({ ...currentSession });
    }

    try {
      const res = await fetch('./api/save_score.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          player_name: cleanName,
          difficulty: currentSession.difficulty,
          total_stages: ({ easy: 8, medium: 10, hard: 12 }[currentSession.difficulty] || 8)
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        currentSession.recordId = data.session_id;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
      }
    } catch (err) {
      console.warn('Lỗi kết nối PHP/MySQL:', err);
    }
  });
}

export function getActivePlayerSession() {
  const cached = sessionStorage.getItem(SESSION_KEY);
  return cached ? JSON.parse(cached) : currentSession;
}

export function returnToLoginMenu() {
  const gameSpace = document.getElementById('gameSpace');
  const menuOverlay = document.getElementById('menuView');
  

  if (gameSpace) gameSpace.classList.add('is-menu-state');
  if (menuOverlay) menuOverlay.classList.remove('menu-hidden');
}

export async function finishSessionInDB({ playStatus, score = null, currentStage = 1, totalStages = 8 }) {
  const session = getActivePlayerSession();
  if (!session || !session.recordId) return;

  try {
    await fetch('./api/save_score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        action: 'finish',
        session_id: session.recordId,
        play_status: playStatus,
        score,
        current_stage: currentStage,
        total_stages: totalStages
      })
    });
  } catch (err) {
    console.warn('Không lưu được trạng thái vào MySQL:', err);
  }
}

export async function saveStageLogInDB({
  stageNumber,
  baseScore,
  timeLeft,
  bonusRate,
  timeBonus,
  stageTotal
}) {
  const session = getActivePlayerSession();
  if (!session || !session.recordId) return;

  try {
    await fetch('./api/save_score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        action: 'save_stage',
        session_id: session.recordId,
        stage_number: stageNumber,
        base_score: baseScore,
        time_left: timeLeft,
        bonus_rate: bonusRate,
        time_bonus: timeBonus,
        stage_total: stageTotal
      })
    });
  } catch (err) {
    console.warn('Không lưu được log vòng chơi vào MySQL:', err);
  }
}