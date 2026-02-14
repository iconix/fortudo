"""Runner: starts a local server, executes all test suites, then stops the server.

If a server is already running on the target port (e.g., started by CI via
scripts/e2e_server.py), the existing server is reused and left running.
"""
import subprocess, sys, os, socket, time, http.client

PORT = 9847
PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")

scripts = [
    "test_visual_inspection.py",
    "test_functional.py",
    "test_ui_interaction.py",
    "test_gap_indicators.py",
]


def is_port_in_use(port):
    """Check if a TCP port is already bound."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_for_server(port, timeout=10):
    """Wait until the server responds on the given port."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=1)
            conn.request("GET", "/")
            resp = conn.getresponse()
            conn.close()
            if resp.status == 200:
                return True
        except (ConnectionRefusedError, OSError):
            pass
        time.sleep(0.3)
    return False


# --- Server setup ---
server_proc = None

if is_port_in_use(PORT):
    print(f"Server already running on port {PORT}, reusing it.\n", flush=True)
else:
    print(f"Starting server on http://127.0.0.1:{PORT} (serving {PUBLIC_DIR})", flush=True)
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=PUBLIC_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    if not wait_for_server(PORT):
        print(f"ERROR: Server failed to start on port {PORT}.", flush=True)
        server_proc.kill()
        sys.exit(1)

    print(f"Server running (PID {server_proc.pid}).\n", flush=True)

# --- Run test suites ---
exit_code = 0
try:
    for script in scripts:
        print(f"\n{'='*70}", flush=True)
        print(f"  RUNNING: {script}", flush=True)
        print(f"{'='*70}\n", flush=True)
        result = subprocess.run(
            [sys.executable, script],
            cwd=os.path.dirname(os.path.abspath(__file__)),
        )
        if result.returncode != 0:
            exit_code = 1
            print(
                f"\n  *** {script} exited with code {result.returncode} ***\n",
                flush=True,
            )
finally:
    # --- Stop server (only if we started it) ---
    if server_proc:
        print(f"\nStopping server (PID {server_proc.pid})...", flush=True)
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()
            server_proc.wait()
        print("Server stopped.", flush=True)

sys.exit(exit_code)
