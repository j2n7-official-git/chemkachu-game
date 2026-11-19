/* ============================================================================
 * FILENAME: src/js/ui.js
 * MODULE: UI Controller, Locked-Stock Board Engine & Smart Hint System
 * ============================================================================ */

import { REACTION_DATABASE, checkChemicalReaction } from './chem_reactions.js';
import { checkPathPikachu } from './pathfinding.js';

let remainingHints = 5;
let currentScore = 0;
let currentBoardMatrix = [];
let firstSelectedTile = null;
let isBoardDealing = false;
let dealFallbackTimerId = null;

//mục đích update: khóa bàn & hẹn giờ kết thúc ván//
let isBoardLocked = false;
let stageEndTimerId = null; 

/* 🟢 UPDATE THÊM 3 BIẾN SỐ: 
 * - Quản lý hẹn giờ 8s (HINTS EFFECTS), 
 * - tọa độ đang gợi ý & chống lặp cặp cũ
 */
let hintTimeoutId = null;
let activeHintCoords = [];
let lastHintPairKey = null;

const soundCorrect = new Audio('./src/sfx/chem_matched.mp3');
const soundWrong = new Audio('./src/sfx/chem_unmatched.mp3');
const soundHint = new Audio('./src/sfx/chem_hints_sound.wav'); // 🟢 UPDATE NEW HINTS SOUND
const soundOpenMap = {
  easy: new Audio('./src/sfx/chem_open_easy_map.wav'),
  medium: new Audio('./src/sfx/chem_open_medium_map.wav'),
  hard: new Audio('./src/sfx/chem_open_hard_map.wav')
};

/* ============================================================================
 * KHỐI 1: BỘ ĐẾM THỜI GIAN THEO GIÂY (80s / 120s / 150s) & DỌN BÀN CHƠI
 * ============================================================================ */
let gameTimerId = null;

export function startGameTimer(durationSeconds, onTimeUpCallback) {
  stopGameTimer();
  const timerBox = document.getElementById('timerBox');
  const timerBoxFill = document.getElementById('timerBoxFill');
  const timerContainer = timerBox?.closest('.box-timer');

  const startTime = performance.now();
  let lastDisplayedSec = durationSeconds;

  const updateText = (sec) => {
    if (timerBox) timerBox.textContent = sec;
    if (timerBoxFill) timerBoxFill.textContent = sec;
  };

  updateText(durationSeconds);
  if (timerContainer) timerContainer.style.setProperty('--timer-pct', '100%');

  const tick = (now) => {
    const elapsedSec = (now - startTime) / 1000;
    const remainingExact = Math.max(0, durationSeconds - elapsedSec);
    const pct = (remainingExact / durationSeconds) * 100;

    if (timerContainer) {
      timerContainer.style.setProperty('--timer-pct', `${pct}%`);
    }

    const displaySec = Math.ceil(remainingExact);
    if (displaySec !== lastDisplayedSec) {
      lastDisplayedSec = displaySec;
      updateText(displaySec);
    }

    if (remainingExact <= 0) {
      gameTimerId = null;
      isBoardLocked = true; // Khóa click ngay lập tức (sẵn sàng cho hiệu ứng xám hóa ô sau này)
      updateText(0);
      if (timerContainer) timerContainer.style.setProperty('--timer-pct', '0%');

      // Chờ trình duyệt vẽ (paint) xong số 0 & thanh cạn 0% rồi mới chạy callback kết thúc
      requestAnimationFrame(() => {
        stageEndTimerId = setTimeout(() => {
          stageEndTimerId = null;
          if (typeof onTimeUpCallback === 'function') {
            onTimeUpCallback();
          }
        }, 60);
      });
      return;
    }

    gameTimerId = requestAnimationFrame(tick);
  };

  gameTimerId = requestAnimationFrame(tick);
}

export function stopGameTimer() {
  if (gameTimerId) {
    cancelAnimationFrame(gameTimerId);
    gameTimerId = null;
  }
}

export function cleanupBoardSession() {
  stopGameTimer();
  clearConnectLine();
  clearHintHighlights();
  firstSelectedTile = null;
  currentBoardMatrix = [];

  const gridElem = document.getElementById('boardGrid');
  if (gridElem) gridElem.innerHTML = '';

  // Reset thanh thời gian về đầy 100% ngay khi kết thúc/thoát ván
  const boxTimer = document.getElementById('boxTimer');
  if (boxTimer) boxTimer.style.setProperty('--timer-pct', '100%');

  isBoardDealing = false;
  if (dealFallbackTimerId) {
    clearTimeout(dealFallbackTimerId);
    dealFallbackTimerId = null;
  }

  isBoardLocked = false;
  if (stageEndTimerId) {
    clearTimeout(stageEndTimerId);
    stageEndTimerId = null;
  }
}

/* ============================================================================
 * KHỐI 2: BỘ CHỌN STOCK PHƯƠNG TRÌNH ĐỘC LẬP (KHÓA CỨNG NHÓM CHẤT TỪ ĐẦU)
 * Hành vi tổng quát:
 * - Bốc đúng `numPairs` cặp phương trình từ REACTION_DATABASE sao cho các cặp
 *   không phản ứng chéo lẫn nhau (Induced Matching trong lý thuyết đồ thị).
 * - Nhờ không có phản ứng chéo, người chơi không bao giờ ăn nhầm cặp làm dư
 *   ra 2 chất lẻ không phản ứng được ở cuối ván.
 * - Với bàn lớn (8x5 = 20 cặp, 10x6 = 30 cặp), các cặp vượt quá số lượng độc
 *   lập tối đa sẽ được nhân bản từ chính nhóm phương trình đã chọn này.
 * Lệnh lạ cần biết:
 * - usedChems.some(x => ...): Hàm duyệt mảng trả về `true` ngay lập tức nếu
 *   có ít nhất 1 phần tử thỏa điều kiện (dừng sớm nên chạy rất nhanh).
 * ============================================================================ */
function selectCleanReactionStock(numPairs) {
  let bestIndependentPairs = [];

  // Thử ngẫu nhiên 60 lần để tìm tập hợp các cặp phương trình độc lập lớn nhất
  for (let attempt = 0; attempt < 60; attempt++) {
    const shuffledDB = [...REACTION_DATABASE];
    for (let i = shuffledDB.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledDB[i], shuffledDB[j]] = [shuffledDB[j], shuffledDB[i]];
    }

    const chosenPairs = [];
    const usedChems = [];

    for (const rx of shuffledDB) {
      // Bỏ qua nếu chất a hoặc chất b đã xuất hiện trong Stock
      if (usedChems.includes(rx.a) || usedChems.includes(rx.b)) continue;

      // Kiểm tra phản ứng chéo: a và b không được phản ứng với bất kỳ chất nào đã chọn
      const hasCrossReaction = usedChems.some(
        existing =>
          checkChemicalReaction(rx.a, existing).valid ||
          checkChemicalReaction(rx.b, existing).valid
      );

      if (!hasCrossReaction) {
        chosenPairs.push(rx);
        usedChems.push(rx.a, rx.b);

        if (chosenPairs.length === numPairs) {
          break;
        }
      }
    }

    if (chosenPairs.length > bestIndependentPairs.length) {
      bestIndependentPairs = chosenPairs;
    }
    if (bestIndependentPairs.length === numPairs) {
      break;
    }
  }

  // Khóa cứng danh sách cặp phương trình của ván này (tuyệt đối không lấy thêm từ ngoài)
  const lockedPairs = [...bestIndependentPairs];
  let repeatIdx = 0;
  while (lockedPairs.length < numPairs) {
    lockedPairs.push(bestIndependentPairs[repeatIdx % bestIndependentPairs.length]);
    repeatIdx++;
  }

  // Trải phẳng danh sách cặp phương trình thành mảng 1 chiều gồm (2 * numPairs) ô chất
  const stockTiles = [];
  for (const rx of lockedPairs) {
    stockTiles.push(rx.a, rx.b);
  }
  return stockTiles;
}

/* ============================================================================
 * KHỐI 3: KHỞI TẠO & SẮP XẾP MA TRẬN BÀN CHƠI GIẢI ĐƯỢC NGAY TỪ ĐẦU
 * Hành vi tổng quát:
 * - Lấy đúng `stockTiles` vừa khóa ở Khối 2, tráo vị trí và đặt lên lưới.
 * - Dùng thuật toán quay lui `canClearEntireBoard` kiểm tra xem cách sắp xếp
 *   này có đường ăn thông suốt từ ô đầu tiên đến khi sạch bàn (0 ô) hay không.
 * Lệnh lạ cần biết:
 * - [arr[i], arr[j]] = [arr[j], arr[i]]: Destructuring Swap, hoán đổi trực tiếp
 *   2 phần tử trong mảng theo thuật toán tráo bài chuẩn Fisher-Yates.
 * ============================================================================ */
export function initBoard(cols = 6, rows = 4, difficulty = 'easy', onTilesDealtCallback = null) {
  firstSelectedTile = null;
  currentScore = 0;
  remainingHints = 5;

  const scoreBox = document.getElementById("scoreBox");
  if (scoreBox) scoreBox.innerText = currentScore;

  // Đồng bộ lại nút Trợ giúp và bong bóng số 5 khi bắt đầu ván mới
  const hintCountElem = document.getElementById('hintCount');
  const hintBtn = document.getElementById('hintBtn');
  const hintWrapper = document.getElementById('hintWrapper');
  if (hintCountElem) {
    hintCountElem.innerText = remainingHints;
    hintCountElem.style.display = 'flex';
  }
  if (hintBtn) {
    hintBtn.disabled = false;
    hintBtn.setAttribute('title', 'Dùng gợi ý');
  }
  if (hintWrapper) {
    hintWrapper.classList.remove('is-out-of-hints');
  }

  clearConnectLine();
  clearHintHighlights();

  const totalTiles = cols * rows;
  const numPairs = totalTiles / 2;

  // Bước 1: Chọn nhóm phương trình cố định (Stock) từ từ điển
  const stockTiles = selectCleanReactionStock(numPairs);

  // Bước 2: Sắp xếp các chất trong Stock lên lưới sao cho giải được ngay từ đầu
  let attempts = 0;
  let solvableLayoutFound = false;

  while (attempts < 40 && !solvableLayoutFound) {
    for (let i = stockTiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [stockTiles[i], stockTiles[j]] = [stockTiles[j], stockTiles[i]];
    }

    currentBoardMatrix = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const rowArray = [];
      for (let c = 0; c < cols; c++) {
        rowArray.push(stockTiles[idx++]);
      }
      currentBoardMatrix.push(rowArray);
    }

    // Kiểm tra ma trận vừa xếp có ăn sạch được tới 0 ô hay không
    const budget = { steps: 0, maxSteps: 1500 };
    if (canClearEntireBoard(currentBoardMatrix, budget)) {
      solvableLayoutFound = true;
    }
    attempts++;
  }

  // Nếu sau 40 lần thử chưa tìm được chuỗi toàn cục trong giới hạn bước,
  // đảm bảo ít nhất phải có nước đi mở đầu hợp lệ
  if (!solvableLayoutFound && findAnyValidMove(currentBoardMatrix) === null) {
    reshuffleRemainingTilesOnly();
    return;
  }

  renderBoardDOM(cols, rows, true, onTilesDealtCallback);
  playBoardOpenIntro(difficulty);
}

function playBoardOpenIntro(difficulty = 'easy') {
  const boardWrapper = document.getElementById('boardWrapper');
  if (boardWrapper) {
    boardWrapper.classList.remove('board-fading-out', 'board-float-center-in');
    void boardWrapper.offsetWidth; // Reflow để kích hoạt lại animation từ 0.85x
    boardWrapper.classList.add('board-float-center-in');
  }

  const sfx = soundOpenMap[difficulty] || soundOpenMap.easy;
  if (sfx) {
    sfx.currentTime = 0;
    sfx.play().catch(() => {});
  }
}

/* ============================================================================
 * KHỐI 4: THUẬT TOÁN QUAY LUI KIỂM TRA LỜI GIẢI TOÀN BÀN (DFS BACKTRACKING)
 * Hành vi tổng quát: Tạo bản sao ma trận ảo, thử nối lần lượt từng cặp hợp lệ
 * cho tới khi số ô còn lại = 0. Nếu bế tắc thì quay lui thử nhánh khác.
 * Lệnh lạ cần biết:
 * - board.map(row => [...row]): Deep Copy mảng 2 chiều để thử nghiệm ăn ô
 *   trên bàn ảo mà không làm biến đổi dữ liệu của bàn chơi thật.
 * ============================================================================ */
function canClearEntireBoard(board, budget) {
  budget.steps++;
  if (budget.steps > budget.maxSteps) return false;

  const rows = board.length;
  const cols = board[0].length;
  let remaining = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (board[r][c] !== null) remaining++;
    }
  }

  if (remaining === 0) return true;

  for (let r1 = 0; r1 < rows; r1++) {
    for (let c1 = 0; c1 < cols; c1++) {
      const val1 = board[r1][c1];
      if (!val1) continue;

      for (let r2 = r1; r2 < rows; r2++) {
        const startC2 = (r2 === r1) ? c1 + 1 : 0;
        for (let c2 = startC2; c2 < cols; c2++) {
          const val2 = board[r2][c2];
          if (!val2) continue;

          if (checkChemicalReaction(val1, val2).valid) {
            if (checkPathPikachu(board, { r: r1, c: c1 }, { r: r2, c: c2 }) !== null) {
              const nextBoard = board.map(row => [...row]);
              nextBoard[r1][c1] = null;
              nextBoard[r2][c2] = null;

              if (canClearEntireBoard(nextBoard, budget)) {
                return true;
              }
            }
          }
        }
      }
    }
  }

  return false;
}

/* ============================================================================
 * KHỐI 5: DỰNG GIAO DIỆN LƯỚI Ô CHẤT LÊN DOM
 * Hành vi tổng quát: Tạo các thẻ <div class="chem-tile"> gắn tọa độ (row, col)
 * và công thức hóa học vào thuộc tính dataset để phục vụ xử lý click & gợi ý.
 * ============================================================================ */
function renderBoardDOM(cols, rows, withDiagonalIntro = false, onTilesDealtCallback = null) {
  const gridElem = document.getElementById("boardGrid");
  if (!gridElem) return;

  if (dealFallbackTimerId) {
    clearTimeout(dealFallbackTimerId);
    dealFallbackTimerId = null;
  }
  isBoardDealing = withDiagonalIntro;

  gridElem.innerHTML = "";
  gridElem.style.gridTemplateColumns = `repeat(${cols}, 120px)`;

  let lastTileElem = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const chemVal = currentBoardMatrix[r][c];

      const tileElem = document.createElement("div");
      tileElem.className = "chem-tile";
      if (chemVal === null) {
        tileElem.classList.add("matched-hidden");
      } else if (withDiagonalIntro) {
        const diagIndex = r + c;
        tileElem.classList.add("tile-diag-intro");
        tileElem.style.setProperty("--diag-delay", `${0.08 + diagIndex * 0.045}s`);
        tileElem.addEventListener("animationend", () => {
          tileElem.classList.remove("tile-diag-intro");
          tileElem.style.removeProperty("--diag-delay");
        }, { once: true });
        lastTileElem = tileElem;
      }

      tileElem.dataset.row = r;
      tileElem.dataset.col = c;
      tileElem.dataset.val = chemVal || "";

      tileElem.innerHTML = `<span class="chem-tile-symbol">${chemVal || ""}</span>`;
      tileElem.onclick = () => handleTileClick(r, c, tileElem);

      gridElem.appendChild(tileElem);
    }
  }

  if (withDiagonalIntro) {
    let finished = false;
    const finishDealing = () => {
      if (finished) return;
      finished = true;
      isBoardDealing = false;
      if (dealFallbackTimerId) {
        clearTimeout(dealFallbackTimerId);
        dealFallbackTimerId = null;
      }
      if (typeof onTilesDealtCallback === "function") {
        onTilesDealtCallback();
      }
    };

    if (lastTileElem) {
      lastTileElem.addEventListener("animationend", finishDealing, { once: true });
      const style = getComputedStyle(lastTileElem);
      const totalMs = (parseFloat(style.animationDuration || "0.8") + parseFloat(style.animationDelay || "0.5")) * 1000 + 80;
      dealFallbackTimerId = setTimeout(finishDealing, totalMs);
    } else {
      finishDealing();
    }
  }
}

/* ============================================================================
 * KHỐI 6: TÌM NƯỚC ĐI HỢP LỆ & TRÁO VỊ TRÍ NỘI BỘ KHI NO MOVES AVAILABLE
 * Hành vi tổng quát:
 * - findAnyValidMove(board): Quét tìm 1 cặp bất kỳ vừa có phản ứng hóa học vừa
 *   có đường đi Pikachu thông suốt.
 * - reshuffleRemainingTilesOnly(): Khi hết nước đi (No moves available), chỉ
 *   hoán đổi vị trí các ô ĐANG CÒN TRÊN BÀN (`activeVals`). Tuyệt đối không bao
 *   giờ thêm hay đổi sang chất khác ngoài Stock đã chọn từ đầu!
 * ============================================================================ */
function findAllValidMoves(board) {
  const rows = board.length;
  const cols = board[0].length;
  const allMoves = [];

  for (let r1 = 0; r1 < rows; r1++) {
    for (let c1 = 0; c1 < cols; c1++) {
      const val1 = board[r1][c1];
      if (!val1) continue;

      for (let r2 = r1; r2 < rows; r2++) {
        const startC2 = (r2 === r1) ? c1 + 1 : 0;
        for (let c2 = startC2; c2 < cols; c2++) {
          const val2 = board[r2][c2];
          if (!val2) continue;

          if (checkChemicalReaction(val1, val2).valid) {
            const path = checkPathPikachu(board, { r: r1, c: c1 }, { r: r2, c: c2 });
            if (path !== null) {
              allMoves.push({ p1: { r: r1, c: c1 }, p2: { r: r2, c: c2 }, path });
            }
          }
        }
      }
    }
  }
  return allMoves;
}

// Giữ lại hàm cũ gọi sang mảng mới để không phải sửa các chỗ kiểm tra bàn chơi
function findAnyValidMove(board) {
  const moves = findAllValidMoves(board);
  return moves.length > 0 ? moves[0] : null;
}

function reshuffleRemainingTilesOnly() {
  const activeCoords = [];
  const activeVals = [];

  for (let r = 0; r < currentBoardMatrix.length; r++) {
    for (let c = 0; c < currentBoardMatrix[0].length; c++) {
      if (currentBoardMatrix[r][c] !== null) {
        activeCoords.push({ r, c });
        activeVals.push(currentBoardMatrix[r][c]);
      }
    }
  }

  // ==========================================================================
  // [TẠM THỜI - TEMPORARILY BEFORE ALTER]
  // Chức năng: Dừng đồng hồ & khóa bàn ngay khi ăn cặp cuối -> Chờ 800ms cho
  // hiệu ứng nổ 8 mảnh (0.75s) rơi xong hẳn rồi mới phát 'chemStageCleared'
  // (sau này sẽ thay bằng bảng Stage Completed & Next Stage).
  // ==========================================================================
  if (activeVals.length === 0) {
    stopGameTimer();
    isBoardLocked = true;

    stageEndTimerId = setTimeout(() => {
      stageEndTimerId = null;
      window.dispatchEvent(new CustomEvent('chemStageCleared', {
        detail: { score: currentScore }
      }));
    }, 800);
    return;
  }

  // Nếu vẫn còn nước đi hợp lệ thì giữ nguyên bàn chơi hiện tại
  if (findAnyValidMove(currentBoardMatrix) !== null) {
    return;
  }

  console.log("No moves available! Đang hoán đổi vị trí các chất hiện có trong Stock...");

  // Chỉ tráo vị trí của đúng mảng `activeVals` hiện có (không đổi chất ngoài Stock)
  let shuffleTries = 0;
  let validFound = false;

  while (shuffleTries < 50 && !validFound) {
    for (let i = activeVals.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [activeVals[i], activeVals[j]] = [activeVals[j], activeVals[i]];
    }

    for (let i = 0; i < activeCoords.length; i++) {
      const { r, c } = activeCoords[i];
      currentBoardMatrix[r][c] = activeVals[i];
    }

    const budget = { steps: 0, maxSteps: 1000 };
    if (canClearEntireBoard(currentBoardMatrix, budget) || findAnyValidMove(currentBoardMatrix) !== null) {
      validFound = true;
    }
    shuffleTries++;
  }

  clearHintHighlights();
  renderBoardDOM(currentBoardMatrix[0].length, currentBoardMatrix.length);
}

/* ============================================================================
 * KHỐI 7: XỬ LÝ TƯƠNG TÁC CLICK CHỌN Ô & CHUỖI HIỆU ỨNG ĐÚNG / SAI
 * Hành vi tổng quát:
 * - Ghép ĐÚNG: Vẽ dây Neon xanh 0.3s + bật sáng viền xanh lá (.matched-success-green)
 *   -> Ẩn 2 ô -> Bắn 8 mảnh vỡ 15x15px -> Cộng 100 điểm -> Kiểm tra nước đi tiếp.
 * - Ghép SAI: Rung giật 2 ô với viền đỏ (.error-buzzing) trong 0.65s rồi tắt.
 * ============================================================================ */
function handleTileClick(r, c, tileElem) {
  /* LÍNH GÁC ĐẦU HÀM (GUARD CLAUSE): Chặn tương tác sớm khi ô chưa sẵn sàng.
   * Thứ tự kiểm tra tối ưu theo cơ chế đoản mạch (Short-circuit ||):
   * 1. isBoardDealing: Đọc biến boolean trong RAM (nhanh nhất) -> Khóa click lúc đang rải ô.
   * 2. "matched-hidden": Chặn click vào ô đã ăn (dù đã ẩn nhưng vẫn chiếm chỗ trong lưới).
   * 3. "error-buzzing": Chặn click đè lên ô đang rung viền đỏ báo sai (0.65s) gây kẹt hiệu ứng. */
  if (isBoardDealing || tileElem.classList.contains("matched-hidden") || tileElem.classList.contains("error-buzzing"))
    return;

  if (tileElem.classList.contains("matched-hidden") || tileElem.classList.contains("error-buzzing"))
    return;

  // 🟢 UPDATE: Nếu đang bật gợi ý mà bấm vào ô KHÔNG thuộc cặp gợi ý -> Tắt viền cam ngay
  if (activeHintCoords.length > 0 && !isTileInActiveHint(r, c)) {
    clearHintHighlights();
  }

  if (!firstSelectedTile) {
    firstSelectedTile = { r, c, elem: tileElem, val: tileElem.dataset.val };
    tileElem.classList.add("selected");
    return;
  }

  if (firstSelectedTile.r === r && firstSelectedTile.c === c) {
    firstSelectedTile.elem.classList.remove("selected");
    firstSelectedTile = null;
    return;
  }

  const secondSelectedTile = { r, c, elem: tileElem, val: tileElem.dataset.val };
  const reactionCheck = checkChemicalReaction(firstSelectedTile.val, secondSelectedTile.val);
  const path = checkPathPikachu(currentBoardMatrix, firstSelectedTile, secondSelectedTile);

  // 🟢 TRƯỜNG HỢP 1: GHÉP ĐÚNG
  if (reactionCheck.valid && path !== null) {
    const tileA = firstSelectedTile;
    const tileB = secondSelectedTile;
    firstSelectedTile = null;

    soundCorrect.currentTime = 0;
    soundCorrect.play();

    clearHintHighlights();
    tileA.elem.classList.remove("selected");
    tileA.elem.classList.add("matched-success-green");
    tileB.elem.classList.add("matched-success-green");
    drawWipeConnectLine(path, "chem-neon-path-green");

    setTimeout(() => {
      currentBoardMatrix[tileA.r][tileA.c] = null;
      currentBoardMatrix[tileB.r][tileB.c] = null;

      tileA.elem.classList.remove("matched-success-green");
      tileA.elem.classList.add("matched-hidden");
      tileB.elem.classList.remove("matched-success-green");
      tileB.elem.classList.add("matched-hidden");
      clearConnectLine();

      spawnShatterParticles15(tileA.elem);
      spawnShatterParticles15(tileB.elem);

      currentScore += 100;
      const scoreBox = document.getElementById("scoreBox");
      if (scoreBox) scoreBox.innerText = currentScore;

      reshuffleRemainingTilesOnly();
    }, 350);

  } else {
    // 🔴 TRƯỜNG HỢP 2: GHÉP SAI
    const tileA = firstSelectedTile;
    const tileB = secondSelectedTile;
    firstSelectedTile = null;

    soundWrong.currentTime = 0;
    soundWrong.play();

    tileA.elem.classList.remove("selected");
    tileA.elem.classList.add("error-buzzing");
    tileB.elem.classList.add("error-buzzing");

    if (path !== null) {
      drawWipeConnectLine(path, "chem-neon-path-red");
    }

    setTimeout(() => {
      tileA.elem.classList.remove("error-buzzing");
      tileB.elem.classList.remove("error-buzzing");
      clearConnectLine();
    }, 650);
  }
}

/* ============================================================================
 * KHỐI 8: VẼ DÂY NỐI SVG TỪ TRUNG ĐIỂM CẠNH Ô & HIỆU ỨNG VỠ 8 MẢNH
 * Hành vi tổng quát: Quy đổi tọa độ ma trận sang tọa độ pixel trên màn hình để
 * vẽ đường gấp khúc SVG chạy hiệu ứng Wipe-in 0.3s.
 * ============================================================================ */
function drawWipeConnectLine(path, colorClass) {
  const svgLayer = document.getElementById("svgConnectLayer");
  const gameSpace = document.getElementById("gameSpace");
  const gridElem = document.getElementById("boardGrid");
  if (!svgLayer || !gameSpace || !gridElem || !path || path.length < 2) return;

  const gameSpaceRect = gameSpace.getBoundingClientRect();
  const gridRect = gridElem.getBoundingClientRect();

  const getCenter = (p) => ({
    x: (gridRect.left - gameSpaceRect.left) + 16 + p.c * (120 + 8) + 60,
    y: (gridRect.top - gameSpaceRect.top) + 16 + p.r * (80 + 8) + 40
  });

  const pointsPixel = [];

  const p1 = path[0];
  const pNext = path[1];
  const center1 = getCenter(p1);

  if (pNext.r < p1.r)       pointsPixel.push(`${center1.x},${center1.y - 40}`);
  else if (pNext.r > p1.r)  pointsPixel.push(`${center1.x},${center1.y + 40}`);
  else if (pNext.c < p1.c)  pointsPixel.push(`${center1.x - 60},${center1.y}`);
  else if (pNext.c > p1.c)  pointsPixel.push(`${center1.x + 60},${center1.y}`);

  for (let i = 1; i < path.length - 1; i++) {
    const c = getCenter(path[i]);
    pointsPixel.push(`${c.x},${c.y}`);
  }

  const p2 = path[path.length - 1];
  const pPrev = path[path.length - 2];
  const center2 = getCenter(p2);

  if (pPrev.r < p2.r)       pointsPixel.push(`${center2.x},${center2.y - 40}`);
  else if (pPrev.r > p2.r)  pointsPixel.push(`${center2.x},${center2.y + 40}`);
  else if (pPrev.c < p2.c)  pointsPixel.push(`${center2.x - 60},${center2.y}`);
  else if (pPrev.c > p2.c)  pointsPixel.push(`${center2.x + 60},${center2.y}`);

  const pointsStr = pointsPixel.join(" ");
  svgLayer.innerHTML = `<polyline points="${pointsStr}" class="${colorClass}" id="activePolyline" />`;

  const polyline = document.getElementById("activePolyline");
  if (polyline) {
    const length = polyline.getTotalLength();
    polyline.style.strokeDasharray = length;
    polyline.style.strokeDashoffset = length;
    polyline.getBoundingClientRect();
    polyline.style.strokeDashoffset = "0";
  }
}

function clearConnectLine() {
  const svgLayer = document.getElementById("svgConnectLayer");
  if (svgLayer) svgLayer.innerHTML = "";
}

function spawnShatterParticles15(tileElem) {
  const gameSpace = document.getElementById("gameSpace");
  if (!gameSpace || !tileElem) return;

  const gameSpaceRect = gameSpace.getBoundingClientRect();
  const tileRect = tileElem.getBoundingClientRect();

  const centerX = (tileRect.left - gameSpaceRect.left) + tileRect.width / 2;
  const centerY = (tileRect.top - gameSpaceRect.top) + tileRect.height / 2;

  for (let i = 0; i < 8; i++) {
    const particle = document.createElement("div");
    particle.className = "chem-shatter-particle-15";
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;

    const dx = (Math.random() - 0.5) * 90;
    const dyUp = -20 - Math.random() * 25;
    const dyFloor = 70 + Math.random() * 80;
    const rotMid = (Math.random() - 0.5) * 180;
    const rotEnd = (Math.random() - 0.5) * 540;

    particle.style.setProperty('--dx', `${dx}px`);
    particle.style.setProperty('--dy-up', `${dyUp}px`);
    particle.style.setProperty('--dy-floor', `${dyFloor}px`);
    particle.style.setProperty('--rot-mid', `${rotMid}deg`);
    particle.style.setProperty('--rot-end', `${rotEnd}deg`);

    gameSpace.appendChild(particle);
    setTimeout(() => particle.remove(), 750);
  }
}

/* ============================================================================
 * KHỐI 9: HỆ THỐNG TRỢ GIÚP (HINTS) — RANDOM KHÔNG LẶP & TỰ TẮT SAU 8 GIÂY
 * Hành vi tổng quát:
 * - Lọc bỏ cặp vừa gợi ý ở lượt trước (lastHintPairKey) để luôn random ra cặp
 *   mới (trừ khi cả bàn chỉ còn duy nhất 1 cặp).
 * - Bật viền cam trong 8s (8000ms), hết 8s tự tắt. Dùng clearTimeout để chống
 *   lỗi bộ đếm cũ đè lên bộ đếm mới khi người chơi bấm Hints liên tiếp.
 * ============================================================================ */
function isTileInActiveHint(r, c) {
  return activeHintCoords.some(coord => coord.r === r && coord.c === c);
}

function clearHintHighlights() {
  if (hintTimeoutId) {
    clearTimeout(hintTimeoutId);
    hintTimeoutId = null;
  }
  activeHintCoords = [];

  const hintedTiles = document.querySelectorAll('.chem-tile.hint-highlight-orange');
  hintedTiles.forEach(tile => tile.classList.remove('hint-highlight-orange'));
}

export function handleHint() {
  if (remainingHints <= 0) return;

  let allMoves = findAllValidMoves(currentBoardMatrix);
  if (allMoves.length === 0) {
    reshuffleRemainingTilesOnly();
    allMoves = findAllValidMoves(currentBoardMatrix);
  }

  if (allMoves.length === 0) return;

  // 1. Lọc bỏ cặp vừa gợi ý lần trước để không bao giờ bị lặp lại
  let candidateMoves = allMoves;
  if (allMoves.length > 1 && lastHintPairKey) {
    candidateMoves = allMoves.filter(
      m => `${m.p1.r},${m.p1.c}|${m.p2.r},${m.p2.c}` !== lastHintPairKey
    );
  }

  // 2. Chọn ngẫu nhiên 1 cặp trong danh sách ứng viên
  const chosenMove = candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
  lastHintPairKey = `${chosenMove.p1.r},${chosenMove.p1.c}|${chosenMove.p2.r},${chosenMove.p2.c}`;

  // Phát âm thanh trợ giúp
  soundHint.currentTime = 0;
  soundHint.play();

  // Xóa viền cam & timer cũ (nếu có), sau đó bật viền cam cho cặp mới
  clearHintHighlights();
  activeHintCoords = [chosenMove.p1, chosenMove.p2];

  const tileElem1 = document.querySelector(
    `.chem-tile[data-row="${chosenMove.p1.r}"][data-col="${chosenMove.p1.c}"]`
  );
  const tileElem2 = document.querySelector(
    `.chem-tile[data-row="${chosenMove.p2.r}"][data-col="${chosenMove.p2.c}"]`
  );

  if (tileElem1) tileElem1.classList.add('hint-highlight-orange');
  if (tileElem2) tileElem2.classList.add('hint-highlight-orange');

  // 3. Hẹn giờ đúng 8 giây (8000ms) tự tắt gợi ý, trả lại vỏ bình thường
  hintTimeoutId = setTimeout(() => {
    clearHintHighlights();
  }, 8000);

  // 4. Trừ lượt & cập nhật bong bóng số (giữ số 0 khi hết lượt)
  remainingHints--;

  const hintCountElem = document.getElementById('hintCount');
  const hintBtn = document.getElementById('hintBtn');
  const hintWrapper = document.getElementById('hintWrapper');

  if (hintCountElem) {
    hintCountElem.innerText = remainingHints;
    hintCountElem.style.display = 'flex';
  }

  if (remainingHints === 0) {
    if (hintBtn) {
      hintBtn.disabled = true;
      hintBtn.removeAttribute('title');
    }
    if (hintWrapper) {
      hintWrapper.classList.add('is-out-of-hints');
    }
  }
}

/* ============================================================================
 * KHỐI 10: BẢNG CHUYỂN VÒNG CHƠI (STAGE INTRO CARD - FLOAT IN CANON)
 * Hành vi tổng quát:
 * - Nhận thông tin mức độ, số vòng hiện tại (mặc định 1) và tổng số vòng (8).
 * - Tự động nhân bản đúng `totalStages` ảnh huy hiệu `chem_win_slotted.png`.
 * - Kích hoạt hiệu ứng Float In tuyến tính từng vật một, giữ bảng cho người
 *   chơi quan sát rồi tự ẩn đi và gọi callback bắt đầu đếm giờ/chơi game.
 * ============================================================================ */
export function showStageIntroCard({
  difficultyLabel = 'DỄ',
  stageNumber = 1,
  totalStages = 8,
  holdDurationMs = 2400, // Tổng thời gian hiện bảng (1.0s chạy hiệu ứng + 1.4s đứng yên cho người chơi đọc)
  onCompleteCallback = null
} = {}) {
  const overlay = document.getElementById('stageIntroOverlay');
  const diffElem = document.getElementById('stageIntroDiff');
  const titleElem = document.getElementById('stageIntroTitle');
  const badgeListElem = document.getElementById('stageBadgeList');

  // Nếu thiếu thẻ HTML thì chạy thẳng vào game để tránh kẹt luồng
  if (!overlay || !diffElem || !titleElem || !badgeListElem) {
    if (typeof onCompleteCallback === 'function') onCompleteCallback();
    return;
  }

  // 1. Đổ nội dung cho Object 1 (Độ khó) và Object 2 (Vòng chơi)
  diffElem.textContent = `ĐỘ KHÓ: ${difficultyLabel}`;
  titleElem.textContent = `VÒNG ${stageNumber}`;

  // 2. Nhân 8 lên cho Object 3 (vòng lặp tạo 8 thẻ <img> chem_win_slotted.png)
  badgeListElem.innerHTML = '';
  for (let i = 0; i < totalStages; i++) {
    const badgeImg = document.createElement('img');
    badgeImg.src = './src/ui_cpnt_buttons/badge_collection/chem_win_slotted.png';
    badgeImg.alt = `Huy hiệu vòng ${i + 1}`;
    badgeImg.className = 'stage-badge-slot';
    badgeListElem.appendChild(badgeImg);
  }

  // 3. Reset lại trạng thái animation để đảm bảo lần mở nào cũng chạy mượt từ đầu
  overlay.classList.remove('stage-hidden', 'is-animating');
  void overlay.offsetWidth; // Ép trình duyệt tính toán lại khung hình (Reflow) trước khi gắn class chạy
  overlay.classList.add('is-animating');

  // 4. Hết thời gian trình diễn -> Ẩn bảng và kích hoạt ván chơi
  setTimeout(() => {
    overlay.classList.add('stage-hidden');
    overlay.classList.remove('is-animating');

    // Chờ đúng 0.45s (450ms) bảng Intro FadeOut xong rồi mới FadeIn bàn game 0.25s
    setTimeout(() => {
      if (typeof onCompleteCallback === 'function') {
        onCompleteCallback();
      }
    }, 450);
  }, holdDurationMs);
}