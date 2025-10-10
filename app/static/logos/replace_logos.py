#!/usr/bin/env python3
"""
Replace logo files with original.png while maintaining proper dimensions and formats.
"""

import os
import sys
import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install it with: pip install Pillow")
    sys.exit(1)

class LogoReplacer:
    """Handles logo replacement with proper dimensions and formats"""

    # ICO sizes - larger sizes first for better default display
    # Windows will pick the best size, and 256x256 is commonly used for modern apps
    ICO_SIZES = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]

    def __init__(self, source_path: Path):
        """Initialize with source image"""
        self.source_path = source_path
        self.script_dir = source_path.parent
        self.source_img = self._load_image(source_path)

    def _load_image(self, path: Path) -> Image.Image:
        """Load and prepare source image"""
        if not path.exists():
            raise FileNotFoundError(f"{path} not found!")

        img = Image.open(path)
        print(f"Loaded {path.name}: {img.size[0]}x{img.size[1]} {img.mode}")

        if img.mode != 'RGBA':
            img = img.convert('RGBA')
            print("  Converted to RGBA mode")

        return img

    def _resize_image(self, size: tuple) -> Image.Image:
        """Resize image to specified dimensions"""
        return self.source_img.resize(size, Image.Resampling.LANCZOS)

    def create_png(self, output_path: Path, dimensions: tuple) -> None:
        """Create resized PNG file"""
        resized = self._resize_image(dimensions)
        resized.save(output_path, "PNG")
        self._log_success(output_path.name, f"{dimensions[0]}x{dimensions[1]}")

    def create_ico(self, output_path: Path) -> None:
        """Create Windows ICO file with multiple sizes"""
        ico_images = []

        # Create high-quality resized images for each size
        for size in self.ICO_SIZES:
            resized = self._resize_image(size)
            # Ensure we're using PNG format for better quality in ICO
            if resized.mode != 'RGBA':
                resized = resized.convert('RGBA')
            ico_images.append(resized)

        # Save with the largest image first (better default display)
        ico_images[0].save(
            output_path,
            format='ICO',
            sizes=self.ICO_SIZES,
            append_images=ico_images[1:] if len(ico_images) > 1 else []
        )

        sizes_str = ', '.join([f'{w}x{h}' for w, h in self.ICO_SIZES])
        self._log_success(output_path.name, f"ICO with sizes: {sizes_str}")

    def create_icns(self, output_path: Path) -> None:
        """Create macOS ICNS file"""
        if sys.platform != "darwin":
            # Fallback for non-macOS systems
            self._create_icns_fallback(output_path)
            return

        temp_dir = self._prepare_iconset(output_path)

        try:
            self._run_iconutil(temp_dir, output_path)
            self._log_success(output_path.name, "ICNS using iconutil")
        except Exception as e:
            print(f"  ⚠ iconutil failed: {e}")
            self._create_icns_fallback(output_path)
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _prepare_iconset(self, output_path: Path) -> Path:
        """Prepare iconset directory with all required sizes"""
        temp_dir = Path(output_path.parent, f"{output_path.stem}.iconset")
        temp_dir.mkdir(exist_ok=True)

        for size in self.ICNS_SIZES:
            # Standard resolution
            self._save_icon_size(temp_dir, size, False)

            # Retina resolution (2x) - only up to 512
            if size <= 512:
                self._save_icon_size(temp_dir, size, True)

        return temp_dir

    def _save_icon_size(self, temp_dir: Path, size: int, retina: bool) -> None:
        """Save a single icon size to iconset directory"""
        actual_size = size * 2 if retina else size
        suffix = "@2x" if retina else ""
        icon_name = f"icon_{size}x{size}{suffix}.png"

        resized = self._resize_image((actual_size, actual_size))
        resized.save(temp_dir / icon_name, "PNG")

    def _run_iconutil(self, temp_dir: Path, output_path: Path) -> None:
        """Run iconutil command to create ICNS"""
        import subprocess
        subprocess.run(
            ["iconutil", "-c", "icns", str(temp_dir), "-o", str(output_path)],
            check=True,
            capture_output=True
        )

    def _create_icns_fallback(self, output_path: Path) -> None:
        """Create fallback PNG when ICNS creation isn't available"""
        resized = self._resize_image((1024, 1024))
        resized.save(output_path, "PNG")
        print(f"  ⚠ {output_path.name}: ICNS requires macOS. Created PNG placeholder.")

    def _log_success(self, filename: str, details: str) -> None:
        """Log successful file creation"""
        print(f"  ✓ Created {filename}: {details}")

    def process_file(self, filename: str, spec) -> None:
        """Process a single file replacement"""
        output_path = self.script_dir / filename

        try:
            if spec == "ico":
                self.create_ico(output_path)
            elif spec == "icns":
                self.create_icns(output_path)
            else:
                self.create_png(output_path, spec)
        except Exception as e:
            print(f"  ✗ Failed to create {filename}: {e}")

    def replace_all(self) -> None:
        """Replace all logo files"""
        replacements = {
            "1024x1024.png": (1024, 1024),
            "256x256.png": (256, 256),
            "512x512.png": (512, 512),
            "icon-logo.ico": "ico",
            "icon-logo.icns": "icns",
        }

        # Additional files in common directory (2x means 128x128 for 64x64 display)
        common_replacements = {
            "../common/logo-64x64@2x.png": (128, 128),
            "../common/windows-logo-64x64@2x.png": (128, 128),
        }

        print("\nReplacing logo files...")

        # Process files in logos directory
        for filename, spec in replacements.items():
            self.process_file(filename, spec)

        # Process files in common directory
        for filename, spec in common_replacements.items():
            self.process_file(filename, spec)

        self._print_summary()

    def _print_summary(self) -> None:
        """Print summary of operations"""
        print("\nDone! Logo files have been replaced.")
        print("\nReplaced files:")
        print("  In logos/:")
        print("    - 1024x1024.png, 256x256.png, 512x512.png")
        print("    - icon-logo.ico, icon-logo.icns")
        print("  In common/:")
        print("    - logo-64x64@2x.png (128x128 for retina)")
        print("    - windows-logo-64x64@2x.png (128x128 for retina)")
        print("\nSkipped files:")
        print("  - icon-logo-yellow.ico (development icon)")
        print("  - icon-logo-yellow.icns (development icon)")
        print("  - win32-installer-splash.gif (installer splash)")
        print("\nRemember to rebuild the app after replacing the logos!")

def main():
    """Main entry point"""
    script_dir = Path(__file__).parent
    original_path = script_dir / "original.png"

    try:
        replacer = LogoReplacer(original_path)
        replacer.replace_all()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
#!/usr/bin/env python3
"""
Replace logo files with original.png while maintaining proper dimensions and formats.
"""

import os
import sys
import shutil
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install it with: pip install Pillow")
    sys.exit(1)

class LogoReplacer:
    """Handles logo replacement with proper dimensions and formats"""

    # ICO sizes - larger sizes first for better default display
    # Windows will pick the best size, and 256x256 is commonly used for modern apps
    ICO_SIZES = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    ICNS_SIZES = [16, 32, 64, 128, 256, 512, 1024]

    def __init__(self, source_path: Path):
        """Initialize with source image"""
        self.source_path = source_path
        self.script_dir = source_path.parent
        self.source_img = self._load_image(source_path)

    def _load_image(self, path: Path) -> Image.Image:
        """Load and prepare source image"""
        if not path.exists():
            raise FileNotFoundError(f"{path} not found!")

        img = Image.open(path)
        print(f"Loaded {path.name}: {img.size[0]}x{img.size[1]} {img.mode}")

        if img.mode != 'RGBA':
            img = img.convert('RGBA')
            print("  Converted to RGBA mode")

        return img

    def _resize_image(self, size: tuple) -> Image.Image:
        """Resize image to specified dimensions"""
        return self.source_img.resize(size, Image.Resampling.LANCZOS)

    def create_png(self, output_path: Path, dimensions: tuple) -> None:
        """Create resized PNG file"""
        resized = self._resize_image(dimensions)
        resized.save(output_path, "PNG")
        self._log_success(output_path.name, f"{dimensions[0]}x{dimensions[1]}")

    def create_ico(self, output_path: Path) -> None:
        """Create Windows ICO file with multiple sizes"""
        ico_images = []

        # Create high-quality resized images for each size
        for size in self.ICO_SIZES:
            resized = self._resize_image(size)
            # Ensure we're using PNG format for better quality in ICO
            if resized.mode != 'RGBA':
                resized = resized.convert('RGBA')
            ico_images.append(resized)

        # Save with the largest image first (better default display)
        ico_images[0].save(
            output_path,
            format='ICO',
            sizes=self.ICO_SIZES,
            append_images=ico_images[1:] if len(ico_images) > 1 else []
        )

        sizes_str = ', '.join([f'{w}x{h}' for w, h in self.ICO_SIZES])
        self._log_success(output_path.name, f"ICO with sizes: {sizes_str}")

    def create_icns(self, output_path: Path) -> None:
        """Create macOS ICNS file"""
        if sys.platform != "darwin":
            # Fallback for non-macOS systems
            self._create_icns_fallback(output_path)
            return

        temp_dir = self._prepare_iconset(output_path)

        try:
            self._run_iconutil(temp_dir, output_path)
            self._log_success(output_path.name, "ICNS using iconutil")
        except Exception as e:
            print(f"  ⚠ iconutil failed: {e}")
            self._create_icns_fallback(output_path)
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def _prepare_iconset(self, output_path: Path) -> Path:
        """Prepare iconset directory with all required sizes"""
        temp_dir = Path(output_path.parent, f"{output_path.stem}.iconset")
        temp_dir.mkdir(exist_ok=True)

        for size in self.ICNS_SIZES:
            # Standard resolution
            self._save_icon_size(temp_dir, size, False)

            # Retina resolution (2x) - only up to 512
            if size <= 512:
                self._save_icon_size(temp_dir, size, True)

        return temp_dir

    def _save_icon_size(self, temp_dir: Path, size: int, retina: bool) -> None:
        """Save a single icon size to iconset directory"""
        actual_size = size * 2 if retina else size
        suffix = "@2x" if retina else ""
        icon_name = f"icon_{size}x{size}{suffix}.png"

        resized = self._resize_image((actual_size, actual_size))
        resized.save(temp_dir / icon_name, "PNG")

    def _run_iconutil(self, temp_dir: Path, output_path: Path) -> None:
        """Run iconutil command to create ICNS"""
        import subprocess
        subprocess.run(
            ["iconutil", "-c", "icns", str(temp_dir), "-o", str(output_path)],
            check=True,
            capture_output=True
        )

    def _create_icns_fallback(self, output_path: Path) -> None:
        """Create fallback PNG when ICNS creation isn't available"""
        resized = self._resize_image((1024, 1024))
        resized.save(output_path, "PNG")
        print(f"  ⚠ {output_path.name}: ICNS requires macOS. Created PNG placeholder.")

    def _log_success(self, filename: str, details: str) -> None:
        """Log successful file creation"""
        print(f"  ✓ Created {filename}: {details}")

    def process_file(self, filename: str, spec) -> None:
        """Process a single file replacement"""
        output_path = self.script_dir / filename

        try:
            if spec == "ico":
                self.create_ico(output_path)
            elif spec == "icns":
                self.create_icns(output_path)
            else:
                self.create_png(output_path, spec)
        except Exception as e:
            print(f"  ✗ Failed to create {filename}: {e}")

    def replace_all(self) -> None:
        """Replace all logo files"""
        replacements = {
            "1024x1024.png": (1024, 1024),
            "256x256.png": (256, 256),
            "512x512.png": (512, 512),
            "icon-logo.ico": "ico",
            "icon-logo.icns": "icns",
        }

        # Additional files in common directory (2x means 128x128 for 64x64 display)
        common_replacements = {
            "../common/logo-64x64@2x.png": (128, 128),
            "../common/windows-logo-64x64@2x.png": (128, 128),
        }

        print("\nReplacing logo files...")

        # Process files in logos directory
        for filename, spec in replacements.items():
            self.process_file(filename, spec)

        # Process files in common directory
        for filename, spec in common_replacements.items():
            self.process_file(filename, spec)

        self._print_summary()

    def _print_summary(self) -> None:
        """Print summary of operations"""
        print("\nDone! Logo files have been replaced.")
        print("\nReplaced files:")
        print("  In logos/:")
        print("    - 1024x1024.png, 256x256.png, 512x512.png")
        print("    - icon-logo.ico, icon-logo.icns")
        print("  In common/:")
        print("    - logo-64x64@2x.png (128x128 for retina)")
        print("    - windows-logo-64x64@2x.png (128x128 for retina)")
        print("\nSkipped files:")
        print("  - icon-logo-yellow.ico (development icon)")
        print("  - icon-logo-yellow.icns (development icon)")
        print("  - win32-installer-splash.gif (installer splash)")
        print("\nRemember to rebuild the app after replacing the logos!")

def main():
    """Main entry point"""
    script_dir = Path(__file__).parent
    original_path = script_dir / "original.png"

    try:
        replacer = LogoReplacer(original_path)
        replacer.replace_all()
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
