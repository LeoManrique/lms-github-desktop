#!/usr/bin/env python3
"""
Process original.png to make the logo fill more of the image space.
Removes unnecessary padding and scales the logo to use 99% of available space.
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install it with: pip install Pillow")
    sys.exit(1)

class LogoProcessor:
    """Process logo to maximize its size within the image"""

    def __init__(self, input_path: Path, output_path: Path = None):
        """Initialize with input and output paths"""
        self.input_path = input_path
        self.output_path = output_path or input_path
        self.target_usage = 0.99  # Use 99% of available space

    def find_content_bounds(self, img: Image.Image) -> tuple:
        """Find the bounding box of non-transparent content"""
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        # Get alpha channel
        alpha = img.split()[-1]

        # Find bounding box of non-transparent pixels
        bbox = alpha.getbbox()

        if bbox is None:
            # No non-transparent pixels found
            return (0, 0, img.width, img.height)

        return bbox

    def crop_to_content(self, img: Image.Image) -> Image.Image:
        """Crop image to remove transparent padding"""
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        bbox = self.find_content_bounds(img)
        cropped = img.crop(bbox)

        print(f"  Original size: {img.size[0]}x{img.size[1]}")
        print(f"  Content bounds: {bbox}")
        print(f"  Cropped size: {cropped.size[0]}x{cropped.size[1]}")

        return cropped

    def scale_to_fit(self, img: Image.Image, target_size: tuple) -> Image.Image:
        """Scale image to fit within target size while maintaining aspect ratio"""
        target_width, target_height = target_size

        # Apply 99% usage factor
        max_width = int(target_width * self.target_usage)
        max_height = int(target_height * self.target_usage)

        # Calculate scaling factor to fit within bounds
        width_ratio = max_width / img.width
        height_ratio = max_height / img.height
        scale_factor = min(width_ratio, height_ratio)

        # Calculate new dimensions
        new_width = int(img.width * scale_factor)
        new_height = int(img.height * scale_factor)

        print(f"  Scaling to: {new_width}x{new_height} (scale factor: {scale_factor:.2f})")

        # Resize with high quality
        scaled = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        return scaled

    def center_on_canvas(self, img: Image.Image, canvas_size: tuple) -> Image.Image:
        """Center the image on a transparent canvas of specified size"""
        canvas_width, canvas_height = canvas_size

        # Create new transparent canvas
        canvas = Image.new('RGBA', canvas_size, (0, 0, 0, 0))

        # Calculate position to center the image
        x = (canvas_width - img.width) // 2
        y = (canvas_height - img.height) // 2

        # Paste the image onto the canvas
        canvas.paste(img, (x, y), img)

        print(f"  Centered at position: ({x}, {y})")

        return canvas

    def process(self) -> None:
        """Process the logo to maximize its size"""
        if not self.input_path.exists():
            raise FileNotFoundError(f"{self.input_path} not found!")

        print(f"\nProcessing {self.input_path.name}...")

        # Load the image
        img = Image.open(self.input_path)

        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        original_size = img.size

        # Step 1: Crop to remove transparent padding
        cropped = self.crop_to_content(img)

        # Step 2: Scale to use 99% of the original canvas size
        scaled = self.scale_to_fit(cropped, original_size)

        # Step 3: Center on a canvas of the original size
        final = self.center_on_canvas(scaled, original_size)

        # Save the result
        final.save(self.output_path, 'PNG')

        print(f"\n✓ Saved to {self.output_path.name}")
        print(f"  Final size: {final.size[0]}x{final.size[1]}")
        print(f"  Logo now uses {self.target_usage*100:.0f}% of available space")

    def create_square_version(self, output_name: str = "original_square.png") -> None:
        """Create a square version of the logo for ICO/ICNS generation"""
        if not self.input_path.exists():
            raise FileNotFoundError(f"{self.input_path} not found!")

        print(f"\nCreating square version...")

        # Load and crop to content
        img = Image.open(self.input_path)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        cropped = self.crop_to_content(img)

        # Determine square canvas size
        max_dim = max(cropped.width, cropped.height)
        square_size = int(max_dim / self.target_usage)  # Add some padding

        # Scale to fit in square
        scaled = self.scale_to_fit(cropped, (square_size, square_size))

        # Center on square canvas
        final = self.center_on_canvas(scaled, (square_size, square_size))

        # Save
        output_path = self.input_path.parent / output_name
        final.save(output_path, 'PNG')

        print(f"\n✓ Created square version: {output_name}")
        print(f"  Size: {final.size[0]}x{final.size[1]}")

def main():
    """Main entry point"""
    script_dir = Path(__file__).parent
    original_path = script_dir / "original.png"

    try:
        # Process the original logo
        processor = LogoProcessor(original_path)
        processor.process()

        # Optionally create a square version
        print("\nWould you like to create a square version for better ICO/ICNS generation? (y/n): ", end="")
        if input().lower() == 'y':
            processor.create_square_version()

        print("\nDone! You can now run replace_logos.py to update all logo files.")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
#!/usr/bin/env python3
"""
Process original.png to make the logo fill more of the image space.
Removes unnecessary padding and scales the logo to use 99% of available space.
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install it with: pip install Pillow")
    sys.exit(1)

class LogoProcessor:
    """Process logo to maximize its size within the image"""

    def __init__(self, input_path: Path, output_path: Path = None):
        """Initialize with input and output paths"""
        self.input_path = input_path
        self.output_path = output_path or input_path
        self.target_usage = 0.99  # Use 99% of available space

    def find_content_bounds(self, img: Image.Image) -> tuple:
        """Find the bounding box of non-transparent content"""
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        # Get alpha channel
        alpha = img.split()[-1]

        # Find bounding box of non-transparent pixels
        bbox = alpha.getbbox()

        if bbox is None:
            # No non-transparent pixels found
            return (0, 0, img.width, img.height)

        return bbox

    def crop_to_content(self, img: Image.Image) -> Image.Image:
        """Crop image to remove transparent padding"""
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        bbox = self.find_content_bounds(img)
        cropped = img.crop(bbox)

        print(f"  Original size: {img.size[0]}x{img.size[1]}")
        print(f"  Content bounds: {bbox}")
        print(f"  Cropped size: {cropped.size[0]}x{cropped.size[1]}")

        return cropped

    def scale_to_fit(self, img: Image.Image, target_size: tuple) -> Image.Image:
        """Scale image to fit within target size while maintaining aspect ratio"""
        target_width, target_height = target_size

        # Apply 99% usage factor
        max_width = int(target_width * self.target_usage)
        max_height = int(target_height * self.target_usage)

        # Calculate scaling factor to fit within bounds
        width_ratio = max_width / img.width
        height_ratio = max_height / img.height
        scale_factor = min(width_ratio, height_ratio)

        # Calculate new dimensions
        new_width = int(img.width * scale_factor)
        new_height = int(img.height * scale_factor)

        print(f"  Scaling to: {new_width}x{new_height} (scale factor: {scale_factor:.2f})")

        # Resize with high quality
        scaled = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        return scaled

    def center_on_canvas(self, img: Image.Image, canvas_size: tuple) -> Image.Image:
        """Center the image on a transparent canvas of specified size"""
        canvas_width, canvas_height = canvas_size

        # Create new transparent canvas
        canvas = Image.new('RGBA', canvas_size, (0, 0, 0, 0))

        # Calculate position to center the image
        x = (canvas_width - img.width) // 2
        y = (canvas_height - img.height) // 2

        # Paste the image onto the canvas
        canvas.paste(img, (x, y), img)

        print(f"  Centered at position: ({x}, {y})")

        return canvas

    def process(self) -> None:
        """Process the logo to maximize its size"""
        if not self.input_path.exists():
            raise FileNotFoundError(f"{self.input_path} not found!")

        print(f"\nProcessing {self.input_path.name}...")

        # Load the image
        img = Image.open(self.input_path)

        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        original_size = img.size

        # Step 1: Crop to remove transparent padding
        cropped = self.crop_to_content(img)

        # Step 2: Scale to use 99% of the original canvas size
        scaled = self.scale_to_fit(cropped, original_size)

        # Step 3: Center on a canvas of the original size
        final = self.center_on_canvas(scaled, original_size)

        # Save the result
        final.save(self.output_path, 'PNG')

        print(f"\n✓ Saved to {self.output_path.name}")
        print(f"  Final size: {final.size[0]}x{final.size[1]}")
        print(f"  Logo now uses {self.target_usage*100:.0f}% of available space")

    def create_square_version(self, output_name: str = "original_square.png") -> None:
        """Create a square version of the logo for ICO/ICNS generation"""
        if not self.input_path.exists():
            raise FileNotFoundError(f"{self.input_path} not found!")

        print(f"\nCreating square version...")

        # Load and crop to content
        img = Image.open(self.input_path)
        if img.mode != 'RGBA':
            img = img.convert('RGBA')

        cropped = self.crop_to_content(img)

        # Determine square canvas size
        max_dim = max(cropped.width, cropped.height)
        square_size = int(max_dim / self.target_usage)  # Add some padding

        # Scale to fit in square
        scaled = self.scale_to_fit(cropped, (square_size, square_size))

        # Center on square canvas
        final = self.center_on_canvas(scaled, (square_size, square_size))

        # Save
        output_path = self.input_path.parent / output_name
        final.save(output_path, 'PNG')

        print(f"\n✓ Created square version: {output_name}")
        print(f"  Size: {final.size[0]}x{final.size[1]}")

def main():
    """Main entry point"""
    script_dir = Path(__file__).parent
    original_path = script_dir / "original.png"

    try:
        # Process the original logo
        processor = LogoProcessor(original_path)
        processor.process()

        # Optionally create a square version
        print("\nWould you like to create a square version for better ICO/ICNS generation? (y/n): ", end="")
        if input().lower() == 'y':
            processor.create_square_version()

        print("\nDone! You can now run replace_logos.py to update all logo files.")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
