document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('imageInput');
    const editorSection = document.getElementById('editorSection');
    const canvasContainer = document.getElementById('canvasContainer');
    const targetImage = document.getElementById('targetImage');
    const addEmojiBtn = document.getElementById('addEmojiBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const copyBtn = document.getElementById('copyBtn');
    const exportCanvas = document.getElementById('exportCanvas');

    let currentImageUrl = '';
    let currentOriginalName = 'masked_photo.jpg';

    let creationType = 'emoji_smile'; // Default for new masks

    // Auto Blur State
    let isAutoBlurred = false;
    let originalBeforeAutoBlurFile = null;

    // Helper to update button UI
    function updateButtonState(type) {
        document.querySelectorAll('.type-btn').forEach(btn => {
            if (btn.dataset.type === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        creationType = type;
    }

    // Helper: Generate Emoji Data URL
    const emojiCache = {};
    function getEmojiDataUrl(type) {
        if (emojiCache[type]) return emojiCache[type];

        const canvas = document.createElement('canvas');
        canvas.width = 128; // Increased resolution
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        const emojiMap = {
            'emoji_smile': '☺️',
            'emoji_blush': '😊',
            'emoji_joy': '😂',
            'emoji_fear': '😨'
        };
        const char = emojiMap[type] || '☺️';

        ctx.font = '100px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, 64, 70); // Slightly adjusted y for centering

        const dataUrl = canvas.toDataURL('image/png');
        emojiCache[type] = dataUrl;
        return dataUrl;
    }

    // Helper: Cached Image Loader for Emojis
    const emojiImageCache = {};
    async function loadEmojiImage(type) {
        if (emojiImageCache[type]) return emojiImageCache[type];

        const url = getEmojiDataUrl(type);
        const img = await loadImage(url);
        emojiImageCache[type] = img;
        return img;
    }

    // Mask Type Selectors
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const selected = document.querySelector('.emoji-overlay.selected');

            if (selected) {
                // Editing Mode: Only change the selected mask
                updateMaskContent(selected, type);
                // Also update UI to reflect the change we just made
                updateButtonState(type);
            } else {
                // Creation Mode: Set the type for NEXT add
                creationType = type;
                updateButtonState(type);
            }
        });
    });

    // Upload and Detect
    // Upload and Detect
    let currentFile = null;

    // Upload and Detect
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        currentFile = file;

        // Revoke previous URL to avoid memory leaks
        if (currentImageUrl) {
            URL.revokeObjectURL(currentImageUrl);
        }

        // Capture original name
        const nameParts = file.name.split('.');
        const ext = nameParts.length > 1 ? nameParts.pop() : '';
        const baseName = nameParts.join('.');
        currentOriginalName = `${baseName}_masked.jpg`;

        await processFile(file);
    });

    const blurBtn = document.getElementById('blurBtn');
    blurBtn.addEventListener('click', async () => {
        if (!currentFile) {
            alert('画像をアップロードしてください');
            return;
        }

        // Toggle Logic
        if (isAutoBlurred) {
            // REVERT
            if (originalBeforeAutoBlurFile) {
                currentFile = originalBeforeAutoBlurFile;
                await processFile(currentFile);

                // Reset State
                isAutoBlurred = false;
                originalBeforeAutoBlurFile = null;
                blurBtn.innerHTML = '<span class="icon">💧</span> 自動ぼかし';
                blurBtn.classList.remove('danger');
                blurBtn.classList.add('secondary');
            }
            return;
        }

        // APPLY
        // Show loading state
        const originalText = blurBtn.innerHTML;
        blurBtn.innerHTML = '<div class="spinner"></div> 処理中...';
        blurBtn.disabled = true;

        try {
            // Check file size for Vercel/Serverless limits (approx 4.5MB)
            let fileToSend = currentFile;
            // Threshold: 3.5MB to be safe. If larger, resize/compress.
            if (fileToSend.size > 3.5 * 1024 * 1024) {
                // Compress to JPEG with 2500px max dim (high enough for most) and 0.9 quality
                console.log("File too large (" + (fileToSend.size / 1024 / 1024).toFixed(2) + "MB). Compressing...");
                const blob = await resizeImage(fileToSend, 2500, 2500, 'image/jpeg', 0.9);
                fileToSend = new File([blob], "compressed.jpg", { type: "image/jpeg" });
                console.log("Compressed to " + (fileToSend.size / 1024 / 1024).toFixed(2) + "MB");
            }

            const formData = new FormData();
            formData.append('image', fileToSend);

            const res = await fetch('/blur', {
                method: 'POST',
                body: formData
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Server Error');
            }

            // Load the blurred image blob from the temp URL
            const imgRes = await fetch(data.url);
            const blob = await imgRes.blob();

            // Save original before switch
            originalBeforeAutoBlurFile = currentFile;

            currentFile = new File([blob], "blurred.jpg", { type: "image/jpeg" });
            await processFile(currentFile);

            // Show Visualization Overlay if present
            if (data.mask_url) {
                currentAutoMaskUrl = data.mask_url; // Save for manual edit
                const overlay = document.createElement('img');
                overlay.src = data.mask_url;
                overlay.style.position = 'absolute';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.pointerEvents = 'none'; // Click through
                overlay.style.zIndex = '50'; // On top of image but below emojis (which are z-index 10?) Wait, emojis are on top of canvasContainer? 
                // Emojis are appended to canvasContainer.
                // If I append overlay to targetImage's parent or canvasContainer, order matters.
                // targetImage is in canvasContainer. Emojis are in canvasContainer.
                // Let's z-index it high to be sure we see it.
                // Actually emoji-overlay has z-index 10.
                // We want to see what WAS blurred (background).

                overlay.style.transition = 'opacity 0.5s ease-out';

                canvasContainer.appendChild(overlay);

                // Remove after 2.5 seconds
                setTimeout(() => {
                    overlay.style.opacity = '0';
                    setTimeout(() => overlay.remove(), 500);
                }, 2500);
            }

            // Update UI to Revert State
            isAutoBlurred = true;
            blurBtn.innerHTML = '<span class="icon">↩️</span> ぼかしを解除';
            blurBtn.classList.remove('secondary'); // Optional: make it red/danger to indicate undo?
            // blurBtn.classList.add('danger'); // Let's keep it consistent or use a different style

        } catch (error) {
            console.error('Blur error:', error);
            alert('背景処理に失敗しました: ' + error.message);
            blurBtn.innerHTML = originalText;
        } finally {
            blurBtn.disabled = false;
        }
    });

    // --- Manual Blur Logic ---
    const manualBlurBtn = document.getElementById('manualBlurBtn');
    const manualBlurControls = document.getElementById('manualBlurControls');
    const bgPrimaryControls = document.getElementById('bgPrimaryControls'); // New ref
    const applyBlurBtn = document.getElementById('applyBlurBtn');
    const cancelBlurBtn = document.getElementById('cancelBlurBtn');
    const undoBlurBtn = document.getElementById('undoBlurBtn');
    const manualBlurCanvas = document.getElementById('manualBlurCanvas');

    let isManualBlurMode = false;
    let isDrawingBlur = false;
    let blurCtx = null;
    let blurredPattern = null;
    let blurHistory = []; // History Stack

    manualBlurBtn.addEventListener('click', async () => {
        if (!currentFile || !currentImageUrl) {
            alert('画像をアップロードしてください');
            return;
        }

        startManualBlur();
    });

    async function startManualBlur() {
        isManualBlurMode = true;
        targetImage.style.opacity = '1'; // Ensure visible

        // 1. Prepare Canvas
        const w = targetImage.clientWidth;
        const h = targetImage.clientHeight;
        manualBlurCanvas.width = w;
        manualBlurCanvas.height = h;
        manualBlurCanvas.style.pointerEvents = 'auto'; // Enable drawing
        manualBlurCanvas.style.opacity = '1';

        // Init Drawing Canvas for feedback
        const drawingCanvas = document.getElementById('drawingCanvas');
        drawingCanvas.width = w;
        drawingCanvas.height = h;
        drawingCanvas.style.opacity = '1';
        drawingCanvas.style.pointerEvents = 'none'; // Passthrough to manualBlurCanvas
        const drawCtx = drawingCanvas.getContext('2d');
        drawCtx.clearRect(0, 0, w, h);
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';
        drawCtx.lineWidth = 2;
        drawCtx.strokeStyle = 'white';
        drawCtx.setLineDash([5, 5]);

        blurCtx = manualBlurCanvas.getContext('2d');
        blurCtx.clearRect(0, 0, w, h);

        // 1.5 Prepare Visualization Canvas (Red Overlay)
        let vizCanvas = document.getElementById('vizCanvas');
        if (!vizCanvas) {
            vizCanvas = document.createElement('canvas');
            vizCanvas.id = 'vizCanvas';
            vizCanvas.style.position = 'absolute';
            vizCanvas.style.top = '0';
            vizCanvas.style.left = '0';
            vizCanvas.style.width = '100%';
            vizCanvas.style.height = '100%';
            vizCanvas.style.pointerEvents = 'none';
            vizCanvas.style.zIndex = '40'; // Below labels, above image
            canvasContainer.appendChild(vizCanvas);
        }
        vizCanvas.width = w;
        vizCanvas.height = h;
        const vizCtx = vizCanvas.getContext('2d');
        vizCtx.clearRect(0, 0, w, h);

        // Load existing Auto Mask if available
        if (currentAutoMaskUrl) {
            const autoMaskImg = await loadImage(currentAutoMaskUrl);
            vizCtx.drawImage(autoMaskImg, 0, 0, w, h);
        }


        // 2. Generate Blurred Pattern
        // We create a blurred version of the current view to use as "ink"
        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const offCtx = offCanvas.getContext('2d');

        const img = await loadImage(currentImageUrl);
        // Calculate appropriate blur radius for preview to match server (approx)
        // Server uses radius=5 on full resolution.
        // Client should use radius scaled by size ratio.
        const scale = img.width / w; // Natural / Client
        // If scale is 10 (img 3000, client 300). Server 5px. Client should be 0.5px? 
        // Actually, css blur(5px) on 300px image looks like blur(50px) on 3000px image.
        // So we want css blur to be 5 / scale.
        const radius = Math.max(1, 5 / scale);
        offCtx.filter = `blur(${radius}px)`;
        offCtx.drawImage(img, 0, 0, w, h);

        // Save Initial State
        saveHistory();

        blurredPattern = blurCtx.createPattern(offCanvas, 'no-repeat');
        blurCtx.fillStyle = blurredPattern;

        // Show controls - Swap Rows
        bgPrimaryControls.style.display = 'none';
        manualBlurControls.style.display = 'flex'; // Ensure flex

        // Hide overlay interactions
        document.querySelectorAll('.emoji-overlay').forEach(el => el.style.pointerEvents = 'none');
    }

    // Drawing Events
    function getPos(e) {
        const rect = manualBlurCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    }

    manualBlurCanvas.addEventListener('mousedown', startDraw);
    manualBlurCanvas.addEventListener('touchstart', startDraw, { passive: false });

    manualBlurCanvas.addEventListener('mousemove', draw);
    manualBlurCanvas.addEventListener('touchmove', draw, { passive: false });

    manualBlurCanvas.addEventListener('mouseup', endDraw);
    manualBlurCanvas.addEventListener('touchend', endDraw);
    manualBlurCanvas.addEventListener('mouseleave', endDraw);

    let points = [];
    const drawingCanvas = document.getElementById('drawingCanvas');

    function startDraw(e) {
        if (!isManualBlurMode) return;
        e.preventDefault();
        isDrawingBlur = true;
        points = [];

        const pos = getPos(e);
        points.push(pos);

        const drawCtx = drawingCanvas.getContext('2d');
        drawCtx.beginPath();
        drawCtx.moveTo(pos.x, pos.y);
    }

    function draw(e) {
        if (!isManualBlurMode || !isDrawingBlur) return;
        e.preventDefault();
        const pos = getPos(e);
        points.push(pos);

        const drawCtx = drawingCanvas.getContext('2d');
        drawCtx.lineTo(pos.x, pos.y);
        drawCtx.stroke();
    }

    function endDraw(e) {
        if (!isManualBlurMode || !isDrawingBlur) return;
        isDrawingBlur = false;

        // Finalize Lasso
        const drawCtx = drawingCanvas.getContext('2d');
        drawCtx.closePath();
        drawCtx.stroke(); // Visual close

        // Apply to manualBlurCanvas
        if (points.length > 2) {
            // 1. Update Logic Mask
            blurCtx.beginPath();
            blurCtx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                blurCtx.lineTo(points[i].x, points[i].y);
            }
            blurCtx.closePath();
            blurCtx.fill();
            saveHistory();

            // 2. Update Visualization (Red Overlay)
            const vizCanvas = document.getElementById('vizCanvas');
            if (vizCanvas) {
                const vizCtx = vizCanvas.getContext('2d');
                vizCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                vizCtx.beginPath();
                vizCtx.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    vizCtx.lineTo(points[i].x, points[i].y);
                }
                vizCtx.closePath();
                vizCtx.fill();
            }
        }

        // Clear drawing canvas
        drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        drawCtx.beginPath(); // Reset path
    }

    function saveHistory() {
        const h = manualBlurCanvas.height;
        const w = manualBlurCanvas.width;
        // Store as ImageData
        const data = blurCtx.getImageData(0, 0, w, h);
        blurHistory.push(data);
    }

    undoBlurBtn.addEventListener('click', () => {
        if (blurHistory.length > 1) { // Keep at least initial or 1 step
            blurHistory.pop(); // Remove current
            const previous = blurHistory[blurHistory.length - 1]; // Peek previous
            blurCtx.putImageData(previous, 0, 0);
        } else if (blurHistory.length === 1) {
            // Already at initial state
        }
    });


    // Apply & Cancel
    applyBlurBtn.addEventListener('click', async () => {
        // Compose result in HIGH RESOLUTION
        const img = await loadImage(currentImageUrl);
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = w;
        finalCanvas.height = h;
        const ctx = finalCanvas.getContext('2d');

        // 1. Draw Original
        ctx.drawImage(img, 0, 0);

        // 2. Prepare Blurred Overlay (High Res)
        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = w;
        blurCanvas.height = h;
        const bCtx = blurCanvas.getContext('2d');
        bCtx.filter = 'blur(5px)'; // Match Server Strength
        bCtx.drawImage(img, 0, 0, w, h);

        // 3. Apply Mask Logic
        // We want to keep Blur only where manualBlurCanvas is opaque
        bCtx.globalCompositeOperation = 'destination-in';
        // Draw manualBlurCanvas scaled up
        bCtx.drawImage(manualBlurCanvas, 0, 0, w, h);

        // 4. Composite
        ctx.drawImage(blurCanvas, 0, 0);

        // Convert to Blob
        finalCanvas.toBlob(async (blob) => {
            currentFile = new File([blob], "manual_blur.jpg", { type: "image/jpeg" });
            await processFile(currentFile);
            exitManualBlurMode();
        }, 'image/jpeg', 0.95);
    });

    cancelBlurBtn.addEventListener('click', () => {
        exitManualBlurMode();
    });

    function exitManualBlurMode() {
        isManualBlurMode = false;
        manualBlurCanvas.style.pointerEvents = 'none';
        manualBlurCanvas.style.opacity = '0';

        // Clear canvas
        const ctx = manualBlurCanvas.getContext('2d');
        ctx.clearRect(0, 0, manualBlurCanvas.width, manualBlurCanvas.height);

        // Remove Viz Canvas
        const vizCanvas = document.getElementById('vizCanvas');
        if (vizCanvas) vizCanvas.remove();

        // Reset UI
        // Reset UI - Swap Rows Back
        bgPrimaryControls.style.display = 'flex';
        manualBlurControls.style.display = 'none';

        // Re-enable interactions
        document.querySelectorAll('.emoji-overlay').forEach(el => el.style.pointerEvents = 'auto');
    }

    async function processFile(file) {
        // Show local preview immediately
        const previewUrl = URL.createObjectURL(file);
        currentImageUrl = previewUrl;

        // Setup editor with preview (instant feedback)
        setupEditor(previewUrl);

        // Resize image for backend processing
        try {
            // Get original dimensions to calculate scale later
            const originalImg = await loadImage(previewUrl);
            const originalWidth = originalImg.width;

            const resizedBlob = await resizeImage(file, 1024, 1024);

            // Get resized dimensions
            const resizedImg = await loadImage(URL.createObjectURL(resizedBlob));
            const resizedWidth = resizedImg.width;

            const scale = originalWidth / resizedWidth;

            await detectFaces(resizedBlob, scale);
        } catch (error) {
            console.error('Processing error:', error);
            alert('画像の処理中にエラーが発生しました。');
            resetUI();
        }
    }

    function loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    function resizeImage(file, maxWidth, maxHeight, outputType = null, quality = 0.95) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Fill white background for JPEGs (transparency becomes black otherwise)
                const type = outputType || file.type;
                if (type === 'image/jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(blob);
                }, type, quality);
            };
            img.onerror = reject;
        });
    }

    async function detectFaces(file, scale = 1.0) {
        const formData = new FormData();
        formData.append('image', file, 'image.png');

        try {
            const res = await fetch('/detect', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const text = await res.text();
                console.error('Server Error:', res.status, text);
                alert(`サーバーエラーが発生しました (Status: ${res.status})\n${text.substring(0, 100)}...`);
                return;
            }

            const data = await res.json();

            if (data.error) {
                alert('エラーが発生しました: ' + data.error);
                return;
            }

            // Scale faces back to original size
            const scaledFaces = data.faces.map(face => ({
                x: face.x * scale,
                y: face.y * scale,
                width: face.width * scale,
                height: face.height * scale
            }));

            // data.imageUrl is no longer returned, use currentImageUrl
            setupEditor(currentImageUrl, scaledFaces);

        } catch (err) {
            console.error(err);
            alert('通信エラーが発生しました');
        }
    }

    function setupEditor(url, faces = []) {
        editorSection.style.display = 'flex';

        // Update image source if changed
        if (targetImage.src !== url) {
            targetImage.src = url;
        }

        const render = () => {
            document.querySelectorAll('.emoji-overlay').forEach(el => el.remove());

            const naturalWidth = targetImage.naturalWidth;
            const naturalHeight = targetImage.naturalHeight;
            const clientWidth = targetImage.clientWidth;
            const clientHeight = targetImage.clientHeight;

            const scaleX = clientWidth / naturalWidth;
            const scaleY = clientHeight / naturalHeight;

            faces.forEach(face => {
                const cx = face.x + face.width / 2;
                const cy = face.y + face.height / 2;
                const size = Math.max(face.width, face.height) * 1.0;

                const cssSize = size * scaleX;
                const cssCx = cx * scaleX;
                const cssCy = cy * scaleY;

                const cssLeft = cssCx - cssSize / 2;
                const cssTop = cssCy - cssSize / 2;

                createMask(cssLeft, cssTop, cssSize, 'emoji_smile'); // Default to smiley
            });
        };

        if (targetImage.complete && targetImage.naturalWidth !== 0) {
            render();
        } else {
            targetImage.onload = render;
        }
    }

    function createMask(left, top, size, type = creationType) {
        const div = document.createElement('div');
        div.className = 'emoji-overlay';
        div.style.left = `${left}px`;
        div.style.top = `${top}px`;
        div.style.width = `${size}px`;
        div.style.height = `${size}px`;
        div.dataset.rotation = '0';

        updateMaskContent(div, type);

        const delBtn = document.createElement('div');
        delBtn.className = 'delete-btn';
        delBtn.textContent = '×';
        delBtn.onclick = (e) => {
            e.stopPropagation();
            div.remove();
        };
        div.appendChild(delBtn);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        div.appendChild(resizeHandle);

        const rotateHandle = document.createElement('div');
        rotateHandle.className = 'rotate-handle';
        div.appendChild(rotateHandle);

        div.addEventListener('mousedown', onMouseDown);
        div.addEventListener('touchstart', onTouchStart, { passive: false });
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            selectEmoji(div);
        });

        canvasContainer.appendChild(div);
    }

    function updateMaskContent(div, type) {
        div.dataset.type = type;

        // Clear content that is NOT controls (handles/buttons)
        Array.from(div.children).forEach(child => {
            if (!child.classList.contains('delete-btn') &&
                !child.classList.contains('resize-handle') &&
                !child.classList.contains('rotate-handle')) {
                child.remove();
            }
        });

        if (type.startsWith('emoji')) {
            const img = document.createElement('img');
            img.src = getEmojiDataUrl(type);
            // Insert at beginning to be behind controls
            div.insertBefore(img, div.firstChild);
        } else {
            const box = document.createElement('div');
            box.className = `mask-box mask-${type}`;
            div.insertBefore(box, div.firstChild);
        }
    }

    function selectEmoji(el) {
        document.querySelectorAll('.emoji-overlay.selected').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');

        // Sync UI to selected item
        const type = el.dataset.type || 'emoji';
        updateButtonState(type);
    }

    // Deselect handler
    document.addEventListener('click', (e) => {
        // If clicked on nothing interactive, deselect
        if (!e.target.closest('.emoji-overlay') && !e.target.closest('.controls-column')) {
            document.querySelectorAll('.emoji-overlay.selected').forEach(el => el.classList.remove('selected'));
            // Revert UI to creation type
            updateButtonState(creationType);
        }
    });

    let isDragging = false;
    let isResizing = false;
    let isRotating = false;
    let startX, startY;
    let startLeft, startTop;
    let startWidth, startHeight;
    let activeElement = null;
    let startRotation = 0;
    let centerCX, centerCY;



    function onMouseDown(e) {
        if (e.target.classList.contains('delete-btn')) return;

        e.preventDefault();
        e.stopPropagation();

        activeElement = e.currentTarget;
        selectEmoji(activeElement);

        startX = e.clientX;
        startY = e.clientY;

        if (e.target.classList.contains('resize-handle')) {
            isResizing = true;
            startWidth = activeElement.offsetWidth;
            startHeight = activeElement.offsetHeight; // Capture Height
        } else if (e.target.classList.contains('rotate-handle')) {
            isRotating = true;
            startRotation = parseFloat(activeElement.dataset.rotation || '0');
            // Calculate center
            const rect = activeElement.getBoundingClientRect();
            centerCX = rect.left + rect.width / 2;
            centerCY = rect.top + rect.height / 2;
        } else {
            isDragging = true;
            startLeft = activeElement.offsetLeft;
            startTop = activeElement.offsetTop;
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        if (!activeElement) return;

        if (isDragging) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            activeElement.style.left = `${startLeft + dx}px`;
            activeElement.style.top = `${startTop + dy}px`;
        } else if (isResizing) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const type = activeElement.dataset.type || 'emoji';

            if (type === 'emoji') {
                // Fixed Aspect Ratio
                // Use the larger delta to determine size change
                // or just use dx for simplicity if usually dragging corner
                const d = Math.max(dx, dy);
                const newSize = Math.max(20, startWidth + d);
                activeElement.style.width = `${newSize}px`;
                activeElement.style.height = `${newSize}px`;
            } else {
                // Free Resizing (White/Black)
                const newWidth = Math.max(20, startWidth + dx);
                const newHeight = Math.max(20, startHeight + dy);
                activeElement.style.width = `${newWidth}px`;
                activeElement.style.height = `${newHeight}px`;
            }

        } else if (isRotating) {
            const dx = e.clientX - centerCX;
            const dy = e.clientY - centerCY;
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            // Angle is dependent on mouse start position relative to handle?
            // Handle is at top (-90 deg from center).
            // Let's use simple delta for now or absolute? Absolute is better.
            // atan2(0, -1) is -90 deg (Top).
            // current angle - (-90) = rotation?

            const rotation = angle + 90;
            activeElement.style.transform = `rotate(${rotation}deg)`;
            activeElement.dataset.rotation = rotation;
        }
    }

    function onMouseUp() {
        isDragging = false;
        isResizing = false;
        isRotating = false;
        activeElement = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // Simple Touch Support
    function onTouchStart(e) {
        if (e.target.classList.contains('delete-btn')) return;
        e.stopPropagation();
        activeElement = e.currentTarget;
        selectEmoji(activeElement);

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;

        if (e.target.classList.contains('resize-handle')) {
            isResizing = true;
            startWidth = activeElement.offsetWidth;
            startHeight = activeElement.offsetHeight;
        } else if (e.target.classList.contains('rotate-handle')) {
            isRotating = true;
            startRotation = parseFloat(activeElement.dataset.rotation || '0');
            const rect = activeElement.getBoundingClientRect();
            centerCX = rect.left + rect.width / 2;
            centerCY = rect.top + rect.height / 2;
        } else {
            isDragging = true;
            startLeft = activeElement.offsetLeft;
            startTop = activeElement.offsetTop;
        }

        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    }

    function onTouchMove(e) {
        if (!activeElement) return;
        e.preventDefault();
        const touch = e.touches[0];

        if (isDragging) {
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            activeElement.style.left = `${startLeft + dx}px`;
            activeElement.style.top = `${startTop + dy}px`;
        } else if (isResizing) {
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            const type = activeElement.dataset.type || 'emoji';

            if (type === 'emoji') {
                const d = Math.max(dx, dy);
                const newSize = Math.max(20, startWidth + d);
                activeElement.style.width = `${newSize}px`;
                activeElement.style.height = `${newSize}px`;
            } else {
                const newWidth = Math.max(20, startWidth + dx);
                const newHeight = Math.max(20, startHeight + dy);
                activeElement.style.width = `${newWidth}px`;
                activeElement.style.height = `${newHeight}px`;
            }

        } else if (isRotating) {
            const dx = touch.clientX - centerCX;
            const dy = touch.clientY - centerCY;
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const rotation = angle + 90;
            activeElement.style.transform = `rotate(${rotation}deg)`;
            activeElement.dataset.rotation = rotation;
        }
    }

    function onTouchEnd() {
        isDragging = false;
        isResizing = false;
        isRotating = false;
        activeElement = null;
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
    }


    addEmojiBtn.addEventListener('click', () => {
        if (!currentImageUrl) {
            alert('画像をアップロードしてください');
            return;
        }
        const w = targetImage.clientWidth;
        const h = targetImage.clientHeight;
        createMask(w / 2 - 50, h / 2 - 50, 100, creationType);
    });



    // Helper: Compose final image on exportCanvas
    async function composeImage() {
        if (!currentImageUrl) {
            alert('画像が読み込まれていません。');
            return false;
        }

        try {
            const ctx = exportCanvas.getContext('2d');
            const img = await loadImage(currentImageUrl); // Use helper

            exportCanvas.width = img.naturalWidth;
            exportCanvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);

            const clientWidth = targetImage.clientWidth;
            const naturalWidth = img.naturalWidth;
            const scale = naturalWidth / clientWidth;

            const masks = document.querySelectorAll('.emoji-overlay');
            for (const el of masks) { // Use for...of to allow await inside if needed (though getEmoji is sync)
                const rotation = parseFloat(el.dataset.rotation || '0');
                const type = el.dataset.type || 'emoji_smile';

                const cssW = parseFloat(el.style.width);
                const cssH = parseFloat(el.style.height);
                const cssLeft = el.offsetLeft;
                const cssTop = el.offsetTop;

                const centerX = (cssLeft + cssW / 2) * scale;
                const centerY = (cssTop + cssH / 2) * scale;
                const w = cssW * scale;
                const h = cssH * scale;

                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(rotation * Math.PI / 180);

                if (type === 'white') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(-w / 2, -h / 2, w, h);
                } else if (type === 'black') {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(-w / 2, -h / 2, w, h);
                } else if (type.startsWith('emoji')) {
                    // Load dynamic emoji asset (Cached)
                    const emojiImg = await loadEmojiImage(type);
                    ctx.drawImage(emojiImg, -w / 2, -h / 2, w, h);
                } else {
                    // Fallback for old default 'emoji'
                    const emojiImg = await loadEmojiImage('emoji_smile');
                    ctx.drawImage(emojiImg, -w / 2, -h / 2, w, h);
                }
                ctx.restore();
            }
            return true;
        } catch (error) {
            console.error(error);
            alert('画像の生成に失敗しました: ' + error.message);
            return false;
        }
    }

    downloadBtn.addEventListener('click', async () => {
        try {
            const success = await composeImage();
            if (!success) return;

            // Wait a small tick to ensure browser ready
            setTimeout(() => {
                const link = document.createElement('a');
                link.download = currentOriginalName;
                link.href = exportCanvas.toDataURL('image/jpeg', 0.95);
                link.click();

                // Feedback
                const originalText = downloadBtn.innerHTML;
                downloadBtn.innerHTML = '<span class="icon">✅</span> 保存しました';
                setTimeout(() => {
                    downloadBtn.innerHTML = originalText;
                }, 2000);
            }, 100);
        } catch (e) {
            alert('保存エラー: ' + e.message);
        }
    });

    copyBtn.addEventListener('click', async () => {
        try {
            const success = await composeImage();
            if (!success) return;

            exportCanvas.toBlob(async (blob) => {
                if (!blob) {
                    alert('画像データの生成に失敗しました');
                    return;
                }
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({
                            [blob.type]: blob
                        })
                    ]);

                    // Feedback
                    const originalText = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<span class="icon">✅</span> コピーしました';
                    setTimeout(() => {
                        copyBtn.innerHTML = originalText;
                    }, 2000);
                } catch (err) {
                    console.error(err);
                    alert('コピーに失敗しました: ' + err.message);
                }
            }, 'image/png');
        } catch (e) {
            console.error(e);
            alert('コピーエラー: ' + e.message);
        }
    });
});
