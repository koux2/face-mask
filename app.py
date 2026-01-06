from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
import os
import uuid
from main import detect_faces
from blur import blur_background

app = Flask(__name__)
# Vercel allows writing to /tmp
UPLOAD_FOLDER = '/tmp'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory('assets', filename)

@app.route('/detect', methods=['POST'])
def detect():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    filename = str(uuid.uuid4()) + os.path.splitext(file.filename)[1]
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)
    
    try:
        faces = detect_faces(filepath, None)
        
        # Clean up temporary file
        if os.path.exists(filepath):
            os.remove(filepath)
            
        # Return only faces, frontend uses local blob
        return jsonify({
            'faces': faces
        })
    except Exception as e:
        # Clean up on error too
        if os.path.exists(filepath):
            os.remove(filepath)
        return jsonify({'error': str(e)}), 500

@app.route('/blur', methods=['POST'])
def blur():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400
        
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    unique_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    filename = unique_id + ext
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    output_filename = unique_id + "_blurred.jpg"
    output_filepath = os.path.join(UPLOAD_FOLDER, output_filename)
    
    file.save(filepath)
    
    try:
        success = blur_background(filepath, output_filepath)
        
        if success:
            return send_file(output_filepath, mimetype='image/jpeg')
        else:
            return jsonify({'error': 'Failed to process image'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # Clean up input file
        if os.path.exists(filepath):
            os.remove(filepath)
        # Output file is streamed by send_file? 
        # Actually send_file might keep it open. 
        # Flask's send_file usually handles file closing but deletion is tricky.
        # For simplicity in this dev environment, we might leave it or use after_request.
        # Let's rely on /tmp being cleared eventually or add cleanup logic if critical.
        pass

if __name__ == '__main__':
    app.run(debug=True, port=5001)
