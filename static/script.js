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

    // Upload and Detect
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await fetch('/detect', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.error) {
                alert('エラーが発生しました: ' + data.error);
                return;
            }

            targetImage.onload = () => {
                setupEditor(data.imageUrl, data.faces);
            };
            targetImage.src = data.imageUrl;
            currentImageUrl = data.imageUrl;

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
            const size = Math.max(face.width, face.height) * 1.5;

            const cssSize = size * scaleX;
            const cssCx = cx * scaleX;
            const cssCy = cy * scaleY;

            const cssLeft = cssCx - cssSize / 2;
            const cssTop = cssCy - cssSize / 2;

            createEmoji(cssLeft, cssTop, cssSize);
        });
    }

    function createEmoji(left, top, size) {
        const div = document.createElement('div');
        div.className = 'emoji-overlay';
        div.style.left = `${left}px`;
        div.style.top = `${top}px`;
        div.style.width = `${size}px`;
        div.style.height = `${size}px`;
        div.dataset.rotation = '0'; // Store rotation

        const img = document.createElement('img');
        img.src = '/static/emoji.png';
        div.appendChild(img);

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

    document.addEventListener('click', () => {
        document.querySelectorAll('.emoji-overlay.selected').forEach(el => el.classList.remove('selected'));
    });

    function selectEmoji(el) {
        document.querySelectorAll('.emoji-overlay.selected').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
    }

    let isDragging = false;
    let isResizing = false;
    let isRotating = false;
    let startX, startY;
    let startLeft, startTop;
    let startWidth;
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
            const newSize = Math.max(20, startWidth + dx);
            activeElement.style.width = `${newSize}px`;
            activeElement.style.height = `${newSize}px`;
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

    // Simple Touch Support (omitted full logic for brevity, reused structure)
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
            const newSize = Math.max(20, startWidth + dx);
            activeElement.style.width = `${newSize}px`;
            activeElement.style.height = `${newSize}px`;
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
        createEmoji(w / 2 - 50, h / 2 - 50, 100);
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

            const emojis = document.querySelectorAll('.emoji-overlay');
            const emojiAsset = new Image();
            emojiAsset.src = '/static/emoji.png';

            emojiAsset.onload = () => {
                emojis.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    const containerRect = canvasContainer.getBoundingClientRect();

                    // Rotation
                    const rotation = parseFloat(el.dataset.rotation || '0');

                    // To draw rotated, we need center point
                    const cssLeft = el.offsetLeft;
                    const cssTop = el.offsetTop;
                    // Note: offsetLeft is relative to parent (canvasContainer), which is good.
                    // But offsetLeft/Top are top-left of the bounding box of the element (before transform?).
                    // If transform is used, visual position matches.
                    // IMPORTANT: offsetLeft/Top DOES NOT change with transform rotate.
                    // But we are manually calculating rotation.

                    // Wait, getBoundingClientRect gives the ROTATED box.
                    // We should use the style properties we set for position + center for rotation.

                    const cssW = parseFloat(el.style.width);
                    const cssH = parseFloat(el.style.height);
                    // Center in CSS space
                    const centerX_css = cssLeft + cssW / 2;
                    const centerY_css = cssTop + cssH / 2;

                    const centerX = centerX_css * scale;
                    const centerY = centerY_css * scale;
                    const w = cssW * scale;
                    const h = cssH * scale;

                    ctx.save();
                    ctx.translate(centerX, centerY);
                    ctx.rotate(rotation * Math.PI / 180);
                    ctx.drawImage(emojiAsset, -w / 2, -h / 2, w, h);
                    ctx.restore();
                });

                const link = document.createElement('a');
                link.download = 'masked_photo.png';
                link.href = exportCanvas.toDataURL('image/png');
                link.click();
            };
        };
    });
});
