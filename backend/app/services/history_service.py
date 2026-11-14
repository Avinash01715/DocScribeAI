# backend/app/services/history_service.py
import sqlite3
import json
import time
import logging
import asyncio
from contextlib import contextmanager
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger("docscribe.history")

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "consultations.db"


class PrescriptionHistoryRepository:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    @contextmanager
    def _connection(self):
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        # Configure busy timeout before WAL mode pragma for concurrent safety
        conn.execute("PRAGMA busy_timeout=10000;")
        # Enable Write-Ahead Logging (WAL) for concurrent read/write throughput
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def _init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connection() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS prescription_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    patient_name TEXT NOT NULL,
                    phone_number TEXT NOT NULL,
                    diagnosis TEXT,
                    medications_count INTEGER DEFAULT 0,
                    audio_url TEXT,
                    pdf_url TEXT,
                    language TEXT DEFAULT 'hi',
                    full_payload_json TEXT NOT NULL
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_created_at 
                ON prescription_history (created_at DESC);
            """)
        self._migrate_schema()

    def _migrate_schema(self) -> None:
        """
        Idempotent, non-destructive schema migration for adding `language` column.
        Inspects live metadata via PRAGMA table_info and handles transient locks defensively.
        """
        max_attempts = 3
        for attempt in range(1, max_attempts + 1):
            try:
                with self._connection() as conn:
                    columns_info = conn.execute(
                        "PRAGMA table_info(prescription_history);"
                    ).fetchall()
                    existing_columns = {row["name"] for row in columns_info}

                    if "language" in existing_columns:
                        logger.info(
                            "Column 'language' already present in prescription_history table. Skipping migration."
                        )
                        return

                    conn.execute(
                        "ALTER TABLE prescription_history ADD COLUMN language TEXT DEFAULT 'hi';"
                    )
                    conn.commit()
                    logger.info(
                        "Non-destructive migration succeeded: added 'language' column (DEFAULT 'hi') to prescription_history."
                    )
                    return

            except sqlite3.OperationalError as exc:
                if "locked" in str(exc).lower() and attempt < max_attempts:
                    logger.warning(
                        f"Transient SQLite lock during schema migration (attempt {attempt}/{max_attempts}): {exc}"
                    )
                    time.sleep(0.2 * attempt)
                    continue
                logger.error(
                    f"SQLite OperationalError during schema migration (non-fatal): {exc}",
                    exc_info=True
                )
                return
            except Exception as exc:
                logger.error(
                    f"Unexpected error during schema migration (non-fatal): {exc}",
                    exc_info=True
                )
                return

    def _insert(self, record: Dict[str, Any]) -> int:
        raw_lang = record.get("language")
        language = str(raw_lang).strip() if raw_lang and str(raw_lang).strip() else "hi"

        with self._connection() as conn:
            cursor = conn.execute("""
                INSERT INTO prescription_history (
                    patient_name, phone_number, diagnosis,
                    medications_count, audio_url, pdf_url, language, full_payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record["patient_name"],
                record["phone_number"],
                record["diagnosis"],
                record["medications_count"],
                record.get("audio_url"),
                record.get("pdf_url"),
                language,
                json.dumps(record["full_payload_json"])
            ))
            return cursor.lastrowid

    def _get_recent(self, limit: int = 10) -> List[Dict[str, Any]]:
        with self._connection() as conn:
            cursor = conn.execute("""
                SELECT 
                    id, created_at, patient_name, phone_number,
                    diagnosis, medications_count, audio_url, pdf_url,
                    COALESCE(language, 'hi') AS language
                FROM prescription_history
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def _get_by_id(self, history_id: int) -> Optional[Dict[str, Any]]:
        with self._connection() as conn:
            cursor = conn.execute("""
                SELECT id, created_at, COALESCE(language, 'hi') AS language, full_payload_json 
                FROM prescription_history 
                WHERE id = ?
            """, (history_id,))
            row = cursor.fetchone()
            if not row:
                return None
            data = dict(row)
            data["prescription_data"] = json.loads(data.pop("full_payload_json"))
            return data

    # Async thread-isolated wrappers
    async def save_record(self, record: Dict[str, Any]) -> int:
        return await asyncio.to_thread(self._insert, record)

    async def get_recent_records(self, limit: int = 10) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(self._get_recent, limit)

    async def get_record_by_id(self, history_id: int) -> Optional[Dict[str, Any]]:
        return await asyncio.to_thread(self._get_by_id, history_id)

history_repo = PrescriptionHistoryRepository()
