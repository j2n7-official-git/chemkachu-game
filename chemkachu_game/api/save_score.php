<?php
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
    exit;
}

$data       = json_decode(file_get_contents('php://input'), true) ?? [];
$action     = $data['action'] ?? 'start';
$playerName = trim($data['player_name'] ?? '');
$difficulty = in_array($data['difficulty'] ?? '', ['easy', 'medium', 'hard'], true)
              ? $data['difficulty'] : 'easy';

try {
    $pdo = new PDO(
        'mysql:host=127.0.0.1;dbname=chemkachu_db;charset=utf8mb4',
        'root',
        '',
        [
            PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false // Tắt giả lập prepare để chống SQL Injection ở tầng driver
        ]
    );
    $pdo->exec("SET time_zone = '+07:00'");

    if ($action === 'start') {
        if ($playerName === '') {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Thiếu tên người chơi']);
            exit;
        }

        $stmt = $pdo->prepare(
            'INSERT INTO game_sessions (player_name, difficulty, score, current_stage, total_stages, play_status)
             VALUES (:name, :diff, 0, 1, :total, "playing")'
        );
        $stmt->execute([
            ':name'  => $playerName,
            ':diff'  => $difficulty,
            ':total' => (int)($data['total_stages'] ?? 8)
        ]);

        echo json_encode(['status' => 'ok', 'session_id' => (int)$pdo->lastInsertId()]);
        exit;
    }

    if ($action === 'save_stage') {
        $sessionId   = (int)($data['session_id'] ?? 0);
        $stageNumber = (int)($data['stage_number'] ?? 1);
        $baseScore   = (int)($data['base_score'] ?? 0);
        $timeLeft    = (int)($data['time_left'] ?? 0);
        $bonusRate   = (int)($data['bonus_rate'] ?? 50);
        $timeBonus   = (int)($data['time_bonus'] ?? 0);
        $stageTotal  = (int)($data['stage_total'] ?? 0);

        if ($sessionId <= 0 || $stageNumber <= 0) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Thiếu session_id hoặc stage_number']);
            exit;
        }

        // Giao dịch nguyên tử: Ghi log vòng + cập nhật điểm tổng phải cùng thành công
        $pdo->beginTransaction();

        $stmtLog = $pdo->prepare(
            'INSERT INTO stage_logs (session_id, stage_number, base_score, time_left, bonus_rate, time_bonus, stage_total)
             VALUES (:sid, :stage, :base, :tleft, :rate, :bonus, :total)
             ON DUPLICATE KEY UPDATE
               base_score  = VALUES(base_score),
               time_left   = VALUES(time_left),
               bonus_rate  = VALUES(bonus_rate),
               time_bonus  = VALUES(time_bonus),
               stage_total = VALUES(stage_total)'
        );
        $stmtLog->execute([
            ':sid'   => $sessionId,
            ':stage' => $stageNumber,
            ':base'  => $baseScore,
            ':tleft' => $timeLeft,
            ':rate'  => $bonusRate,
            ':bonus' => $timeBonus,
            ':total' => $stageTotal
        ]);

        $stmtSession = $pdo->prepare(
            'UPDATE game_sessions
             SET score = :total, current_stage = :stage
             WHERE id = :sid'
        );
        $stmtSession->execute([
            ':total' => $stageTotal,
            ':stage' => $stageNumber,
            ':sid'   => $sessionId
        ]);

        $pdo->commit();

        echo json_encode([
            'status'      => 'ok',
            'saved_stage' => $stageNumber,
            'stage_total' => $stageTotal
        ]);
        exit;
    }

    if ($action === 'finish') {
        $sessionId  = (int)($data['session_id'] ?? 0);
        $playStatus = in_array($data['play_status'] ?? '', ['completed', 'abandoned', 'timeout'], true)
                      ? $data['play_status'] : 'abandoned';

        if ($sessionId <= 0) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'Thiếu session_id']);
            exit;
        }

        $stmt = $pdo->prepare(
            'UPDATE game_sessions
             SET score = :score, current_stage = :cur, total_stages = :tot, play_status = :st
             WHERE id = :id'
        );

        // Bỏ cuộc (abandoned) -> ép score = NULL chuẩn SQL để không làm lệch thống kê điểm
        if ($playStatus === 'abandoned') {
            $stmt->bindValue(':score', null, PDO::PARAM_NULL);
        } else {
            $stmt->bindValue(':score', (int)($data['score'] ?? 0), PDO::PARAM_INT);
        }

        $stmt->bindValue(':cur', (int)($data['current_stage'] ?? 1), PDO::PARAM_INT);
        $stmt->bindValue(':tot', (int)($data['total_stages'] ?? 8), PDO::PARAM_INT);
        $stmt->bindValue(':st', $playStatus, PDO::PARAM_STR);
        $stmt->bindValue(':id', $sessionId, PDO::PARAM_INT);
        $stmt->execute();

        echo json_encode(['status' => 'ok', 'updated_id' => $sessionId]);
    }
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) { $pdo->rollBack(); }
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}