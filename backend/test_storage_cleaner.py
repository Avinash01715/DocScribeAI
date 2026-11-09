# backend/test_storage_cleaner.py
import os
import time
import asyncio
from pathlib import Path
import pytest

from app.main import StorageRetentionManager, storage_retention_daemon


# Test fixture creating an isolated sandbox directory for storage tests
@pytest.fixture
def test_storage_dir(tmp_path: Path) -> Path:
    """Provides an isolated sandbox directory for storage retention validation."""
    sandbox = tmp_path / "sandbox_cache"
    sandbox.mkdir(parents=True, exist_ok=True)
    return sandbox


# Test Scenario 1: Verify files exceeding TTL are purged while active files remain
def test_ttl_expiration_purges_only_stale_files(test_storage_dir: Path):
    """
    Validates that files older than max_age_hours are unlinked,
    while unexpired files remain intact on disk.
    """
    manager = StorageRetentionManager(
        directory=test_storage_dir,
        max_age_hours=24,       # 24-hour retention policy
        max_size_mb=100,        # High ceiling so quota pass does not trigger
        target_ratio=0.80
    )

    now = time.time()

    # 1. Active file (created 2 hours ago - well within 24h window)
    active_file = test_storage_dir / "rx_active.mp3"
    active_file.write_bytes(b"ACTIVE_AUDIO_PAYLOAD")
    os.utime(active_file, (now - 7200, now - 7200))

    # 2. Expired file (backdated to 26 hours ago - exceeds 24h TTL)
    expired_file = test_storage_dir / "rx_expired.mp3"
    expired_file.write_bytes(b"EXPIRED_AUDIO_PAYLOAD")
    os.utime(expired_file, (now - 93600, now - 93600))

    # 3. Trigger synchronous sweep
    manager.sweep()

    # Assertions
    assert not expired_file.exists(), "Stale file exceeding TTL was not purged by the engine."
    assert active_file.exists(), "Active file within valid TTL window was mistakenly deleted."


# Test Scenario 2: Verify oldest files are evicted first when directory size exceeds limit
def test_lru_quota_evicts_oldest_files_first(test_storage_dir: Path):
    """
    Validates that when cumulative directory size exceeds max_size_mb,
    the oldest modified files are sequentially purged until reaching the target ratio.
    """
    # Configure a 1.0 MB quota with target threshold at 80% (0.8 MB)
    manager = StorageRetentionManager(
        directory=test_storage_dir,
        max_age_hours=1000,     # Suppress TTL pass to isolate LRU behavior
        max_size_mb=1,          # 1 MB threshold = 1,048,576 bytes
        target_ratio=0.80       # Target size = 838,860 bytes
    )

    now = time.time()
    payload_400kb = b"X" * (400 * 1024)  # 400 KB payload

    # Create 3 files sequentially totaling 1.2 MB (> 1.0 MB ceiling)
    file_oldest = test_storage_dir / "file_oldest.pdf"
    file_oldest.write_bytes(payload_400kb)
    os.utime(file_oldest, (now - 300, now - 300))

    file_middle = test_storage_dir / "file_middle.pdf"
    file_middle.write_bytes(payload_400kb)
    os.utime(file_middle, (now - 200, now - 200))

    file_newest = test_storage_dir / "file_newest.pdf"
    file_newest.write_bytes(payload_400kb)
    os.utime(file_newest, (now - 100, now - 100))

    # Trigger synchronous sweep
    manager.sweep()

    # Total remaining size calculation
    remaining_files = [f for f in test_storage_dir.iterdir() if f.is_file()]
    remaining_size = sum(f.stat().st_size for f in remaining_files)

    # Assertions
    assert not file_oldest.exists(), "The oldest file was not evicted first during quota recovery."
    assert file_newest.exists(), "The most recent file was prematurely pruned."
    assert remaining_size <= manager.target_size_bytes, (
        f"Directory size ({remaining_size} bytes) was not reduced below the target ratio "
        f"({manager.target_size_bytes} bytes)."
    )


# Test Scenario 3: Verify asynchronous background daemon executes sweeps and terminates cleanly
@pytest.mark.asyncio
async def test_storage_daemon_runs_and_cancels_cleanly(test_storage_dir: Path):
    """
    Validates that the asynchronous daemon schedules tasks in worker threads
    and cleanly terminates upon receiving asyncio.CancelledError.
    """
    manager = StorageRetentionManager(
        directory=test_storage_dir,
        max_age_hours=1,
        max_size_mb=10,
        target_ratio=0.80
    )

    now = time.time()
    stale_file = test_storage_dir / "daemon_test_expired.mp3"
    stale_file.write_bytes(b"STALE_DAEMON_PAYLOAD")
    os.utime(stale_file, (now - 7200, now - 7200))

    # 1. Spawn the daemon in a background task
    daemon_task = asyncio.create_task(
        storage_retention_daemon([manager], interval_sec=1)
    )

    # 2. Allow worker thread to execute one sweep
    await asyncio.sleep(0.3)

    # Assert that background thread purged the stale file
    assert not stale_file.exists(), "Daemon worker thread failed to execute the scheduled sweep."

    # 3. Signal clean cancellation on application teardown
    daemon_task.cancel()

    # Ensure task exits cleanly without unhandled cancellation errors
    try:
        await daemon_task
    except asyncio.CancelledError:
        pass

    assert daemon_task.done(), "Storage retention background task failed to finalize upon cancellation."
