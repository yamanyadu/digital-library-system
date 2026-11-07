CREATE DATABASE IF NOT EXISTS digilibrary CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE digilibrary;

-- ---------- Members ----------
CREATE TABLE IF NOT EXISTS users (
  user_id        INT AUTO_INCREMENT PRIMARY KEY,
  member_code    VARCHAR(30)  NOT NULL UNIQUE,          -- e.g. STU-2026-00012 (unique ID printed on library card)
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  role           ENUM('admin','librarian','staff','faculty','student') NOT NULL,
  phone          VARCHAR(20),
  address        VARCHAR(300) NOT NULL,
  department     VARCHAR(100),
  course         VARCHAR(100),                           -- students
  year_of_study  TINYINT UNSIGNED,                       -- students
  enrollment_no  VARCHAR(40) UNIQUE,                     -- students
  employee_id    VARCHAR(40) UNIQUE,                     -- faculty, staff, librarian
  designation    VARCHAR(100),                           -- faculty, staff
  status         ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_name (name)
) ENGINE=InnoDB;

-- One-time codes issued by admin for privileged registrations
CREATE TABLE IF NOT EXISTS registration_codes (
  code_id     INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(30) NOT NULL UNIQUE,
  role        ENUM('admin','librarian','staff') NOT NULL,
  created_by  INT NOT NULL,
  used_by     INT NULL,
  used_at     TIMESTAMP NULL,
  expires_at  DATETIME NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(user_id),
  FOREIGN KEY (used_by)    REFERENCES users(user_id)
) ENGINE=InnoDB;

-- Borrowing rules per member role
CREATE TABLE IF NOT EXISTS loan_policies (
  role           ENUM('admin','librarian','staff','faculty','student') PRIMARY KEY,
  max_books      TINYINT UNSIGNED NOT NULL,
  loan_days      SMALLINT UNSIGNED NOT NULL,
  fine_per_day   DECIMAL(6,2) NOT NULL,
  max_renewals   TINYINT UNSIGNED NOT NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO loan_policies (role, max_books, loan_days, fine_per_day, max_renewals) VALUES
  ('student',   3, 14, 2.00, 1),
  ('faculty',  10, 30, 1.00, 2),
  ('staff',     5, 21, 2.00, 1),
  ('librarian', 5, 21, 0.00, 1),
  ('admin',     5, 21, 0.00, 1);

-- ---------- Catalogue ----------
CREATE TABLE IF NOT EXISTS subjects (
  subject_id INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS books (
  book_id          INT AUTO_INCREMENT PRIMARY KEY,
  title            VARCHAR(250) NOT NULL,
  author           VARCHAR(200) NOT NULL,
  isbn             VARCHAR(20) UNIQUE,
  publisher        VARCHAR(150),
  publication_year SMALLINT UNSIGNED,
  edition          VARCHAR(50),
  language         VARCHAR(40) NOT NULL DEFAULT 'English',
  description      TEXT,
  call_number      VARCHAR(50),                          -- classification no. (Dewey etc.)
  shelf_location   VARCHAR(60),
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FULLTEXT KEY ft_books (title, author, description),
  INDEX idx_books_title (title)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS book_subjects (
  book_id    INT NOT NULL,
  subject_id INT NOT NULL,
  PRIMARY KEY (book_id, subject_id),
  FOREIGN KEY (book_id)    REFERENCES books(book_id)       ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Each physical copy has its own serial (accession) number
CREATE TABLE IF NOT EXISTS book_copies (
  copy_id   INT AUTO_INCREMENT PRIMARY KEY,
  book_id   INT NOT NULL,
  serial_no VARCHAR(30) NOT NULL UNIQUE,                 -- e.g. BK00012-003
  status    ENUM('available','issued','damaged','lost') NOT NULL DEFAULT 'available',
  added_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE CASCADE,
  INDEX idx_copies_book_status (book_id, status)
) ENGINE=InnoDB;

-- ---------- Circulation ----------
CREATE TABLE IF NOT EXISTS issues (
  issue_id      INT AUTO_INCREMENT PRIMARY KEY,
  copy_id       INT NOT NULL,
  user_id       INT NOT NULL,
  issued_by     INT NOT NULL,
  issue_date    DATE NOT NULL,
  due_date      DATE NOT NULL,
  return_date   DATE NULL,
  received_by   INT NULL,
  renew_count   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  fine_amount   DECIMAL(8,2) NOT NULL DEFAULT 0,         -- fixed at return time
  fine_paid     TINYINT(1) NOT NULL DEFAULT 0,
  fine_paid_at  TIMESTAMP NULL,
  notes         VARCHAR(255),
  FOREIGN KEY (copy_id)     REFERENCES book_copies(copy_id),
  FOREIGN KEY (user_id)     REFERENCES users(user_id),
  FOREIGN KEY (issued_by)   REFERENCES users(user_id),
  FOREIGN KEY (received_by) REFERENCES users(user_id),
  INDEX idx_issues_user (user_id, return_date),
  INDEX idx_issues_due (return_date, due_date)
) ENGINE=InnoDB;
