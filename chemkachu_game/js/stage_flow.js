/* ============================================================================
 * FILENAME: src/js/stage_flow.js
 * PROJECT: Chemical Reaction Game (Windows Longhorn Plex Theme)
 * MODULE: Stage Completion Fireworks, Checkpoint 2x2 Score Roll-up & Stage Log
 * DESCRIPTION:
 * - Điều phối 2 giai đoạn ngay sau khi người chơi nối sạch cặp chất cuối cùng:
 *   + Giai đoạn 1: Bắn 3 cụm pháo hoa (mỗi cụm 5 khối vuông kế thừa từ hiệu ứng
 *     vỡ hạt) kèm dòng chữ "STAGE COMPLETED" trực tiếp trên mặt bàn chơi.
 *   + Giai đoạn 2: Mở bảng Trạm Dừng (tỉ lệ 32:18) bằng hiệu ứng zoom-gentle,
 *     chạy chuỗi 3 nhịp cộng thưởng thời gian (Luật v2: Dễ +50, TB +80, Khó +150)
 *     và lưu lại lịch sử từng vòng (bao gồm số giây dư) để xuất báo cáo cuối game.
 * ============================================================================ */

/**
 * Mảng lưu lịch sử chi tiết từng vòng đã vượt qua trong phiên chơi hiện tại.
 * Cấu trúc mỗi phần tử:
 * { stageNumber, difficulty, baseScore, timeLeft, bonusRate, timeBonus, stageTotal }
 * Dữ liệu này được giữ xuyên suốt các vòng để xuất Bảng Báo Cáo Cuối Game và gửi PHP/MySQL.
 */
let stageHistory = [];

let fireworkCleanupTimerId = null;
let draftRollIntervalId = null;
let mergeSlideTimerId = null;
let bounceTriggerTimerId = null;

/* ============================================================================
 * KHỐI 1: QUẢN LÝ LỊCH SỬ CÁC VÒNG CHƠI (PHỤC VỤ BÁO CÁO CUỐI GAME)
 * ============================================================================ */

/**
 * Ghi nhận kết quả một vòng chơi vừa hoàn thành vào bộ nhớ lịch sử.
 * Nếu người chơi hoàn thành lại cùng số vòng (do lỗi mạng/thao tác), ghi đè bản ghi cũ.
 */
export function recordCompletedStage(stageRecord) {
  const existingIdx = stageHistory.findIndex(item => item.stageNumber === stageRecord.stageNumber);
  if (existingIdx >= 0) {
    stageHistory[existingIdx] = stageRecord;
  } else {
    stageHistory.push(stageRecord);
  }
}

/**
 * Trả về bản sao mảng lịch sử các vòng đã chơi (dùng cho trang Báo Cáo Cuối Game).
 */
export function getStageHistory() {
  return stageHistory.map(item => ({ ...item }));
}

/**
 * Xóa sạch lịch sử vòng chơi khi bắt đầu phiên mới hoặc thoát về Menu.
 */
export function resetStageHistory() {
  stageHistory = [];
}

/* ============================================================================
 * KHỐI 2: GIAI ĐOẠN 1 — PHÁO HOA KẾ THỪA 3 CỤM x 5 KHỐI TRÊN MẶT BÀN CHƠI
 * Hành vi tổng quát:
 * - Không tạo khung nền mới; tận dụng chính lớp #stageCompletedBanner nằm đè
 *   trong suốt lên tâm bàn chơi.
 * - Kế thừa class `.chem-shatter-particle-15` của hiệu ứng ăn cặp, gắn thêm
 *   class `.chem-firework-particle` để tạo cụm 5 khối bung hình cánh cung.
 * - Nhân bản cụm 5 khối này 3 lần tại 3 tọa độ: Trái trên (15%, 32%),
 *   Giữa (50%, 38%), và Phải trên (85%, 32%).
 * ============================================================================ */

/**
 * Bắn 1 chùm pháo hoa 14 tia bung tỏa 360° (vòng ngoài 10 tia + vòng trong 4 tia)
 * với bảng màu riêng để tạo hiệu ứng lễ hội rực rỡ trên mặt bàn kính mờ.
 */
function spawnSingleFireworkCluster(container, originXPercent, originYPercent, palette, clusterDelaySec = 0) {
  const totalRays = 14;

  for (let i = 0; i < totalRays; i++) {
    const particle = document.createElement('div');
    particle.className = 'chem-shatter-particle-15 chem-firework-particle';
    particle.style.left = `${originXPercent}%`;
    particle.style.top = `${originYPercent}%`;

    // Chia góc đều 360° + lệch nhẹ ngẫu nhiên cho tự nhiên; 4 tia cuối tạo vòng nhân bên trong
    const isInnerRing = i >= 10;
    const baseAngle = isInnerRing ? (i - 10) * 90 + 45 : (i * 360) / 10;
    const rad = ((baseAngle + (Math.random() - 0.5) * 14) * Math.PI) / 180;
    const radius = isInnerRing ? 42 + Math.random() * 12 : 76 + Math.random() * 20;

    const dx = Math.cos(rad) * radius;
    const dy = Math.sin(rad) * radius;

    particle.style.setProperty('--fw-dx', `${dx.toFixed(1)}px`);
    particle.style.setProperty('--fw-dy', `${dy.toFixed(1)}px`);
    particle.style.setProperty('--fw-color', palette.core);
    particle.style.setProperty('--fw-glow', palette.glow);
    particle.style.setProperty('--fw-delay', `${clusterDelaySec}s`);

    container.appendChild(particle);
    setTimeout(() => particle.remove(), (1.5 + clusterDelaySec) * 1000);
  }
}

export function playStageFireworksSequence(onFireworksFinished) {
  const banner = document.getElementById('stageCompletedBanner');
  if (!banner) {
    if (typeof onFireworksFinished === 'function') onFireworksFinished();
    return;
  }

  banner.querySelectorAll('.chem-firework-particle').forEach(el => el.remove());
  banner.classList.remove('stage-hidden');

  // Bắn 4 chùm pháo hoa 4 màu nối tiếp nhau quanh dòng chữ "HOÀN THÀNH VÒNG CHƠI"
  spawnSingleFireworkCluster(banner, 18, 30, { core: '#fde047', glow: '#f59e0b' }, 0.00); // Vàng kim
  spawnSingleFireworkCluster(banner, 82, 28, { core: '#38bdf8', glow: '#0284c7' }, 0.14); // Xanh Plex
  spawnSingleFireworkCluster(banner, 26, 68, { core: '#4ade80', glow: '#16a34a' }, 0.28); // Ngọc lục bảo
  spawnSingleFireworkCluster(banner, 76, 66, { core: '#f472b6', glow: '#db2777' }, 0.40); // Hồng rực

  clearTimeout(fireworkCleanupTimerId);
  fireworkCleanupTimerId = setTimeout(() => {
    banner.classList.add('stage-hidden');

    setTimeout(() => {
      if (typeof onFireworksFinished === 'function') {
        onFireworksFinished();
      }
    }, 350);
  }, 1900);
}

/* ============================================================================
 * KHỐI 3: GIAI ĐOẠN 2 — BẢNG TRẠM DỪNG 2x2 & CHUỖI 3 NHỊP CỘNG ĐIỂM THỜI GIAN
 * Hành vi tổng quát:
 * - Nhịp 1 (Đếm nháp 0.1s): Số nháp vàng bên cạnh điểm gốc tăng dần theo từng
 *   nấc đơn giá (+50 / +80 / +150) mỗi 0.1s cho đến khi rút hết số giây dư.
 * - Nhịp 2 (Trượt nhập): Số nháp vàng dịch chuyển ngang về phía số điểm gốc.
 * - Nhịp 3 (Va chạm 90% & Nảy số): Khi số nháp đi được 90% quãng đường (342ms
 *   trên tổng 380ms), số nháp biến mất, số điểm gốc cập nhật sang tổng mới và
 *   bật hiệu ứng zoom-bounce (phóng 1.12x rồi hạ êm về 1.0x trong 1s).
 * ============================================================================ */

/**
 * Hủy toàn bộ bộ đếm animation của Bảng Trạm Dừng (dùng khi bấm Chơi tiếp hoặc Thoát game).
 */
export function cleanupStageFlowTimers() {
  clearTimeout(fireworkCleanupTimerId);
  clearInterval(draftRollIntervalId);
  clearTimeout(mergeSlideTimerId);
  clearTimeout(bounceTriggerTimerId);

  fireworkCleanupTimerId = null;
  draftRollIntervalId = null;
  mergeSlideTimerId = null;
  bounceTriggerTimerId = null;

  const banner = document.getElementById('stageCompletedBanner');
  if (banner) {
    banner.classList.add('stage-hidden');
    banner.querySelectorAll('.chem-firework-particle').forEach(el => el.remove());
  }

  const overlay = document.getElementById('stageResultOverlay');
  if (overlay) {
    overlay.classList.add('stage-hidden');
    overlay.classList.remove('is-zoom-gentle');
  }
}

/**
 * Hiển thị Bảng Trạm Dừng (table 2x2) và chạy chuỗi animation cộng thưởng thời gian.
 */
export function showStageResultCard({
  stageNumber = 1,
  totalStages = 8,
  baseScore = 0,
  timeLeft = 0,
  bonusRate = 50,
  onNextStageClick = null
} = {}) {
  const overlay = document.getElementById('stageResultOverlay');
  const titleElem = document.getElementById('resultStageTitle');
  const mainScoreElem = document.getElementById('resultBaseScore');
  const draftBonusElem = document.getElementById('resultDraftBonus');
  const timeDetailElem = document.getElementById('resultTimeDetail');
  const badgeListElem = document.getElementById('resultBadgeList');
  const nextBtn = document.getElementById('nextStageBtn');

  if (!overlay || !mainScoreElem || !draftBonusElem || !timeDetailElem || !nextBtn) return;

  // Dọn các timer animation cũ trước khi chạy lượt mới
  clearInterval(draftRollIntervalId);
  clearTimeout(mergeSlideTimerId);
  clearTimeout(bounceTriggerTimerId);

  const totalBonus = timeLeft * bonusRate;
  const finalStageTotal = baseScore + totalBonus;

  // 1. Đổ dữ liệu ban đầu vào bảng 2x2
  if (titleElem) titleElem.textContent = `VÒNG ${stageNumber}`;
  mainScoreElem.textContent = baseScore;
  mainScoreElem.classList.remove('is-bouncing');

  draftBonusElem.textContent = '+0';
  draftBonusElem.style.transform = 'translateX(0px) scale(1)';
  draftBonusElem.classList.remove('is-merged-hidden');

  timeDetailElem.textContent = `+${bonusRate} (${timeLeft}s left)`;

  // 2. Render hàng huy hiệu:
  // - Các vòng đã thắng dùng ảnh bình thuỷ tinh xanh (chem_win_badge.png)
  // - Riêng huy hiệu của vòng VỪA thắng (i === stageNumber - 1) chạy hiệu ứng BOOM dập vào khay
  if (badgeListElem) {
    badgeListElem.innerHTML = '';
    for (let i = 0; i < totalStages; i++) {
      const img = document.createElement('img');
      const isEarned = i < stageNumber;
      const isNewestBadge = i === stageNumber - 1;

      img.src = isEarned
        ? './src/ui_cpnt_buttons/badge_collection/chem_win_badge.png'
        : './src/ui_cpnt_buttons/badge_collection/chem_win_slotted.png';
      img.alt = `Huy hiệu vòng ${i + 1}`;

      if (isNewestBadge) {
        img.className = 'stage-badge-slot is-boom-new';
      } else if (isEarned) {
        img.className = 'stage-badge-slot is-earned';
      } else {
        img.className = 'stage-badge-slot';
      }

      badgeListElem.appendChild(img);
    }
  }

  // Đổi nhãn nút ở vòng cuối cùng để người chơi biết sắp vào Báo cáo tổng kết
  nextBtn.textContent = stageNumber >= totalStages ? 'XEM BÁO CÁO' : 'CHƠI TIẾP';
  nextBtn.disabled = timeLeft > 0; // Khóa nhẹ nút bấm trong lúc đang chạy cộng nháp

  nextBtn.onclick = () => {
    overlay.classList.add('stage-hidden');
    overlay.classList.remove('is-zoom-gentle');
    if (typeof onNextStageClick === 'function') {
      onNextStageClick(finalStageTotal);
    }
  };

  // 3. Mở khung Trạm Dừng với hiệu ứng zoom-gentle
  overlay.classList.remove('stage-hidden', 'is-zoom-gentle');
  void overlay.offsetWidth; // Reflow kích hoạt animation zoom-gentle
  overlay.classList.add('is-zoom-gentle');

  // Trường hợp hết sạch giây dư (0s left): không cần chạy đếm nháp, mở khóa nút ngay
  if (timeLeft <= 0) {
    draftBonusElem.classList.add('is-merged-hidden');
    nextBtn.disabled = false;
    return;
  }

  // 4. NHỊP 1: Đếm nháp tăng dần (Increment mỗi 0.1s = 100ms) cho đến khi hết số giây dư
  // Nếu số giây dư quá lớn (> 35s), tự động gộp bước nhảy mỗi 0.1s để tổng thời gian đếm không quá 3.5s
  const secStepPerTick = timeLeft > 35 ? Math.ceil(timeLeft / 35) : 1;
  let processedSeconds = 0;

  // Chờ 380ms cho khung bảng zoom-gentle mở xong hẳn rồi mới bắt đầu đếm nháp
  mergeSlideTimerId = setTimeout(() => {
    draftRollIntervalId = setInterval(() => {
      processedSeconds = Math.min(timeLeft, processedSeconds + secStepPerTick);
      const currentDraftPoints = processedSeconds * bonusRate;
      draftBonusElem.textContent = `+${currentDraftPoints}`;

      // Khi đã rút cạn toàn bộ số giây dư -> Chuyển sang NHỊP 2 (Trượt nhập điểm)
      if (processedSeconds >= timeLeft) {
        clearInterval(draftRollIntervalId);
        draftRollIntervalId = null;

        // Dừng 150ms cho người chơi nhìn rõ tổng điểm thưởng rồi phóng nhanh trong 0.55s
        mergeSlideTimerId = setTimeout(() => {
          const mainRect = mainScoreElem.getBoundingClientRect();
          const draftRect = draftBonusElem.getBoundingClientRect();

          // Chỉ lấy 90% khoảng cách tâm-tới-tâm để số nháp dừng lại ngay điểm chạm mép số gốc
          const fullDeltaX = (mainRect.left + mainRect.width / 2) - (draftRect.left + draftRect.width / 2);
          const contactDeltaX = fullDeltaX * 0.9;

          // Kích hoạt CSS transition trượt nhanh tới vị trí 90% trong 0.55s
          draftBonusElem.style.transform = `translateX(${contactDeltaX.toFixed(1)}px) scale(0.88)`;

          // Vừa chạm đích 90% ở mốc 0.55s (550ms) -> Nhập số & bật zoom-bounce 1.12x
          bounceTriggerTimerId = setTimeout(() => {
            draftBonusElem.classList.add('is-merged-hidden');

            // Cập nhật điểm tổng mới lên Bảng Trạm Dừng và Thanh Header
            mainScoreElem.textContent = finalStageTotal;
            const headerScoreBox = document.getElementById('scoreBox');
            if (headerScoreBox) headerScoreBox.textContent = finalStageTotal;

            // Kích hoạt hiệu ứng zoom-bounce nhẹ (scale 1.12x -> 1.0x trong 1s)
            mainScoreElem.classList.remove('is-bouncing');
            void mainScoreElem.offsetWidth;
            mainScoreElem.classList.add('is-bouncing');

            // Mở khóa nút CHƠI TIẾP
            nextBtn.disabled = false;
          }, 550);
        }, 150);
      }
    }, 100);
  }, 380);
}