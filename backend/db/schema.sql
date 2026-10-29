-- Verde schema, reconstructed from the Lambda queries (the original DDL was lost with the old account).
-- Statements are split on ";" + newline by scripts/init_db.py, so keep ";" out of string literals.
--
-- Column types are chosen for what the RDS Data API returns, because the handlers read cells by type:
--   DECIMAL -> stringValue (users.baseline_*, daily_logs.*_kg, emission_factors.value, mapping_table.value)
--   INT     -> longValue   (carbon_point, points, challenge_points, challenge_progress, reading_time_minutes)
--   DATE    -> stringValue (published_date)
-- Do not change DECIMAL columns to DOUBLE: UserProfile.py/tracking.py would raise KeyError on 'stringValue'.

CREATE TABLE IF NOT EXISTS users (
  id                          VARCHAR(36)   NOT NULL,
  baseline_daily              DECIMAL(12,3) NOT NULL DEFAULT 0,
  baseline_monthly_energy     DECIMAL(12,3) NOT NULL DEFAULT 0,
  baseline_monthly_transport  DECIMAL(12,3) NOT NULL DEFAULT 0,
  baseline_monthly_diet       DECIMAL(12,3) NOT NULL DEFAULT 0,
  baseline_yearly             DECIMAL(12,3) NOT NULL DEFAULT 0,
  carbon_point                INT           NOT NULL DEFAULT 0,
  created_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS daily_logs (
  user_id       VARCHAR(36)   NOT NULL,
  log_date      DATE          NOT NULL,
  energy_kg     DECIMAL(12,3) NOT NULL DEFAULT 0,
  transport_kg  DECIMAL(12,3) NOT NULL DEFAULT 0,
  diet_kg       DECIMAL(12,3) NOT NULL DEFAULT 0,
  shopping_kg   DECIMAL(12,3) NOT NULL DEFAULT 0,
  total_kg      DECIMAL(13,3) GENERATED ALWAYS AS (energy_kg + transport_kg + diet_kg + shopping_kg) STORED,
  PRIMARY KEY (user_id, log_date)
);

CREATE TABLE IF NOT EXISTS challenges (
  challenge_id          VARCHAR(36)  NOT NULL,
  category              VARCHAR(50)  NOT NULL,
  challenge             VARCHAR(255) NOT NULL,
  challenge_difficulty  VARCHAR(20)  NOT NULL,
  challenge_points      INT          NOT NULL,
  challenge_frequency   VARCHAR(20)  NOT NULL,
  challenge_progress    INT          NOT NULL,
  challenge_description TEXT         NOT NULL,
  challenge_benefit     VARCHAR(255) NULL,
  PRIMARY KEY (challenge_id)
);

CREATE TABLE IF NOT EXISTS user_challenges (
  id               INT          NOT NULL AUTO_INCREMENT,
  user_id          VARCHAR(36)  NOT NULL,
  challenge_id     VARCHAR(36)  NOT NULL,
  frequency        VARCHAR(20)  NULL,
  period_start     DATE         NULL,
  target_count     INT          NOT NULL DEFAULT 1,
  progress_count   INT          NOT NULL DEFAULT 0,
  status           VARCHAR(20)  NOT NULL DEFAULT 'In Progress',
  started_at       DATETIME     NULL,
  last_progress_at DATETIME     NULL,
  completed_at     DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_user_challenge (user_id, challenge_id)
);

CREATE TABLE IF NOT EXISTS articles (
  article_id           VARCHAR(36)  NOT NULL,
  title                VARCHAR(255) NOT NULL,
  author               VARCHAR(120) NOT NULL,
  source_url           VARCHAR(500) NOT NULL,
  summary              TEXT         NOT NULL,
  reading_time_minutes INT          NOT NULL,
  published_date       DATE         NOT NULL,
  is_featured          BOOLEAN      NOT NULL DEFAULT FALSE,
  image_url            VARCHAR(500) NULL,
  PRIMARY KEY (article_id)
);

CREATE TABLE IF NOT EXISTS tips (
  id   INT  NOT NULL AUTO_INCREMENT,
  body TEXT NOT NULL,
  PRIMARY KEY (id)
);

-- Onboarding questionnaire. options is a JSON array of strings for enum questions.
CREATE TABLE IF NOT EXISTS questions (
  id             INT          NOT NULL,
  question_code  VARCHAR(30)  NOT NULL,
  text_en        VARCHAR(255) NOT NULL,
  hint           VARCHAR(500) NULL,
  category       VARCHAR(30)  NOT NULL,
  input_type     VARCHAR(20)  NOT NULL,
  options        JSON         NULL,
  default_option VARCHAR(60)  NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id)
);

-- Quiz ids are VARCHAR on purpose: LearningHub.py orders them with CAST(id AS UNSIGNED).
CREATE TABLE IF NOT EXISTS quiz_topic (
  id          VARCHAR(16)  NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS quiz_question (
  id         VARCHAR(16)  NOT NULL,
  topic_id   VARCHAR(16)  NOT NULL,
  bank_batch INT          NOT NULL DEFAULT 1,
  seq_order  INT          NOT NULL,
  stem_text  VARCHAR(500) NOT NULL,
  status     VARCHAR(20)  NOT NULL DEFAULT 'published',
  PRIMARY KEY (id),
  KEY idx_topic (topic_id)
);

CREATE TABLE IF NOT EXISTS quiz_option (
  id          VARCHAR(16)  NOT NULL,
  question_id VARCHAR(16)  NOT NULL,
  option_text VARCHAR(500) NOT NULL,
  is_correct  TINYINT      NOT NULL DEFAULT 0,
  explanation VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_question (question_id)
);

-- Constants for the baseline and energy calculations (PRICE_KWH before EF_GRID, PRICE_MJ before EF_GAS:
-- tracking.py relies on row order).
CREATE TABLE IF NOT EXISTS emission_factors (
  id         INT           NOT NULL AUTO_INCREMENT,
  metric_key VARCHAR(40)   NOT NULL,
  value      DECIMAL(14,4) NOT NULL,
  unit       VARCHAR(40)   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_metric (metric_key)
);

CREATE TABLE IF NOT EXISTS mapping_table (
  id     INT           NOT NULL AUTO_INCREMENT,
  domain VARCHAR(40)   NOT NULL,
  code   VARCHAR(40)   NOT NULL,
  label  VARCHAR(80)   NOT NULL,
  value  DECIMAL(14,4) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_domain_code (domain, code)
);

CREATE TABLE IF NOT EXISTS points_policy (
  id       INT         NOT NULL AUTO_INCREMENT,
  category VARCHAR(30) NOT NULL,
  action   VARCHAR(30) NOT NULL,
  points   INT         NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_category (category)
);
