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
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}