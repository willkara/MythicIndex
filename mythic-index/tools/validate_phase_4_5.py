#!/usr/bin/env python3
"""
Phase 4.5 Final Validation Script

This script performs a comprehensive validation of all Phase 4.5 components
to ensure complete readiness for Phase 5 development.
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple, Any


class Phase45Validator:
    def __init__(self, workspace_root: str):
        self.workspace_root = Path(workspace_root)
        self.frontend_path = self.workspace_root / "frontend"
        self.backend_path = self.workspace_root / "backend"
        self.results: Dict[str, Any] = {}

    def log(self, message: str, level: str = "INFO"):
        """Log a message with timestamp"""
        import datetime

        timestamp = datetime.datetime.now().strftime("%H:%M:%S")
        prefix = "✅" if level == "SUCCESS" else "❌" if level == "ERROR" else "ℹ️"
        print(f"[{timestamp}] {prefix} {message}")

    def run_command(
        self, command: List[str], cwd: Path = None
    ) -> Tuple[bool, str, str]:
        """Run a command and return success status, stdout, stderr"""
        try:
            result = subprocess.run(
                command,
                cwd=cwd or self.workspace_root,
                capture_output=True,
                text=True,
                timeout=60,
            )
            return result.returncode == 0, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return False, "", "Command timed out"
        except Exception as e:
            return False, "", str(e)

    def validate_frontend_structure(self) -> bool:
        """Validate frontend file structure and key components"""
        self.log("Validating frontend structure...")

        required_files = [
            "src/app/app.config.ts",
            "src/app/store/app.state.ts",
            "src/app/store/content/content.actions.ts",
            "src/app/store/content/content.reducer.ts",
            "src/app/store/content/content.selectors.ts",
            "src/app/store/writer/writer.actions.ts",
            "src/app/store/writer/writer.reducer.ts",
            "src/app/store/writer/writer.selectors.ts",
            "src/app/core/components/tiptap-editor/tiptap-editor.component.ts",
            "package.json",
        ]

        missing_files = []
        for file_path in required_files:
            full_path = self.frontend_path / file_path
            if not full_path.exists():
                missing_files.append(file_path)

        if missing_files:
            self.log(f"Missing frontend files: {missing_files}", "ERROR")
            return False

        self.log("Frontend structure validation passed", "SUCCESS")
        return True

    def validate_backend_structure(self) -> bool:
        """Validate backend file structure and key components"""
        self.log("Validating backend structure...")

        required_files = [
            "app/main.py",
            "app/api/v1/writer.py",
            "app/websockets/writer_ws.py",
            "app/services/writer_analysis.py",
            "app/services/unified_content_service.py",
            "app/api/v1/consistency.py",
            "requirements.txt",
        ]

        missing_files = []
        for file_path in required_files:
            full_path = self.backend_path / file_path
            if not full_path.exists():
                missing_files.append(file_path)

        if missing_files:
            self.log(f"Missing backend files: {missing_files}", "ERROR")
            return False

        self.log("Backend structure validation passed", "SUCCESS")
        return True

    def test_frontend_build(self) -> bool:
        """Test that frontend builds successfully"""
        self.log("Testing frontend build...")

        if not (self.frontend_path / "package.json").exists():
            self.log("No package.json found in frontend", "ERROR")
            return False

        # Test npm build
        success, stdout, stderr = self.run_command(
            ["npm", "run", "build"], cwd=self.frontend_path
        )

        if not success:
            self.log(f"Frontend build failed: {stderr}", "ERROR")
            return False

        # Check for dist folder
        dist_path = self.frontend_path / "dist"
        if not dist_path.exists():
            self.log("Build succeeded but no dist folder created", "ERROR")
            return False

        self.log("Frontend build test passed", "SUCCESS")
        return True

    def test_backend_imports(self) -> bool:
        """Test that backend imports work correctly"""
        self.log("Testing backend imports...")

        # Test main app import
        test_script = """
import sys
sys.path.append("app")

try:
    from app.main import app
    from app.services.writer_analysis import WriterAnalysisService
    from app.services.unified_content_service import UnifiedContentService
    from app.websockets.writer_ws import router as ws_router
    from app.api.v1.writer import router as writer_router
    from app.api.v1.consistency import router as consistency_router
    print("SUCCESS: All imports successful")
except Exception as e:
    print(f"ERROR: Import failed: {e}")
    sys.exit(1)
"""

        # Write test script
        test_file = self.backend_path / "test_imports.py"
        test_file.write_text(test_script)

        try:
            success, stdout, stderr = self.run_command(
                ["python", "test_imports.py"], cwd=self.backend_path
            )

            if not success or "ERROR" in stdout:
                self.log(f"Backend import test failed: {stderr or stdout}", "ERROR")
                return False

            self.log("Backend import test passed", "SUCCESS")
            return True

        finally:
            # Clean up test file
            if test_file.exists():
                test_file.unlink()

    def validate_package_dependencies(self) -> bool:
        """Validate that all required dependencies are properly installed"""
        self.log("Validating package dependencies...")

        # Check frontend dependencies
        frontend_package = self.frontend_path / "package.json"
        if frontend_package.exists():
            with open(frontend_package, "r") as f:
                package_data = json.load(f)

            required_deps = [
                "@ngrx/store",
                "@ngrx/entity",
                "@tiptap/core",
                "@tiptap/starter-kit",
            ]
            dependencies = {
                **package_data.get("dependencies", {}),
                **package_data.get("devDependencies", {}),
            }

            missing_deps = [dep for dep in required_deps if dep not in dependencies]
            if missing_deps:
                self.log(f"Missing frontend dependencies: {missing_deps}", "ERROR")
                return False

        # Check backend dependencies
        backend_reqs = self.backend_path / "requirements.txt"
        if backend_reqs.exists():
            with open(backend_reqs, "r") as f:
                req_content = f.read()

            required_deps = ["fastapi", "websockets", "pydantic", "sqlalchemy"]
            missing_deps = [
                dep for dep in required_deps if dep not in req_content.lower()
            ]
            if missing_deps:
                self.log(f"Missing backend dependencies: {missing_deps}", "ERROR")
                return False

        self.log("Package dependencies validation passed", "SUCCESS")
        return True

    def validate_configuration_files(self) -> bool:
        """Validate that all configuration files are properly set up"""
        self.log("Validating configuration files...")

        config_checks = []

        # Check Angular config
        ng_config = self.frontend_path / "angular.json"
        if ng_config.exists():
            config_checks.append("Angular configuration")

        # Check TypeScript config
        ts_config = self.frontend_path / "tsconfig.json"
        if ts_config.exists():
            config_checks.append("TypeScript configuration")

        # Check app config for NgRx setup
        app_config = self.frontend_path / "src/app/app.config.ts"
        if app_config.exists():
            with open(app_config, "r") as f:
                content = f.read()
                if (
                    "provideStore" in content
                    and "contentReducer" in content
                    and "writerReducer" in content
                ):
                    config_checks.append("NgRx store configuration")

        if len(config_checks) < 3:
            self.log("Configuration files incomplete", "ERROR")
            return False

        self.log(
            f"Configuration validation passed: {', '.join(config_checks)}", "SUCCESS"
        )
        return True

    def run_comprehensive_validation(self) -> Dict[str, Any]:
        """Run all validation tests and return results"""
        self.log("🚀 Starting Phase 4.5 Comprehensive Validation")
        self.log("=" * 50)

        tests = [
            ("Frontend Structure", self.validate_frontend_structure),
            ("Backend Structure", self.validate_backend_structure),
            ("Package Dependencies", self.validate_package_dependencies),
            ("Configuration Files", self.validate_configuration_files),
            ("Backend Imports", self.test_backend_imports),
            ("Frontend Build", self.test_frontend_build),
        ]

        results = {}
        all_passed = True

        for test_name, test_func in tests:
            self.log(f"\nRunning {test_name}...")
            try:
                passed = test_func()
                results[test_name] = passed
                if not passed:
                    all_passed = False
            except Exception as e:
                self.log(f"{test_name} failed with exception: {e}", "ERROR")
                results[test_name] = False
                all_passed = False

        self.log("=" * 50)
        if all_passed:
            self.log("🎉 ALL PHASE 4.5 VALIDATION TESTS PASSED!", "SUCCESS")
            self.log("✅ System is ready for Phase 5 development", "SUCCESS")
        else:
            self.log("❌ Some validation tests failed", "ERROR")
            failed_tests = [name for name, passed in results.items() if not passed]
            self.log(f"Failed tests: {', '.join(failed_tests)}", "ERROR")

        return {
            "all_passed": all_passed,
            "test_results": results,
            "summary": {
                "total_tests": len(tests),
                "passed": sum(1 for passed in results.values() if passed),
                "failed": sum(1 for passed in results.values() if not passed),
            },
        }


def main():
    """Main entry point"""
    workspace_root = os.path.dirname(os.path.abspath(__file__))
    validator = Phase45Validator(workspace_root)

    results = validator.run_comprehensive_validation()

    # Write results to file
    results_file = Path(workspace_root) / "PHASE_4_5_FINAL_VALIDATION_RESULTS.json"
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nDetailed results saved to: {results_file}")

    # Exit with appropriate code
    sys.exit(0 if results["all_passed"] else 1)


if __name__ == "__main__":
    main()
