# Face Mask Editor

Face Mask Editor is a web-based application that automatically detects faces in images and masks them with an emoji. It also provides an interactive editor for manual adjustments (move, resize, rotate, add/delete emojis).

## Features

- **Automatic Face Detection**: Uses **OpenCV DNN (SSD)** for robust detection, even in challenging conditions like collage photos or small faces.
- **Interactive Editor**:
    - **Move**: Drag and drop masks.
    - **Resize**: Drag handles to resize.
    - **Rotate**: Drag the rotation handle to tilt masks.
    - **Add/Delete**: Manually add new masks or remove incorrect ones.
- **Privacy Focused**:
    - **Preserves Filenames**: `photo.png` -> `photo_masked.jpg`.
    - **Efficient Export**: Saves as optimized JPEG to keep file sizes small.
- **High Precision (v1.1)**: Enhanced internal resolution (600x600) to detect even small faces.

## Installation

1. Clone the repository.
2. Create virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

1. Start the server:
   ```bash
   python app.py
   ```
2. Open your browser at `http://localhost:5001`.
3. Upload an image, edit masks, and download the result.

## Release Notes

### v1.1 (Current)
- **Improved Detection**: Increased inference resolution to 600x600 to catch smaller faces.
- **Polished UX**:
    - Adjusted emoji size to exactly match face size (1.0x).
    - Downloads now use the original filename (e.g., `_masked.jpg`).
    - Output format changed to JPEG (quality 0.9) to significantly reduce file size.

### v1.0
- Initial release with OpenCV DNN backend.
- Replaced unstable MediaPipe implementation.
