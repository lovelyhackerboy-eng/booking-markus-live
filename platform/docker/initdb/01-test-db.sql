-- Second database for the test suite (reset on every run).
CREATE DATABASE IF NOT EXISTS markus_v2_test;
GRANT ALL PRIVILEGES ON markus_v2_test.* TO 'markus'@'%';
