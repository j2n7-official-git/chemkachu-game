CREATE DATABASE IF NOT EXISTS chemkachu_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE chemkachu_db;

CREATE TABLE IF NOT EXISTS game_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  player_name VARCHAR(60) NOT NULL,
  difficulty ENUM('easy', 'medium', 'hard') NOT NULL DEFAULT 'easy',
  score INT NULL DEFAULT 0,
  current_stage TINYINT UNSIGNED NOT NULL DEFAULT 1,
  total_stages TINYINT UNSIGNED NOT NULL DEFAULT 8,
  play_status ENUM('playing', 'completed', 'abandoned', 'timeout') NOT NULL DEFAULT 'playing',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_leaderboard (difficulty, play_status, score DESC)
) ENGINE=InnoDB;