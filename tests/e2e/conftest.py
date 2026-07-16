"""Pytest fixtures for local Playwright E2E tests."""

from __future__ import annotations

import http.client
import socket
import subprocess
import sys
import time

import pytest

from tests.e2e.helpers import BASE_URL, HOST, PORT, REPO_ROOT

PUBLIC_DIR = REPO_ROOT / "public"


def is_port_in_use(port: int) -> bool:
    """Return true when a TCP port is already bound on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        return sock.connect_ex((HOST, port)) == 0


def wait_for_server(port: int, timeout: float = 10.0) -> bool:
    """Wait until the local app server responds with the app index."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection(HOST, port, timeout=1)
            conn.request("GET", "/")
            response = conn.getresponse()
            body = response.read().decode("utf-8", errors="ignore")
            conn.close()
            if response.status == 200 and "task-form" in body:
                return True
        except (ConnectionRefusedError, OSError):
            pass
        time.sleep(0.3)
    return False


@pytest.fixture(scope="session")
def app_server():
    """Serve this worktree's app for local browser tests."""
    if is_port_in_use(PORT):
        raise RuntimeError(
            f"Port {PORT} is already in use. Choose another port with FORTUDO_E2E_PORT."
        )

    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", HOST],
        cwd=PUBLIC_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        if not wait_for_server(PORT):
            process.kill()
            raise RuntimeError(f"Server failed to start on port {PORT}.")
        yield BASE_URL
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
