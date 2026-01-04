document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('imageInput');
    const editorSection = document.getElementById('editorSection');
    const canvasContainer = document.getElementById('canvasContainer');
    const targetImage = document.getElementById('targetImage');
    const addEmojiBtn = document.getElementById('addEmojiBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const resetBtn = document.getElementById('resetBtn');
    const exportCanvas = document.getElementById('exportCanvas');

    let currentImageUrl = '';
    let currentOriginalName = 'masked_photo.jpg';
    let creationType = 'emoji'; // Default for new masks

    // Helper to update button UI
    function updateButtonState(type) {
        document.querySelectorAll('.type-btn').forEach(btn => {
            if (btn.dataset.type === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
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
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Revoke previous URL to avoid memory leaks
        if (currentImageUrl) {
            URL.revokeObjectURL(currentImageUrl);
        }

        // Capture original name
        const nameParts = file.name.split('.');
        const ext = nameParts.length > 1 ? nameParts.pop() : '';
        const baseName = nameParts.join('.');
        currentOriginalName = `${baseName}_masked.jpg`;

        // Create local preview URL immediately
        const objectUrl = URL.createObjectURL(file);
        currentImageUrl = objectUrl;

        targetImage.onload = () => {
            // Image loaded, waiting for detection...
        };
        targetImage.src = objectUrl;

        const formData = new FormData();
        formData.append('image', file);

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

            // data.imageUrl is no longer returned, use currentImageUrl
            setupEditor(currentImageUrl, data.faces);

        } catch (err) {
            console.error(err);
            alert('通信エラーが発生しました');
        }
    });

    function setupEditor(url, faces) {
        editorSection.style.display = 'flex';
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

            createMask(cssLeft, cssTop, cssSize, 'emoji'); // Default to emoji on auto-detect
        });
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

        if (type === 'emoji') {
            const img = document.createElement('img');
            img.src = '/static/emoji.png';
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

    resetBtn.addEventListener('click', () => {
        imageInput.value = '';
        editorSection.style.display = 'none';
        currentImageUrl = '';
    });

    downloadBtn.addEventListener('click', async () => {
        if (!currentImageUrl) return;

        const ctx = exportCanvas.getContext('2d');
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = currentImageUrl;

        img.onload = async () => {
            exportCanvas.width = img.naturalWidth;
            exportCanvas.height = img.naturalHeight;
            ctx.drawImage(img, 0, 0);

            const clientWidth = targetImage.clientWidth;
            const naturalWidth = img.naturalWidth;
            const scale = naturalWidth / clientWidth;

            // For emoji loading sync
            const loadEmoji = () => new Promise(resolve => {
                const i = new Image();
                i.onload = () => resolve(i);
                i.src = '/static/emoji.png';
            });
            const emojiAsset = await loadEmoji();

            const masks = document.querySelectorAll('.emoji-overlay');
            masks.forEach(el => {
                const rotation = parseFloat(el.dataset.rotation || '0');
                const type = el.dataset.type || 'emoji';

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
                } else {
                    // Emoji
                    ctx.drawImage(emojiAsset, -w / 2, -h / 2, w, h);
                }
                ctx.restore();
            });

            const link = document.createElement('a');
            link.download = currentOriginalName;
            link.href = exportCanvas.toDataURL('image/jpeg', 0.9);
            link.click();
        };
    });
});
