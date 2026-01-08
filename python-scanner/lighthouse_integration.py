"""
Lighthouse Integration with Camoufox
This module allows running Lighthouse audits using Node.js subprocess.
Lighthouse will use its own Chrome instance with anti-detection flags similar to Camoufox.
"""

import asyncio
import json
import subprocess
import tempfile
import os
from typing import Dict, Any, Optional
from pathlib import Path


async def run_lighthouse_audit(
    url: str,
    device: str = "desktop",
    is_lite: bool = False,
    output_dir: str = "/tmp"
) -> Dict[str, Any]:
    """
    Run Lighthouse audit using Node.js subprocess.
    
    Args:
        url: URL to audit
        device: Device type ('desktop', 'mobile', 'tablet')
        is_lite: Whether to use lite config
        output_dir: Directory to save the report
    
    Returns:
        Lighthouse report as dictionary
    """
    # Create temp file for report
    report_file = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False, dir=output_dir)
    report_path = report_file.name
    report_file.close()
    
    try:
        # Get path to lighthouse_runner.js
        script_dir = Path(__file__).parent
        runner_script = script_dir / "lighthouse_runner.js"
        
        if not runner_script.exists():
            raise FileNotFoundError(f"Lighthouse runner script not found: {runner_script}")
        
        # Run Lighthouse via Node.js subprocess
        cmd = [
            "node",
            str(runner_script),
            url,
            report_path,
            device,
            str(is_lite).lower(),
            ""  # No CDP URL (Lighthouse will launch its own Chrome)
        ]
        
        print(f"🔍 Running Lighthouse audit: {' '.join(cmd)}")
        
        # Run subprocess with timeout
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=300  # 5 minutes timeout
        )
        
        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"Lighthouse failed with code {process.returncode}: {error_msg}")
        
        # Read and parse report
        if not os.path.exists(report_path):
            raise FileNotFoundError(f"Lighthouse report not created: {report_path}")
        
        with open(report_path, 'r', encoding='utf-8') as f:
            report = json.load(f)
        
        print(f"✅ Lighthouse audit completed successfully")
        return report
        
    except asyncio.TimeoutError:
        raise RuntimeError("Lighthouse audit timed out after 5 minutes")
    except Exception as e:
        raise RuntimeError(f"Lighthouse audit failed: {str(e)}")
    finally:
        # Cleanup temp file
        try:
            if os.path.exists(report_path):
                os.unlink(report_path)
        except Exception:
            pass



