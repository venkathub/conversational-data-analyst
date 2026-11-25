-- Banking sample schema. All dates are ISO 'YYYY-MM-DD' text so strftime() works.

CREATE TABLE branches (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  city       TEXT NOT NULL,
  region     TEXT NOT NULL CHECK (region IN ('North', 'South', 'East', 'West')),
  opened_on  TEXT NOT NULL
);

CREATE TABLE customers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  segment    TEXT NOT NULL CHECK (segment IN ('Retail', 'SME', 'Corporate')),
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  joined_on  TEXT NOT NULL
);

CREATE TABLE onboarding_applications (
  id            INTEGER PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  branch_id     INTEGER NOT NULL REFERENCES branches(id),
  segment       TEXT NOT NULL CHECK (segment IN ('Retail', 'SME', 'Corporate')),
  status        TEXT NOT NULL CHECK (status IN ('Approved', 'Rejected', 'Pending')),
  submitted_at  TEXT NOT NULL,
  decided_at    TEXT,
  CHECK ((status = 'Pending' AND decided_at IS NULL)
      OR (status <> 'Pending' AND decided_at IS NOT NULL AND decided_at >= submitted_at))
);

CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  branch_id    INTEGER NOT NULL REFERENCES branches(id),
  amount       REAL NOT NULL CHECK (amount > 0),
  type         TEXT NOT NULL CHECK (type IN ('Credit', 'Debit')),
  channel      TEXT NOT NULL CHECK (channel IN ('Branch', 'Online', 'Mobile')),
  txn_date     TEXT NOT NULL
);

CREATE INDEX idx_customers_branch      ON customers(branch_id);
CREATE INDEX idx_apps_customer         ON onboarding_applications(customer_id);
CREATE INDEX idx_apps_branch           ON onboarding_applications(branch_id);
CREATE INDEX idx_apps_submitted        ON onboarding_applications(submitted_at);
CREATE INDEX idx_txn_customer          ON transactions(customer_id);
CREATE INDEX idx_txn_branch            ON transactions(branch_id);
CREATE INDEX idx_txn_date              ON transactions(txn_date);
