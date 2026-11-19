/* ============================================================
 * FILENAME: src/js/main.js
 * MODULE: Bridge Controller (Slide 1 Menu <-> Slide 2 Board)
 * ============================================================ */

import { initLoginMenu, returnToLoginMenu, finishSessionInDB } from './player_session.js';
import { initBoard, handleHint, startGameTimer, stopGameTimer, cleanupBoardSession, showStageIntroCard } from './ui.js';

const DIFFICULTY_CONFIG = {
  easy:   { label: 'DỄ',         cols: 6,  rows: 4, seconds: 120, stages: 8 },
  medium: { label: 'TRUNG BÌNH', cols: 8,  rows: 5, seconds: 150, stages: 10 },
  hard:   { label: 'KHÓ',        cols: 10, rows: 6, seconds: 200, stages: 12 }
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Nối Slide 1 -> Bảng Intro Vòng 1 (giữ nguyên Header trên đầu) -> Vào bàn chơi
  initLoginMenu(({ playerName, difficulty }) => {
    const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;

    // Đổ dữ liệu lên Dashboard (Header) ngay lập tức để người chơi thấy sẵn
    const playerLabel = document.getElementById('playerNameDisplay');
    if (playerLabel) playerLabel.textContent = playerName;

    const valDiff = document.getElementById('valDifficulty');
    if (valDiff) valDiff.textContent = cfg.label;

    const boxDiff = document.getElementById('boxDifficulty');
    if (boxDiff) {
      boxDiff.classList.remove('easy', 'medium', 'hard');
      boxDiff.classList.add(difficulty);
    }

const timerBox = document.getElementById('timerBox');
    const timerBoxFill = document.getElementById('timerBoxFill');
    if (timerBox) timerBox.textContent = cfg.seconds;
    if (timerBoxFill) timerBoxFill.textContent = cfg.seconds;

    const boardWrapper = document.getElementById('boardWrapper');
    if (boardWrapper) boardWrapper.classList.add('board-fading-out');

    showStageIntroCard({
      difficultyLabel: cfg.label,
      stageNumber: 1,
      totalStages: cfg.stages,
      holdDurationMs: 1800,
      onCompleteCallback: () => {
        if (boardWrapper) boardWrapper.classList.remove('board-fading-out');

        initBoard(cfg.cols, cfg.rows, difficulty, () => {
          startGameTimer(cfg.seconds, async () => {
            const currentScoreVal = parseInt(document.getElementById('scoreBox')?.textContent || '0', 10);

            await finishSessionInDB({
              playStatus: 'timeout',
              score: currentScoreVal
            });

            alert('Hết thời gian! Ván chơi kết thúc (bấm OK sẽ tạm thời đưa về menu).');

            sessionStorage.removeItem('chemkachu_active_player');
            cleanupBoardSession();
            returnToLoginMenu();
          });
        });
      }
    });
  });

  // 2. Nối Slide 2 -> Slide 1 khi bấm nút Thoát (góc trái Header)
  // UPDATE: Bổ sung thêm nút Xác nhận Thoát (Confirm Exit) thay vì thoát ngay
  const exitBtn = document.getElementById('exitGameBtn');
  const exitBubble = document.getElementById('exitConfirmBubble');
  const resumeBtn = document.getElementById('resumeGameBtn');
  const confirmExitBtn = document.getElementById('confirmExitBtn');

  const closeExitBubble = () => {
    if (exitBubble) exitBubble.classList.remove('visible');
  };

  // Chỉ gắn sự kiện khi cả nút Thoát và hộp xác nhận có trong DOM.
  if (exitBtn && exitBubble) {
    exitBtn.addEventListener('click', (e) => {
      // Ngăn sự kiện nổi bọt tới document; nếu không, hộp có thể vừa mở đã bị đóng.
      e.stopPropagation();
      // Đảo trạng thái hiển thị của hộp xác nhận.
      exitBubble.classList.toggle('visible');
    });
  }

  // Nút Tiếp tục chỉ đóng hộp xác nhận, giữ nguyên phiên chơi hiện tại.
  if (resumeBtn) {
    resumeBtn.addEventListener('click', closeExitBubble);
  }

  // Chỉ khi xác nhận thoát mới xóa phiên đã lưu, dọn trạng thái bàn chơi và về menu.
  if (confirmExitBtn) {
    confirmExitBtn.addEventListener('click', () => {
      closeExitBubble();
      
      // Chỉ truyền trạng thái bỏ cuộc, không cần hardcode số vòng chơi
      finishSessionInDB({ playStatus: 'abandoned' });
      
      sessionStorage.removeItem('chemkachu_active_player');
      cleanupBoardSession();
      returnToLoginMenu();
    });
  }

  document.addEventListener('click', (e) => {
    if (exitBubble && exitBubble.classList.contains('visible')) {
      if (!exitBubble.contains(e.target) && e.target !== exitBtn) {
        closeExitBubble();
      }
    }
  });

  // ==========================================================================
  // [TẠM THỜI - TEMPORARILY BEFORE ALTER]
  // Chức năng: Lắng nghe sự kiện ăn sạch bàn từ ui.js -> Dừng đồng hồ ->
  // Cập nhật điểm số & trạng thái 'completed' vào MySQL -> Hiện thông báo ->
  // Xóa session tạm & đưa người chơi quay về Slide 1 (Menu).
  // ==========================================================================
  window.addEventListener('chemStageCleared', async (e) => {
    const finalScore = e.detail?.score ?? 0;

    // 1. Dừng bộ đếm thời gian ngay lập tức để tránh hết giờ ngang khi đang đọc thông báo
    // (Cần import thêm stopGameTimer từ './ui.js' ở dòng 6 nếu muốn dừng đồng hồ)
    await finishSessionInDB({
      playStatus: 'completed',
      score: finalScore,
      currentStage: 1,
      totalStages: 1
    });

    // 2. Hiện hộp thoại thông báo của trình duyệt và chờ người chơi bấm OK
    alert('Chúc mừng bạn đã hoàn thành level thử nghiệm (bấm OK sẽ tạm thời đưa về menu)');

    // 3. Dọn dẹp bàn chơi, xóa session tạm và quay về màn hình Menu
    sessionStorage.removeItem('chemkachu_active_player');
    cleanupBoardSession();
    returnToLoginMenu();
  });

  // 3. Nút Trợ giúp (Hints)
  const hintBtn = document.getElementById('hintBtn');
  if (hintBtn) {
    hintBtn.addEventListener('click', handleHint);
  }
});