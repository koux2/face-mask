import cv2
import numpy as np
from PIL import Image, ImageFilter
import os


# Global model cache
_net = None

def blur_background(input_path, output_path):
    global _net
    try:
        if _net is None:
            # Load model
            base_dir = os.path.dirname(__file__)
            model_path = os.path.join(base_dir, "u2netp.onnx")
            
            if not os.path.exists(model_path):
                print("Model not found")
                return False

            _net = cv2.dnn.readNetFromONNX(model_path)
            print("Loaded U-2-Net model")
        
        net = _net
        
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
        # Min-max normalization (Restored to fix "Full Blur" regression)
        # We need to stretch the probability map to 0-1 range to ensure the subject (highest prob)
        # is fully white (protected) and background (lowest prob) is black (blurred).
        ma = np.max(pred)
        mi = np.min(pred)
        if ma > mi:
            pred = (pred - mi) / (ma - mi)
        else:
            # Flat output (unlikely but safe)
            pred = np.zeros_like(pred)

        # --- Tuning for User Preference (Expand Subject Area) ---
        # 1. Gamma Correction: Boost partial confidence values.
        # Power < 1.0 pushes values towards 1.0 (White/Subject).
        # e.g., 0.3^0.4 = 0.61.  0.1^0.4 = 0.39.
        pred = pred ** 0.4

        # Resize mask back to original size
        mask = cv2.resize(pred, (w, h))

        # 2. Morphological Dilation: Physically expand the white region.
        # This pushes the subject boundary outwards into the background.
        # Dynamic kernel size based on image resolution (approx 1.5% of min dimension)
        k_size = max(5, int(min(w, h) * 0.015)) 
        kernel = np.ones((k_size, k_size), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)
        
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

        # Generate Visualization Mask (Red semi-transparent where background is)
        # Background is where mask_img is BLACK (0).
        # We want Red Overlay on Background.
        # Create a solid red image
        red_overlay = Image.new("RGB", original_pil.size, (255, 0, 0))
        # Create alpha channel for overlay: 
        # We want it visible where background (mask=0). 
        # Invert mask: 255 - mask
        mask_np = np.array(mask_img)
        inv_mask_np = 255 - mask_np
        
        # Make the red weak (e.g. 50% opacity -> 128) where background, 0 where subject
        alpha_np = (inv_mask_np * 0.3).astype(np.uint8) # 30% opacity
        alpha_img = Image.fromarray(alpha_np, mode='L')
        
        red_overlay.putalpha(alpha_img)
        
        # Save visualization
        vis_filename = os.path.basename(output_path).replace("_blurred.jpg", "_mask.png")
        vis_path = os.path.join(os.path.dirname(output_path), vis_filename)
        red_overlay.save(vis_path, format="PNG")
        
        return True, vis_filename

    except Exception as e:
        print(f"Error in blur_background: {e}")
        import traceback
        traceback.print_exc()
        return False
