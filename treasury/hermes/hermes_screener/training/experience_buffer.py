"""
Experience Buffer
=================
SQLite ring buffer that persists all pipeline experiences.

Schema: experiences table
  id              INTEGER PRIMARY KEY AUTOINCREMENT
  episode_id      TEXT
  stage           TEXT
  token_address   TEXT
  chain           TEXT
  symbol          TEXT
  state           TEXT  (JSON)
  action          TEXT  (JSON)
  reward          REAL  (NULL until outcome propagated)
  reward_components TEXT (JSON)
  timestamp       REAL
  source_script   TEXT
  used_in_train   INTEGER DEFAULT 0
  quality_flag    INTEGER DEFAULT 1  -- 0=filtered out, 1=ok, 2=high quality

Indexes:
  episode_id, stage, timestamp, used_in_train, reward (not null)

Max capacity: configurable, default 500k rows. Oldest rows pruned.
"""

import json
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from .experience_collector import Experience

DEFAULT_DB_PATH = Path.home() / ".hermes" / "data" / "training" / "experiences.db"
DEFAULT_MAX_ROWS = 500_000


class ExperienceBuffer:

    def __init__(
        self,
        db_path: Path = DEFAULT_DB_PATH,
        max_rows: int = DEFAULT_MAX_ROWS,
    ):
        self.db_path = Path(db_path)
        self.max_rows = max_rows
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self.db_path), timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS experiences (
                    id                INTEGER PRIMARY KEY AUTOINCREMENT,
                    episode_id        TEXT    NOT NULL,
                    stage             TEXT    NOT NULL,
                    token_address     TEXT    NOT NULL DEFAULT '',
                    chain             TEXT    NOT NULL DEFAULT '',
                    symbol            TEXT    NOT NULL DEFAULT '',
                    state             TEXT    NOT NULL DEFAULT '{}',
                    action            TEXT    NOT NULL DEFAULT '{}',
                    reward            REAL,
                    reward_components TEXT    NOT NULL DEFAULT '{}',
                    timestamp         REAL    NOT NULL,
                    source_script     TEXT    NOT NULL DEFAULT '',
                    used_in_train     INTEGER NOT NULL DEFAULT 0,
                    quality_flag      INTEGER NOT NULL DEFAULT 1
                );

                CREATE INDEX IF NOT EXISTS idx_episode
                    ON experiences (episode_id);
                CREATE INDEX IF NOT EXISTS idx_stage
                    ON experiences (stage);
                CREATE INDEX IF NOT EXISTS idx_ts
                    ON experiences (timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_train
                    ON experiences (used_in_train, reward);

                CREATE TABLE IF NOT EXISTS training_runs (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    started_at      REAL,
                    finished_at     REAL,
                    examples_used   INTEGER,
                    base_model      TEXT,
                    adapter_path    TEXT,
                    train_loss      REAL,
                    eval_loss       REAL,
                    notes           TEXT
                );

                CREATE TABLE IF NOT EXISTS reward_backfill_log (
                    episode_id      TEXT PRIMARY KEY,
                    reward          REAL,
                    backfilled_at   REAL,
                    rows_updated    INTEGER
                );
            """)

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    def push(self, exp: Experience):
        d = exp.to_dict()
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO experiences
                  (episode_id, stage, token_address, chain, symbol,
                   state, action, reward, reward_components,
                   timestamp, source_script)
                VALUES
                  (:episode_id, :stage, :token_address, :chain, :symbol,
                   :state, :action, :reward, :reward_components,
                   :timestamp, :source_script)
            """,
                d,
            )
        self._maybe_prune()

    def backfill_reward(
        self,
        episode_id: str,
        reward: float,
        reward_components: dict,
    ):
        """Propagate outcome reward to all earlier stages in the same episode."""
        rc_json = json.dumps(reward_components)
        with self._conn() as conn:
            cur = conn.execute(
                """
                UPDATE experiences
                   SET reward            = ?,
                       reward_components = ?
                 WHERE episode_id = ?
                   AND reward IS NULL
            """,
                (reward, rc_json, episode_id),
            )
            rows = cur.rowcount
            conn.execute(
                """
                INSERT OR REPLACE INTO reward_backfill_log
                  (episode_id, reward, backfilled_at, rows_updated)
                VALUES (?, ?, ?, ?)
            """,
                (episode_id, reward, time.time(), rows),
            )

    def mark_trained(self, ids: list[int]):
        if not ids:
            return
        placeholders = ",".join("?" * len(ids))
        with self._conn() as conn:
            conn.execute(
                f"UPDATE experiences SET used_in_train=1 WHERE id IN ({placeholders})",
                ids,
            )

    def log_training_run(
        self,
        examples_used: int,
        base_model: str,
        adapter_path: str,
        train_loss: float,
        eval_loss: float,
        started_at: float,
        notes: str = "",
    ):
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO training_runs
                  (started_at, finished_at, examples_used, base_model,
                   adapter_path, train_loss, eval_loss, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (
                    started_at,
                    time.time(),
                    examples_used,
                    base_model,
                    adapter_path,
                    train_loss,
                    eval_loss,
                    notes,
                ),
            )

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------
    def fetch_trainable(
        self,
        min_reward: float | None = None,
        limit: int = 10_000,
        only_with_reward: bool = True,
        exclude_trained: bool = True,
        stages: list[str] | None = None,
    ) -> list[Experience]:
        """Fetch experiences eligible for a training run."""
        clauses = ["quality_flag = 1"]
        params: list = []

        if only_with_reward:
            clauses.append("reward IS NOT NULL")
        if exclude_trained:
            clauses.append("used_in_train = 0")
        if min_reward is not None:
            clauses.append("reward >= ?")
            params.append(min_reward)
        if stages:
            ph = ",".join("?" * len(stages))
            clauses.append(f"stage IN ({ph})")
            params.extend(stages)

        where = " AND ".join(clauses)
        query = f"""
            SELECT * FROM experiences
             WHERE {where}
             ORDER BY timestamp DESC
             LIMIT ?
        """
        params.append(limit)
        with self._conn() as conn:
            rows = conn.execute(query, params).fetchall()
        return [Experience.from_dict(dict(r)) for r in rows]

    def fetch_episode(self, episode_id: str) -> list[Experience]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM experiences WHERE episode_id=? ORDER BY timestamp",
                (episode_id,),
            ).fetchall()
        return [Experience.from_dict(dict(r)) for r in rows]

    def stats(self) -> dict:
        with self._conn() as conn:
            total = conn.execute("SELECT COUNT(*) FROM experiences").fetchone()[0]
            with_rew = conn.execute("SELECT COUNT(*) FROM experiences WHERE reward IS NOT NULL").fetchone()[0]
            trained = conn.execute("SELECT COUNT(*) FROM experiences WHERE used_in_train=1").fetchone()[0]
            runs = conn.execute("SELECT COUNT(*) FROM training_runs").fetchone()[0]
            by_stage = dict(conn.execute("SELECT stage, COUNT(*) FROM experiences GROUP BY stage").fetchall())
        return {
            "total": total,
            "with_reward": with_rew,
            "trained": trained,
            "training_runs": runs,
            "by_stage": by_stage,
        }

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------
    def _maybe_prune(self):
        with self._conn() as conn:
            count = conn.execute("SELECT COUNT(*) FROM experiences").fetchone()[0]
            if count > self.max_rows:
                # Delete oldest untrained rows to stay under cap
                excess = count - self.max_rows
                conn.execute(
                    """
                    DELETE FROM experiences WHERE id IN (
                        SELECT id FROM experiences
                         WHERE used_in_train = 0
                         ORDER BY timestamp ASC
                         LIMIT ?
                    )
                """,
                    (excess,),
                )

    def vacuum(self):
        with self._conn() as conn:
            conn.execute("VACUUM")
