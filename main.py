import sys
import os
import cv2
import numpy as np
import os
from PIL import Image

def detect_faces(input_path, model_path=None):
    # Load model files
    # Note: model_path argument is now less relevant as we need two files, 
    # but we can assume they are in the same dir as this script for simplicity,
    # or passed specifically. For now hardcode or lookup relative to file.
    base_dir = os.path.dirname(__file__)
    prototxt_path = os.path.join(base_dir, "deploy.prototxt.txt")
    model_file_path = os.path.join(base_dir, "res10_300x300_ssd_iter_140000.caffemodel")
    
    net = cv2.dnn.readNetFromCaffe(prototxt_path, model_file_path)

    # Load image
    image = cv2.imread(input_path)
    (h, w) = image.shape[:2]

    # Preprocess image: resize to 300x300 for the model
    blob = cv2.dnn.blobFromImage(cv2.resize(image, (300, 300)), 1.0,
        (300, 300), (104.0, 177.0, 123.0))

    net.setInput(blob)
    detections = net.forward()

    faces = []
    # Loop over detections
    for i in range(0, detections.shape[2]):
        confidence = detections[0, 0, i, 2]

        # Filter out weak detections (0.5 is standard, but for collage maybe 0.3)
        if confidence > 0.3:
            # Compute bbox
            box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
            (startX, startY, endX, endY) = box.astype("int")
            
            # Ensure within bounds
            startX = max(0, startX)
            startY = max(0, startY)
            endX = min(w, endX)
            endY = min(h, endY)
            
            width = endX - startX
            height = endY - startY
            
            # Filter unlikely huge boxes (80% rule)
            if width > w * 0.8 or height > h * 0.8:
                continue

            faces.append({
                'x': int(startX),
                'y': int(startY),
                'width': int(width),
                'height': int(height)
            })
            
    return faces

def process_image(input_path, output_path, emoji_path, model_path):
    faces = detect_faces(input_path, model_path)
    
    if not faces:
        print("No faces detected.")
        base_img = Image.open(input_path).convert("RGB")
        base_img.save(output_path)
        return

    # Load the emoji image
    try:
        emoji_img = Image.open(emoji_path).convert("RGBA")
    except Exception as e:
        print(f"Error loading emoji: {e}")
        return

    # Use PIL for composition
    base_img = Image.open(input_path).convert("RGB")
    
    for face in faces:
        x, y, w, h = face['x'], face['y'], face['width'], face['height']
        
        # Calculate center
        center_x = x + w // 2
        center_y = y + h // 2
        
        # Use simple max dimension for size to keep emoji square (1:1 aspect ratio)
        size = int(max(w, h) * 1.5)
        
        new_w = size
        new_h = size
        new_x = center_x - new_w // 2
        new_y = center_y - new_h // 2

        # Resize emoji
        emoji_resized = emoji_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        
        # Paste emoji
        base_img.paste(emoji_resized, (new_x, new_y), emoji_resized)

    # Save result
    base_img.save(output_path)
    print(f"Saved masked image to: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python main.py <input_image_path>")
        sys.exit(1)

    input_file = sys.argv[1]
    # Create output filename
    filename, ext = os.path.splitext(input_file)
    output_file = f"{filename}_masked{ext}"
    
    emoji_asset_path = os.path.join(os.path.dirname(__file__), "assets", "emoji.png")
    
    
    process_image(input_file, output_file, emoji_asset_path, None)
