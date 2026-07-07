"""Sanity check that the session app-server fixture serves the app."""

from __future__ import annotations

import http.client

from tests.e2e.helpers import HOST, PORT


def test_app_server_serves_index():
    conn = http.client.HTTPConnection(HOST, PORT, timeout=5)
    conn.request("GET", "/")
    response = conn.getresponse()
    body = response.read().decode("utf-8", errors="ignore")
    conn.close()

    assert response.status == 200
    assert "task-form" in body
