export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'initial-ledger',
    sql: `
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        currency TEXT NOT NULL CHECK (currency = 'CNY'),
        timezone TEXT NOT NULL CHECK (timezone = 'Asia/Shanghai'),
        calculation_policy TEXT NOT NULL CHECK (calculation_policy = 'start_of_day_net_v1')
      ) STRICT;
      INSERT INTO app_settings VALUES (1, 'CNY', 'Asia/Shanghai', 'start_of_day_net_v1');

      CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 64),
        name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 40 AND name = trim(name)),
        color TEXT NOT NULL CHECK (length(color) = 7 AND substr(color, 1, 1) = '#' AND substr(color, 2) NOT GLOB '*[^0-9a-fA-F]*'),
        opening_date TEXT NOT NULL CHECK (length(opening_date) = 10 AND date(opening_date) IS NOT NULL AND date(opening_date) = opening_date),
        opening_balance_minor INTEGER NOT NULL CHECK (opening_balance_minor BETWEEN 0 AND 99999999999999),
        historical_pnl_minor INTEGER NOT NULL CHECK (historical_pnl_minor BETWEEN -99999999999999 AND 99999999999999),
        note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
        sort_order INTEGER NOT NULL DEFAULT 0,
        archived_on TEXT CHECK (archived_on IS NULL OR (length(archived_on) = 10 AND date(archived_on) IS NOT NULL AND date(archived_on) = archived_on AND archived_on >= opening_date)),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483647),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE TABLE daily_entries (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 64),
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        date TEXT NOT NULL CHECK (length(date) = 10 AND date(date) IS NOT NULL AND date(date) = date),
        closing_balance_minor INTEGER NOT NULL CHECK (closing_balance_minor BETWEEN 0 AND 99999999999999),
        buy_minor INTEGER NOT NULL CHECK (buy_minor BETWEEN 0 AND 99999999999999),
        sell_minor INTEGER NOT NULL CHECK (sell_minor BETWEEN 0 AND 99999999999999),
        note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483647),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (category_id, date)
      ) STRICT;
      CREATE INDEX daily_entries_date ON daily_entries(date);

      CREATE TRIGGER entry_lifetime_insert BEFORE INSERT ON daily_entries
      WHEN NEW.date < (SELECT opening_date FROM categories WHERE id = NEW.category_id)
        OR NEW.date > (SELECT archived_on FROM categories WHERE id = NEW.category_id)
      BEGIN SELECT RAISE(ABORT, 'Entry outside category lifetime'); END;

      CREATE TRIGGER entry_lifetime_update BEFORE UPDATE OF date, category_id ON daily_entries
      WHEN NEW.date < (SELECT opening_date FROM categories WHERE id = NEW.category_id)
        OR NEW.date > (SELECT archived_on FROM categories WHERE id = NEW.category_id)
      BEGIN SELECT RAISE(ABORT, 'Entry outside category lifetime'); END;
    `,
  },
];
