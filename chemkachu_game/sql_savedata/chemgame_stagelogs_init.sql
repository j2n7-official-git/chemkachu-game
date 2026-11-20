USE chemkachu_db;

CREATE TABLE IF NOT EXISTS stage_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  stage_number TINYINT UNSIGNED NOT NULL,
  base_score INT NOT NULL DEFAULT 0,
  time_left SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  bonus_rate SMALLINT UNSIGNED NOT NULL DEFAULT 50,
  time_bonus INT NOT NULL DEFAULT 0,
  stage_total INT NOT NULL DEFAULT 0,
  cleared_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_session_stage (session_id, stage_number),
  CONSTRAINT fk_stage_logs_session
    FOREIGN KEY (session_id) REFERENCES game_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;