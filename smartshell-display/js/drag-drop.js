// Drag and Drop Module
// Handles PC card positioning via drag and drop

class DragDropManager {
    constructor() {
        this.draggedElement = null;
        this.ghostElement = null;
        this.offsetX = 0;
        this.offsetY = 0;
        this.positions = this.loadPositions();
        this.isAdminMode = false;
    }

    // Load saved positions from localStorage
    loadPositions() {
        const saved = localStorage.getItem('smartshell_positions');
        return saved ? JSON.parse(saved) : {};
    }

    // Save positions to localStorage
    savePositions() {
        localStorage.setItem('smartshell_positions', JSON.stringify(this.positions));
    }

    // Initialize drag and drop
    init() {
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        
        // Touch support
        document.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.onTouchEnd.bind(this));
    }

    // Toggle admin mode
    toggleAdminMode() {
        this.isAdminMode = !this.isAdminMode;
        document.body.classList.toggle('admin-mode', this.isAdminMode);
        
        document.querySelectorAll('.pc-card').forEach(card => {
            card.setAttribute('draggable', this.isAdminMode);
        });
        
        return this.isAdminMode;
    }

    // On mouse down - start drag
    onMouseDown(e) {
        const card = e.target.closest('.pc-card');
        if (!card || !this.isAdminMode) return;

        e.preventDefault();
        this.startDrag(card, e.clientX, e.clientY);
    }

    // On touch start
    onTouchStart(e) {
        const card = e.target.closest('.pc-card');
        if (!card || !this.isAdminMode) return;

        e.preventDefault();
        const touch = e.touches[0];
        this.startDrag(card, touch.clientX, touch.clientY);
    }

    // Start dragging
    startDrag(card, clientX, clientY) {
        this.draggedElement = card;
        card.classList.add('dragging');

        const rect = card.getBoundingClientRect();
        this.offsetX = clientX - rect.left;
        this.offsetY = clientY - rect.top;

        // Create ghost element
        this.ghostElement = card.cloneNode(true);
        this.ghostElement.classList.remove('dragging');
        this.ghostElement.classList.add('drag-ghost');
        this.ghostElement.style.width = rect.width + 'px';
        this.ghostElement.style.height = rect.height + 'px';
        this.ghostElement.style.left = rect.left + 'px';
        this.ghostElement.style.top = rect.top + 'px';
        document.body.appendChild(this.ghostElement);

        // Hide original
        card.style.opacity = '0.3';
    }

    // On mouse move
    onMouseMove(e) {
        if (!this.draggedElement) return;
        this.moveDrag(e.clientX, e.clientY);
    }

    // On touch move
    onTouchMove(e) {
        if (!this.draggedElement) return;
        e.preventDefault();
        const touch = e.touches[0];
        this.moveDrag(touch.clientX, touch.clientY);
    }

    // Move ghost element
    moveDrag(clientX, clientY) {
        if (!this.ghostElement) return;

        this.ghostElement.style.left = (clientX - this.offsetX) + 'px';
        this.ghostElement.style.top = (clientY - this.offsetY) + 'px';

        // Find drop target
        const dropTarget = this.findDropTarget(clientX, clientY);
        
        // Remove all drop indicators
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });

        // Add drop indicator
        if (dropTarget) {
            dropTarget.classList.add('drag-over');
        }
    }

    // Find drop target zone
    findDropTarget(clientX, clientY) {
        const elements = document.elementsFromPoint(clientX, clientY);
        
        for (const el of elements) {
            const zoneGrid = el.closest('.zone-grid');
            if (zoneGrid) {
                return zoneGrid;
            }
        }
        return null;
    }

    // On mouse up - end drag
    onMouseUp(e) {
        if (!this.draggedElement) return;
        this.endDrag(e.clientX, e.clientY);
    }

    // On touch end
    onTouchEnd(e) {
        if (!this.draggedElement) return;
        const touch = e.changedTouches[0];
        this.endDrag(touch.clientX, touch.clientY);
    }

    // End drag
    endDrag(clientX, clientY) {
        const dropTarget = this.findDropTarget(clientX, clientY);
        
        // Remove all drop indicators
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });

        if (dropTarget && this.draggedElement) {
            // Move card to new zone
            this.moveCardToZone(this.draggedElement, dropTarget);
        }

        // Cleanup
        if (this.ghostElement) {
            this.ghostElement.remove();
            this.ghostElement = null;
        }

        if (this.draggedElement) {
            this.draggedElement.style.opacity = '';
            this.draggedElement.classList.remove('dragging');
            this.draggedElement = null;
        }
    }

    // Move card to new zone
    moveCardToZone(card, targetZone) {
        const pcId = card.dataset.pcId;
        const targetZoneId = targetZone.closest('.zone')?.dataset.zoneId;

        if (!pcId || !targetZoneId) return;

        // Update position data
        this.positions[pcId] = {
            zoneId: targetZoneId,
            zoneGrid: targetZone.dataset.zoneGrid || 'default'
        };

        // Save positions
        this.savePositions();

        // Move DOM element
        targetZone.appendChild(card);
        
        // Visual feedback
        card.style.transition = 'all 0.3s ease';
        card.style.transform = 'scale(1.1)';
        setTimeout(() => {
            card.style.transform = '';
        }, 300);
    }

    // Get card position
    getCardPosition(pcId) {
        return this.positions[pcId] || null;
    }

    // Set card position manually
    setCardPosition(pcId, zoneId) {
        this.positions[pcId] = { zoneId };
        this.savePositions();
    }

    // Reset all positions
    resetPositions() {
        this.positions = {};
        this.savePositions();
    }
}

// Global instance
const dragDropManager = new DragDropManager();