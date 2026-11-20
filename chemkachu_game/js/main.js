/* ============================================================================
 * FILENAME: src/js/main.js
 * MODULE: Bridge Controller (Menu <-> Stage Intro <-> Board <-> Stage Result)
 * ============================================================================ */

import { initLoginMenu, returnToLoginMenu, finishSessionInDB, saveStageLogInDB } from './player_session.js';
import { initBoard, handleHint, startGameTimer, cleanupBoardSession, showStageIntroCard, setCurrentScore } from './ui.js';
import {
  playStageFireworksSequence,
  showStageResultCard,
  recordCompletedStage,
  getStageHistory,
  resetStageHistory,
  cleanupStageFlowTimers
} from './stage_flow.js';

/**
 * Cấu hình 3 mức độ chơi theo Luật v2:
 * - cols x rows: Kích thước ma trận ô chất
 * - seconds: Thời gian đếm ngược mỗi vòng (giây)
 * - stages: Tổng số vòng cần vượt qua để hoàn thành chế độ
 * - bonusRate: Điểm thưởng cho mỗi giây còn dư khi nối sạch bàn chơi
 */
const DIFFICULTY_CONFIG = {
  easy:   { label: 'DỄ',         cols: 6,  rows: 4, seconds: 120, stages: 8,  bonusRate: 50  },
  medium: { label: 'TRUNG BÌNH', cols: 8,  rows: 5, seconds: 150, stages: 10, bonusRate: 80  },
  hard:   { label: 'KHÓ',        cols: 10, rows: 6, seconds: 200, stages: 12, bonusRate: 150 }
};

document.addEventListener('DOMContentLoaded', () => {
  let activeDifficulty = 'easy';
  let currentStage = 1;

  /**
   * Hàm điều phối khởi động một vòng chơi bất kỳ (Vòng 1 từ Menu hoặc Vòng 2..N từ Trạm Dừng).
   * @param {number} stageNum - Số thứ tự vòng chơi (bắt đầu từ 1)
   * @param {boolean} isFirstStage - true nếu là Vòng 1 (reset điểm về 0), false nếu chơi tiếp
   */
  const launchStage = (stageNum, isFirstStage = false) => {
    const cfg = DIFFICULTY_CONFIG[activeDifficulty] || DIFFICULTY_CONFIG.easy;

    const timerBox = document.getElementById('timerBox');
    const timerBoxFill = document.getElementById('timerBoxFill');
    if (timerBox) timerBox.textContent = cfg.seconds;
    if (timerBoxFill) timerBoxFill.textContent = cfg.seconds;

    const boardWrapper = document.getElementById('boardWrapper');
    if (boardWrapper) boardWrapper.classList.add('board-fading-out');

    showStageIntroCard({
      difficultyLabel: cfg.label,
      stageNumber: stageNum,
      totalStages: cfg.stages,
      holdDurationMs: 1800,
      onCompleteCallback: () => {
        if (boardWrapper) boardWrapper.classList.remove('board-fading-out');

        initBoard(cfg.cols, cfg.rows, activeDifficulty, () => {
          startGameTimer(cfg.seconds, async () => {
            const currentScoreVal = parseInt(document.getElementById('scoreBox')?.textContent || '0', 10);

            await finishSessionInDB({
              playStatus: 'timeout',
              score: currentScoreVal,
              currentStage: stageNum,
              totalStages: cfg.stages
            });

            alert(`Hết thời gian ở Vòng ${stageNum}! Ván chơi kết thúc.`);

            sessionStorage.removeItem('chemkachu_active_player');
            cleanupStageFlowTimers();
            cleanupBoardSession();
            resetStageHistory();
            returnToLoginMenu();
          });
        }, isFirstStage);
      }
    });
  };

  // 1. Nối Slide 1 (Menu) -> Bảng Intro Vòng 1 -> Bàn chơi
  initLoginMenu(({ playerName, difficulty }) => {
    activeDifficulty = difficulty;
    currentStage = 1;
    resetStageHistory();

    const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;

    const playerLabel = document.getElementById('playerNameDisplay');
    if (playerLabel) playerLabel.textContent = playerName;

    const valDiff = document.getElementById('valDifficulty');
    if (valDiff) valDiff.textContent = cfg.label;

    const boxDiff = document.getElementById('boxDifficulty');
    if (boxDiff) {
      boxDiff.classList.remove('easy', 'medium', 'hard');
      boxDiff.classList.add(difficulty);
    }

    launchStage(1, true);
  });

  // 2. Xử lý hộp thoại xác nhận Thoát game ở góc trái Header
  const exitBtn = document.getElementById('exitGameBtn');
  const exitBubble = document.getElementById('exitConfirmBubble');
  const resumeBtn = document.getElementById('resumeGameBtn');
  const confirmExitBtn = document.getElementById('confirmExitBtn');

  const closeExitBubble = () => {
    if (exitBubble) exitBubble.classList.remove('visible');
  };

  if (exitBtn && exitBubble) {
    exitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exitBubble.classList.toggle('visible');
    });
  }

  if (resumeBtn) {
    resumeBtn.addEventListener('click', closeExitBubble);
  }

  if (confirmExitBtn) {
    confirmExitBtn.addEventListener('click', () => {
      const cfg = DIFFICULTY_CONFIG[activeDifficulty] || DIFFICULTY_CONFIG.easy;
      closeExitBubble();

      finishSessionInDB({
        playStatus: 'abandoned',
        currentStage,
        totalStages: cfg.stages
      });

      sessionStorage.removeItem('chemkachu_active_player');
      cleanupStageFlowTimers();
      cleanupBoardSession();
      resetStageHistory();
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

  // 3. Lắng nghe sự kiện nối sạch bàn chơi -> Pháo hoa -> Bảng Trạm Dừng 2x2 -> Vòng tiếp theo
  window.addEventListener('chemStageCleared', (e) => {
    const cfg = DIFFICULTY_CONFIG[activeDifficulty] || DIFFICULTY_CONFIG.easy;
    const baseScore = e.detail?.score ?? 0;
    const timeLeft = e.detail?.timeLeft ?? 0;
    const timeBonus = timeLeft * cfg.bonusRate;
    const stageTotal = baseScore + timeBonus;
    saveStageLogInDB({
      stageNumber: currentStage,
      baseScore,
      timeLeft,
      bonusRate: cfg.bonusRate,
      timeBonus,
      stageTotal
    });

    // Lưu lịch sử vòng chơi này (kèm timeLeft) để chuẩn bị cho Task 3 (PHP/MySQL & Báo cáo)
    recordCompletedStage({
      stageNumber: currentStage,
      difficulty: activeDifficulty,
      baseScore,
      timeLeft,
      bonusRate: cfg.bonusRate,
      timeBonus,
      stageTotal
    });

    // Giai đoạn 1: Bắn 3 cụm pháo hoa + hiện chữ STAGE COMPLETED ngay trên mặt bàn chơi
    playStageFireworksSequence(() => {
      // Giai đoạn 2: Mở Bảng Trạm Dừng 2x2 và chạy chuỗi cộng điểm thưởng thời gian
      showStageResultCard({
        stageNumber: currentStage,
        totalStages: cfg.stages,
        baseScore,
        timeLeft,
        bonusRate: cfg.bonusRate,
        onNextStageClick: async (finalScoreAfterBonus) => {
          // Nếu chưa tới vòng cuối -> Sang vòng kế tiếp, giữ nguyên điểm tích lũy
          if (currentStage < cfg.stages) {
            currentStage += 1;
            launchStage(currentStage, false);
            return;
          }

          // Nếu đã hoàn thành vòng cuối cùng -> Chốt phiên chơi trong DB
          await finishSessionInDB({
            playStatus: 'completed',
            score: finalScoreAfterBonus,
            currentStage,
            totalStages: cfg.stages
          });

          const totalTimeSaved = getStageHistory().reduce((sum, item) => sum + item.timeLeft, 0);
          alert(
            `CHÚC MỪNG BẠN ĐÃ PHÁ ĐẢO CHẾ ĐỘ ${cfg.label}!\n` +
            `Tổng điểm: ${finalScoreAfterBonus} | Tổng thời gian dư: ${totalTimeSaved}s\n` +
            `(Bước tiếp theo ở Task 3 ta sẽ nối PHP/MySQL và mở Bảng Báo Cáo Chi Tiết tại đây!)`
          );

          sessionStorage.removeItem('chemkachu_active_player');
          cleanupStageFlowTimers();
          cleanupBoardSession();
          resetStageHistory();
          returnToLoginMenu();
          // Ghi đè chính thức điểm đã cộng thưởng vào bộ nhớ ui.js
          setCurrentScore(finalScoreAfterBonus);
        }
      });
    });
  });

  // 4. Nút Trợ giúp (Hints)
  const hintBtn = document.getElementById('hintBtn');
  if (hintBtn) {
    hintBtn.addEventListener('click', handleHint);
  }
});