# backend/app/services/history_service.py
import sqlite3
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "consultations.db"

class PrescriptionHistoryRepository:
    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        # Enable Write-Ahead Logging (WAL) for concurrent read/write throughput
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._get_connection() as conn:
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
                    full_payload_json TEXT NOT NULL
                );
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_history_created_at 
                ON prescription_history (created_at DESC);
            """)

    def _insert(self, record: Dict[str, Any]) -> int:
        with self._get_connection() as conn:
            cursor = conn.execute("""
                INSERT INTO prescription_history (
                    patient_name, phone_number, diagnosis,
                    medications_count, audio_url, pdf_url, full_payload_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                record["patient_name"],
                record["phone_number"],
                record["diagnosis"],
                record["medications_count"],
                record.get("audio_url"),
                record.get("pdf_url"),
                json.dumps(record["full_payload_json"])
            ))
            return cursor.lastrowid

    def _get_recent(self, limit: int = 10) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT 
                    id, created_at, patient_name, phone_number,
                    diagnosis, medications_count, audio_url, pdf_url
                FROM prescription_history
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def _get_by_id(self, history_id: int) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.execute("""
                SELECT id, created_at, full_payload_json 
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