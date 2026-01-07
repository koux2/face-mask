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
            
        # Limit resolution for performance (Max 1600px long side)
        MAX_SIZE = 1600
        h, w = image.shape[:2]
        if max(h, w) > MAX_SIZE:
            scale = MAX_SIZE / max(h, w)
            new_w = int(w * scale)
            new_h = int(h * scale)
            image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
            h, w = new_h, new_w  # Update dimensions

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
        output = net.forward()
        
        # Postprocess
        pred = output[0, 0, :, :]
        
        # Min-max normalization
        ma = np.max(pred)
        mi = np.min(pred)
        if ma > mi:
            pred = (pred - mi) / (ma - mi)
        else:
            pred = np.zeros_like(pred)

        # Tuning: Gamma Correction
        pred = pred ** 0.4

        # Resize mask back to original size
        mask = cv2.resize(pred, (w, h))

        # Tuning: Morphological Dilation
        k_size = max(5, int(min(w, h) * 0.015)) 
        kernel = np.ones((k_size, k_size), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)
        
        # --- OpenCV Processing for blurring (Faster than PIL) ---
        
        # Create blurred background
        # GaussianBlur ksize must be odd. 
        # Adjust blur strength relative to image size
        blur_ksize = int(max(w, h) * 0.02) | 1 # Ensure odd, approx 2% of size
        blurred_img = cv2.GaussianBlur(image, (blur_ksize, blur_ksize), 0)
        
        # Composite using mask
        # mask is 0-1 float.
        # Subject (White in mask) -> Original Image
        # Background (Black in mask) -> Blurred Image
        
        # Convert mask to 3 channels
        mask_3ch = np.stack([mask]*3, axis=2)
        
        # Linear interpolation: final = src1 * alpha + src2 * (1 - alpha)
        # alpha = mask (1 where subject, 0 where bg)
        # However, mask is 1 for subject. So:
        # final = original * mask + blurred * (1 - mask)
        
        # Ensure compatible types
        mask_3ch = mask_3ch.astype(np.float32)
        image_float = image.astype(np.float32)
        blurred_float = blurred_img.astype(np.float32)
        
        final_float = image_float * mask_3ch + blurred_float * (1.0 - mask_3ch)
        final_image = final_float.astype(np.uint8)

        # Save result
        cv2.imwrite(output_path, final_image, [cv2.IMWRITE_JPEG_QUALITY, 95])

        # Generate Visualization Mask (Red semi-transparent where background is)
        # Background is where mask is 0.
        # We want Red everywhere, but alpha depends on backgroundness.
        # Backgroundness = 1.0 - mask
        
        # Create pure Red image (BGR: 0, 0, 255)
        red_img = np.zeros_like(final_image)
        red_img[:] = (0, 0, 255) 
        
        # Alpha channel: (1.0 - mask) * 0.3 (30% opacity) * 255
        alpha_channel = ((1.0 - mask) * 0.3 * 255).astype(np.uint8)
        
        # Stack BGR + Alpha -> BGRA
        red_overlay_bgra = np.dstack([red_img, alpha_channel])
        
        # Save visualization (PNG preserves alpha)
        vis_filename = os.path.basename(output_path).replace("_blurred.jpg", "_mask.png")
        vis_path = os.path.join(os.path.dirname(output_path), vis_filename)
        cv2.imwrite(vis_path, red_overlay_bgra)
        
        return True, vis_filename

    except Exception as e:
        print(f"Error in blur_background: {e}")
        import traceback
        traceback.print_exc()
        return False
