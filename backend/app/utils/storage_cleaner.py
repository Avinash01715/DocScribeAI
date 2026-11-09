# backend/app/utils/storage_cleaner.py
import os
import time
import logging
import asyncio
from pathlib import Path
from typing import Tuple, List

# Initialize module logger
logger = logging.getLogger("dhanvantari.storage_cleaner")

# Utility class to manage storage retention via TTL pruning and LRU quota enforcement
class StorageCleaner:
    # Initialize directory target, TTL threshold, and maximum byte capacity
    def __init__(
        self,
        directory: Path,
        max_age_hours: int,
        max_size_mb: int,
        target_reclaim_ratio: float = 0.80
    ):
        self.directory = Path(directory)
        self.max_age_seconds = max_age_hours * 3600
        self.max_size_bytes = max_size_mb * 1024 * 1024
        self.target_size_bytes = int(self.max_size_bytes * target_reclaim_ratio)
        self.directory.mkdir(parents=True, exist_ok=True)

    # Scan directory entries efficiently without loading file payloads
    def _get_directory_entries(self) -> List[os.DirEntry]:
        """Scan directory entries efficiently without loading entire file payloads."""
        try:
            with os.scandir(self.directory) as it:
                return [entry for entry in it if entry.is_file(follow_symlinks=False)]
        except OSError as e:
            logger.error(f"Failed to scan directory {self.directory}: {e}")
            return []

    # Purge files exceeding the maximum time-to-live threshold
    def _purge_expired_files(self, entries: List[os.DirEntry], now: float) -> Tuple[List[os.DirEntry], int, int]:
        """Pass 1: Purge files exceeding the absolute TTL window."""
        remaining_entries = []
        deleted_count = 0
        reclaimed_bytes = 0

        for entry in entries:
            try:
                stat = entry.stat()
                file_age = now - stat.st_mtime
                if file_age > self.max_age_seconds:
                    os.unlink(entry.path)
                    deleted_count += 1
                    reclaimed_bytes += stat.st_size
                else:
                    remaining_entries.append(entry)
            except FileNotFoundError:
                # Handle concurrently deleted files gracefully
                continue
            except OSError as e:
                logger.warning(f"Error unlinking TTL-expired file {entry.path}: {e}")

        return remaining_entries, deleted_count, reclaimed_bytes

    # Evict oldest files according to LRU policy when directory size exceeds limit
    def _enforce_quota_lru(self, entries: List[os.DirEntry]) -> Tuple[int, int]:
        """Pass 2: Least Recently Modified (LRU) pruning if directory exceeds max cap."""
        current_total_size = sum(entry.stat().st_size for entry in entries if entry.is_file())
        if current_total_size <= self.max_size_bytes:
            return 0, 0

        # Sort remaining files by st_mtime ascending (oldest first)
        sorted_entries = sorted(entries, key=lambda e: e.stat().st_mtime)
        deleted_count = 0
        reclaimed_bytes = 0

        for entry in sorted_entries:
            if current_total_size <= self.target_size_bytes:
                break
            try:
                size = entry.stat().st_size
                os.unlink(entry.path)
                current_total_size -= size
                reclaimed_bytes += size
                deleted_count += 1
            except FileNotFoundError:
                continue
            except OSError as e:
                logger.warning(f"Error unlinking LRU-evicted file {entry.path}: {e}")

        return deleted_count, reclaimed_bytes

    # Run complete cleanup cycle: TTL pruning followed by quota pruning
    def run_cleanup_cycle(self) -> dict:
        """Executes a single maintenance cycle synchronously."""
        now = time.time()
        entries = self._get_directory_entries()

        # Step 1: TTL Prune
        remaining_entries, ttl_deleted, ttl_reclaimed = self._purge_expired_files(entries, now)

        # Step 2: Quota Prune
        lru_deleted, lru_reclaimed = self._enforce_quota_lru(remaining_entries)

        total_deleted = ttl_deleted + lru_deleted
        total_reclaimed_mb = (ttl_reclaimed + lru_reclaimed) / (1024 * 1024)

        if total_deleted > 0:
            logger.info(
                f"[{self.directory.name}] Cleaned {total_deleted} files "
                f"({ttl_deleted} TTL, {lru_deleted} LRU). Reclaimed: {total_reclaimed_mb:.2f} MB."
            )

        return {
            "directory": str(self.directory),
            "files_removed": total_deleted,
            "reclaimed_mb": total_reclaimed_mb
        }

# Background worker running periodic cleanup cycles
async def storage_retention_daemon(
    cleaners: List[StorageCleaner],
    interval_seconds: int
):
    """Asynchronous background worker designed for FastAPI lifespan management."""
    logger.info("Storage retention daemon initialized.")
    while True:
        try:
            for cleaner in cleaners:
                # Offload blocking filesystem I/O to a worker thread to keep the event loop responsive
                await asyncio.to_thread(cleaner.run_cleanup_cycle)
            await asyncio.sleep(interval_seconds)
        except asyncio.CancelledError:
            logger.info("Storage retention daemon received cancellation signal. Terminating cleanly.")
            break
        except Exception as ex:
            logger.error(f"Unexpected error in storage retention daemon: {ex}", exc_info=True)
            await asyncio.sleep(interval_seconds)
