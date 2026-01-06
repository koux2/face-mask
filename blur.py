import cv2
import numpy as np
from PIL import Image, ImageFilter
import os

def blur_background(input_path, output_path):
    try:
        # Load model
        base_dir = os.path.dirname(__file__)
        model_path = os.path.join(base_dir, "u2netp.onnx")
        
        if not os.path.exists(model_path):
            print("Model not found")
            return False

        net = cv2.dnn.readNetFromONNX(model_path)
        
        # Load and preprocess image
        # OpenCV loads as BGR
        image = cv2.imread(input_path)
        if image is None:
            return False
            
        h, w = image.shape[:2]
        
        # Preprocessing expected by U-2-Net
        # Resize to 320x320
        input_size = 320
        img_resized = cv2.resize(image, (input_size, input_size))
        
        # Normalize: (x/255 - mean) / std
        # ImageNet constants
        mean = np.array([0.485, 0.456, 0.406])
        std = np.array([0.229, 0.224, 0.225])
        
        # Convert BGR to RGB
        img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
        img_float = img_rgb.astype(np.float32) / 255.0
        
        img_normalized = (img_float - mean) / std
        
        # NCHW format
        img_normalized = img_normalized.transpose(2, 0, 1)
        img_normalized = np.expand_dims(img_normalized, axis=0)
        
        # Inference
        net.setInput(img_normalized)
        # Output is likely the first output blob. U-2-Net has multiple, first is result.
        output = net.forward()
        
        # Postprocess
        # Output shape is (1, 1, 320, 320) - probability map
        pred = output[0, 0, :, :]
        
        # Min-max normalization (sigmoid approximation if raw logits, but u2net usually outputs logits so we need sigmoid? 
        # Actually u2net output is usually logits. simple normalization 0-1 works for mask)
        # Let's use simple normalization to 0-255
        ma = np.max(pred)
        mi = np.min(pred)
        pred = (pred - mi) / (ma - mi)
        
        # Resize mask back to original size
        mask = cv2.resize(pred, (w, h))
        
        # Soft mask for blending
        # Mask needs to be 3 channels for multiplication or handled via PIL
        
        # --- PIL Processing for blurring ---
        # It's easier to do the blur and composite in PIL as we did before, 
        # utilizing the generated mask.
        
        # Convert mask to uint8 image
        mask_uint8 = (mask * 255).astype(np.uint8)
        mask_img = Image.fromarray(mask_uint8, mode='L')
        
        # Load original for PIL
        original_pil = Image.open(input_path).convert("RGB")
        
        # Blur the background
        blurred_img = original_pil.filter(ImageFilter.GaussianBlur(radius=5))
        
        # Composite
        # paste original on top of blurred using mask
        # Where mask is white (subject), show original. Where black (bg), show blurred.
        # Image.composite(image1, image2, mask) -> mask white means image1, black means image2
        
        final_image = Image.composite(original_pil, blurred_img, mask_img)
        
        final_image.save(output_path, quality=95)
        return True

    except Exception as e:
        print(f"Error in blur_background: {e}")
        import traceback
        traceback.print_exc()
        return False
