"""Runner: executes all three test suites sequentially."""
import subprocess, sys, os

scripts = [
    "test_visual_inspection.py",
    "test_functional.py",
    "test_ui_interaction.py",
    "test_gap_indicators.py",
    "test_overlap_warnings.py",
]

exit_code = 0
for script in scripts:
    print(f"\n{'='*70}", flush=True)
    print(f"  RUNNING: {script}", flush=True)
    print(f"{'='*70}\n", flush=True)
    result = subprocess.run([sys.executable, script], cwd=os.path.dirname(os.path.abspath(__file__)))
    if result.returncode != 0:
        exit_code = 1
        print(f"\n  *** {script} exited with code {result.returncode} ***\n", flush=True)

sys.exit(exit_code)
