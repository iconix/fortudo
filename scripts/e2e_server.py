#!/usr/bin/env python3
"""
Start one or more servers, wait for them to be ready, run a command, then clean up.

Usage:
    # Single server
    python scripts/with_server.py --server "npm run dev" --port 5173 -- python automation.py
    python scripts/with_server.py --server "npm start" --port 3000 -- python test.py

    # Multiple servers
    python scripts/with_server.py \
      --server "cd backend && python server.py" --port 3000 \
      --server "cd frontend && npm run dev" --port 5173 \
      -- python test.py
"""

import subprocess
import socket
import time
import sys
import argparse
import urllib.request
import urllib.error


def is_server_ready(port, timeout=30):
    """Wait for server to be ready by verifying it responds to HTTP requests.

    A raw TCP socket check is insufficient: the OS binds the port during server
    init, before the server enters its accept loop. An HTTP-level check confirms
    the server is actually handling requests. Falls back to TCP for non-HTTP
    servers after the HTTP check has been attempted.
    """
    start_time = time.time()
    tcp_succeeded = False
    while time.time() - start_time < timeout:
        # Try an HTTP request first (confirms the server is fully ready)
        try:
            resp = urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=2)
            resp.read()
            return True
        except urllib.error.HTTPError:
            # Server responded with 4xx/5xx - it IS handling requests
            return True
        except (urllib.error.URLError, ConnectionError, OSError, socket.error):
            pass

        # If HTTP fails, check TCP so we know the port is at least bound
        if not tcp_succeeded:
            try:
                with socket.create_connection(('127.0.0.1', port), timeout=1):
                    tcp_succeeded = True
            except (socket.error, ConnectionRefusedError):
                pass

        time.sleep(0.5)

    # If HTTP never worked but TCP did, the server may be non-HTTP - accept it
    return tcp_succeeded


def _terminate_process(process):
    """Terminate a server process, handling Windows shell=True properly.

    On Windows, shell=True means Popen spawns cmd.exe, and terminate() only
    kills cmd.exe -- not the child server process. This leaves orphaned servers
    holding the port. Use taskkill /F /T to kill the entire process tree.
    """
    if sys.platform == 'win32':
        try:
            subprocess.run(
                ['taskkill', '/F', '/T', '/PID', str(process.pid)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except Exception:
            process.kill()
    else:
        try:
            process.terminate()
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main():
    parser = argparse.ArgumentParser(description='Run command with one or more servers')
    parser.add_argument('--server', action='append', dest='servers', required=True, help='Server command (can be repeated)')
    parser.add_argument('--port', action='append', dest='ports', type=int, required=True, help='Port for each server (must match --server count)')
    parser.add_argument('--timeout', type=int, default=30, help='Timeout in seconds per server (default: 30)')
    parser.add_argument('command', nargs=argparse.REMAINDER, help='Command to run after server(s) ready')

    args = parser.parse_args()

    # Remove the '--' separator if present
    if args.command and args.command[0] == '--':
        args.command = args.command[1:]

    if not args.command:
        print("Error: No command specified to run")
        sys.exit(1)

    # Parse server configurations
    if len(args.servers) != len(args.ports):
        print("Error: Number of --server and --port arguments must match")
        sys.exit(1)

    servers = []
    for cmd, port in zip(args.servers, args.ports):
        servers.append({'cmd': cmd, 'port': port})

    server_processes = []

    try:
        # Start all servers
        for i, server in enumerate(servers):
            print(f"Starting server {i+1}/{len(servers)}: {server['cmd']}")

            # Use shell=True to support commands with cd and &&
            # Use DEVNULL instead of PIPE to prevent server processes from
            # blocking when their stdout/stderr pipe buffers fill up.
            process = subprocess.Popen(
                server['cmd'],
                shell=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            server_processes.append(process)

            # Wait for this server to be ready
            print(f"Waiting for server on port {server['port']}...")
            if not is_server_ready(server['port'], timeout=args.timeout):
                raise RuntimeError(f"Server failed to start on port {server['port']} within {args.timeout}s")

            print(f"Server ready on port {server['port']}")

        print(f"\nAll {len(servers)} server(s) ready")

        # Run the command
        print(f"Running: {' '.join(args.command)}\n")
        result = subprocess.run(args.command)
        sys.exit(result.returncode)

    finally:
        # Clean up all servers
        print(f"\nStopping {len(server_processes)} server(s)...")
        for i, process in enumerate(server_processes):
            _terminate_process(process)
            print(f"Server {i+1} stopped")
        print("All servers stopped")


if __name__ == '__main__':
    main()
