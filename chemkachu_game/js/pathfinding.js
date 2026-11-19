/* ============================================================
 * FILENAME: src/js/pathfinding.js
 * MODULE: Pikachu Pathfinding Algorithm (Onet Engine)
 * ============================================================ */

/**
 * Kiểm tra đường nối hợp lệ giữa ô A và ô B
 * @param {Array<Array<string>>} board - Ma trận bàn chơi
 * @param {object} p1 - {r, c} Tọa độ ô 1
 * @param {object} p2 - {r, c} Tọa độ ô 2
 * @returns {Array<object>|null} Mảng các điểm nối hoặc null nếu không thể nối
 */

export function checkPathPikachu(board, p1, p2) {
  if (p1.r === p2.r && p1.c === p2.c) return null;

  /** UPDATE về check đường đi:
   * Lõi cơ sở (Hàm checkLineX và checkLineY): 
   * Hai hàm này làm nhiệm vụ bắn một tia laser từ điểm A đến điểm B trên cùng một hàng hoặc cột. Vòng lặp for chạy ở giữa 2 điểm này; nếu đụng bất kỳ ô nào có giá trị (không trống), nó trả về false.
   * Cái hay ở đây: Nếu 2 ô nằm sát nhau (ví dụ cột 1 và cột 2), vòng lặp từ min + 1 đến max - 1 sẽ không chạy dù chỉ 1 vòng, và nghiễm nhiên nó trả về true một cách cực kỳ tối ưu và chính xác.
   * Cấp độ 1 - Chữ L (1 khúc gấp): Thuật toán tìm một tọa độ "góc vuông" là giao điểm của 2 ô. Ví dụ ô A và ô B. Điểm giao sẽ là (A.row, B.col) hoặc (B.row, A.col). Nó chỉ cần kiểm tra xem điểm giao đó có trống không, 
   * và 2 đường nối từ A tới điểm giao, B tới điểm giao có thông suốt không.
   * Cấp độ 2 - Chữ U / Z (2 khúc gấp): Đây là phần tốn kém tài nguyên nhất nhưng em đã làm rất tốt khi giới hạn vòng lặp từ -1 đến biên tối đa. Thuật toán sẽ quét một đường thẳng song song tưởng tượng (ví dụ quét trục c từ trái sang phải, bao gồm cả cột -1 nằm ngoài map). 
   * Nó sẽ bắn 3 tia laser để kiểm tra:Tia từ ô A ra điểm trạm 1 (p1 -> T1).Tia từ ô B ra điểm trạm 2 (p2 -> T2).Tia nối trạm 1 và trạm 2 (T1 -> T2).
   * Nếu cả 3 tia này đều thông suốt, ta có một đường chữ U hoặc chữ Z hợp lệ. 
   * Hàm isCellEmpty của em tự động coi tọa độ < 0 hoặc lớn hơn map là "trống", giúp đường nối U đi bọc ra ngoài mép biên (như hình em chụp) hoạt động cực kỳ mượt mà.   
   * */
  // 🟢 1. ĐƯỜNG ĐI THẲNG (0 khúc gấp): Nối thẳng linh hoạt dù sát nhau hay cách xa
  if (p1.r === p2.r && checkLineX(board, p1.r, p1.c, p2.c)) {
    return [p1, p2];
  }
  if (p1.c === p2.c && checkLineY(board, p1.c, p1.r, p2.r)) {
    return [p1, p2];
  }

  // 2. ĐƯỜNG GẤP KHÚC L-SHAPE (1 khúc gấp)
  if (isCellEmpty(board, p1.r, p2.c) && checkLineX(board, p1.r, p1.c, p2.c) && checkLineY(board, p2.c, p1.r, p2.r)) {
    return [p1, { r: p1.r, c: p2.c }, p2];
  }
  if (isCellEmpty(board, p2.r, p1.c) && checkLineY(board, p1.c, p1.r, p2.r) && checkLineX(board, p2.r, p1.c, p2.c)) {
    return [p1, { r: p2.r, c: p1.c }, p2];
  }

  // 3. ĐƯỜNG GẤP KHÚC U-SHAPE & Z-SHAPE (2 khúc gấp - Quét đường vòng biên ngoài)
  const rows = board.length;
  const cols = board[0].length;

  // Quét tia ngang từ c = -1 đến c = cols (Đi vòng mép Trái / Phải)
  for (let c = -1; c <= cols; c++) {
    if (c === p1.c) continue;
    if (checkLineX(board, p1.r, p1.c, c) && (isCellEmpty(board, p1.r, c) || c === p1.c)) {
      if (checkLineY(board, c, p1.r, p2.r) && checkLineX(board, p2.r, c, p2.c)) {
        if (isCellEmpty(board, p2.r, c) || c === p2.c) {
          return [p1, { r: p1.r, c: c }, { r: p2.r, c: c }, p2];
        }
      }
    }
  }

  // Quét tia dọc từ r = -1 đến r = rows (Đi vòng mép Trên / Dưới)
  for (let r = -1; r <= rows; r++) {
    if (r === p1.r) continue;
    if (checkLineY(board, p1.c, p1.r, r) && (isCellEmpty(board, r, p1.c) || r === p1.r)) {
      if (checkLineX(board, r, p1.c, p2.c) && checkLineY(board, p2.c, r, p2.r)) {
        if (isCellEmpty(board, r, p2.c) || r === p2.r) {
          return [p1, { r: r, c: p1.c }, { r: r, c: p2.c }, p2];
        }
      }
    }
  }

  return null;
}

function isCellEmpty(board, r, c) {
  if (r < 0 || r >= board.length || c < 0 || c >= board[0].length) return true; // Ngoài viền tính là trống
  return board[r][c] === null || board[r][c] === "";
}

function checkLineX(board, row, c1, c2) {
  const min = Math.min(c1, c2);
  const max = Math.max(c1, c2);
  for (let c = min + 1; c < max; c++) {
    if (!isCellEmpty(board, row, c)) return false;
  }
  return true;
}

function checkLineY(board, col, r1, r2) {
  const min = Math.min(r1, r2);
  const max = Math.max(r1, r2);
  for (let r = min + 1; r < max; r++) {
    if (!isCellEmpty(board, r, col)) return false;
  }
  return true;
}