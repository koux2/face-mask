from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import uuid
from main import detect_faces

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

if __name__ == '__main__':
    app.run(debug=True, port=5001)
