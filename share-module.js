// ==================== SHARE MODULE - IMPROVED VERSION ====================
// No user email in share links - uses only link ID for security and privacy

class ShareModule {
    constructor() {
        this.currentUser = null;
        this.encodedEmail = null;
        this.mainDB = null;      // Main database (for config only)
        this.shareDB = null;     // Share database (for actual data)
        this.shareApp = null;
        this.shareDatabaseUrl = null;
        this.siteUrl = null;      // Site URL fetched from master database
        this.secureLinks = {};
        this.currentSection = 'create';
        
        // Selected photos for sharing
        this.selectedPhotoIds = new Set();
        this.availablePhotos = [];
    }

    // ========== INITIALIZATION ==========
    async initShareModule() {
        try {
            const authModule = window.authModule;
            
            if (authModule && authModule.isAuthenticated) {
                this.currentUser = authModule.currentUser;
                this.encodedEmail = this.encodeEmail(this.currentUser.email);
                this.mainDB = authModule.masterDB;  // Main database
                
                // STEP 1: Get share database URL from main database
                await this.getShareDatabaseUrl();
                
                // STEP 2: Get site URL from main database
                await this.getSiteUrl();
                
                // STEP 3: Connect to share database
                await this.connectToShareDatabase();
                
                console.log('Share module initialized with share database');
            } else {
                this.loadUserDataFromStorage();
                // Try to get main DB from auth module
                if (window.authModule && window.authModule.masterDB) {
                    this.mainDB = window.authModule.masterDB;
                    await this.getShareDatabaseUrl();
                    await this.getSiteUrl();
                    await this.connectToShareDatabase();
                }
            }
            
            await this.loadUserLinks();
            await this.loadAvailablePhotos();

            // Auto-delete expired links every hour
            setInterval(() => {
                this.deleteExpiredLinks();
            }, 60 * 60 * 1000);
            
            return true;
        } catch (error) {
            console.error('Error initializing share module:', error);
            return false;
        }
    }

    // STEP 1: Read share database URL from main database
    async getShareDatabaseUrl() {
        if (!this.mainDB) {
            console.error('Main database not available');
            return null;
        }
        
        try {
            // Read from shareURL/url path in main database
            const snapshot = await this.mainDB.ref('shareURL/url').once('value');
            
            if (snapshot.exists()) {
                this.shareDatabaseUrl = snapshot.val();
                console.log('Share database URL found:', this.shareDatabaseUrl);
                
                // Cache for future use
                localStorage.setItem('shareDatabaseUrl', this.shareDatabaseUrl);
                return this.shareDatabaseUrl;
            } else {
                // Try backup location
                const backupSnapshot = await this.mainDB.ref('shareURL/value').once('value');
                if (backupSnapshot.exists()) {
                    this.shareDatabaseUrl = backupSnapshot.val();
                    console.log('Share database URL found (backup):', this.shareDatabaseUrl);
                    localStorage.setItem('shareDatabaseUrl', this.shareDatabaseUrl);
                    return this.shareDatabaseUrl;
                }
                
                console.error('No share database URL found in main database');
                return null;
            }
        } catch (error) {
            console.error('Error reading share database URL:', error);
            // Try to use cached URL
            const cachedUrl = localStorage.getItem('shareDatabaseUrl');
            if (cachedUrl) {
                console.log('Using cached share database URL:', cachedUrl);
                this.shareDatabaseUrl = cachedUrl;
                return cachedUrl;
            }
            return null;
        }
    }

    // STEP 2: Read site URL from master database
    async getSiteUrl() {
        if (!this.mainDB) {
            console.error('Main database not available for site URL');
            return null;
        }
        
        try {
            // Read from siteURL/url path in main database
            const snapshot = await this.mainDB.ref('siteURL/url').once('value');
            
            if (snapshot.exists()) {
                this.siteUrl = snapshot.val();
                console.log('Site URL found:', this.siteUrl);
                
                // Cache for future use
                localStorage.setItem('siteUrl', this.siteUrl);
                return this.siteUrl;
            } else {
                // Try backup location
                const backupSnapshot = await this.mainDB.ref('siteURL/value').once('value');
                if (backupSnapshot.exists()) {
                    this.siteUrl = backupSnapshot.val();
                    console.log('Site URL found (backup):', this.siteUrl);
                    localStorage.setItem('siteUrl', this.siteUrl);
                    return this.siteUrl;
                }
                
                // Fallback to default if nothing found in database
                console.warn('No site URL found in main database, using default');
                this.siteUrl = "https://priboxapps.github.io/share/content.html";
                localStorage.setItem('siteUrl', this.siteUrl);
                return this.siteUrl;
            }
        } catch (error) {
            console.error('Error reading site URL:', error);
            // Try to use cached URL
            const cachedUrl = localStorage.getItem('siteUrl');
            if (cachedUrl) {
                console.log('Using cached site URL:', cachedUrl);
                this.siteUrl = cachedUrl;
                return cachedUrl;
            }
            // Final fallback
            this.siteUrl = "https://priboxapps.github.io/share/content.html";
            return this.siteUrl;
        }
    }

    // Get current site URL (with fallback)
    getSiteUrlSync() {
        if (this.siteUrl) return this.siteUrl;
        
        // Try to get from localStorage
        const cachedUrl = localStorage.getItem('siteUrl');
        if (cachedUrl) {
            this.siteUrl = cachedUrl;
            return cachedUrl;
        }
        
        // Default fallback
        return "https://priboxapps.github.io/share/content.html";
    }

    // STEP 3: Connect to share database
    async connectToShareDatabase() {
        if (!this.shareDatabaseUrl) {
            console.error('No share database URL available');
            return false;
        }
        
        try {
            // Check if app already exists for this URL
            let existingApp = firebase.apps.find(app => {
                return app.options && app.options.databaseURL === this.shareDatabaseUrl;
            });
            
            if (existingApp) {
                this.shareApp = existingApp;
                this.shareDB = existingApp.database();
                console.log('Using existing share database connection');
            } else {
                // Create new Firebase app for share database
                const appName = `shareDB_${Date.now()}`;
                this.shareApp = firebase.initializeApp(
                    { databaseURL: this.shareDatabaseUrl },
                    appName
                );
                this.shareDB = this.shareApp.database();
                console.log('Connected to share database:', this.shareDatabaseUrl);
            }
            
            // Test connection
            const connectedRef = this.shareDB.ref('.info/connected');
            const isConnected = await connectedRef.once('value');
            
            if (isConnected.val() === true) {
                console.log('Share database connection confirmed');
                return true;
            } else {
                console.warn('Share database connection may be unavailable');
                return false;
            }
            
        } catch (error) {
            console.error('Error connecting to share database:', error);
            return false;
        }
    }

    loadUserDataFromStorage() {
        try {
            const userDataStr = localStorage.getItem('currentUser');
            if (userDataStr) {
                this.currentUser = JSON.parse(userDataStr);
                if (this.currentUser?.email) {
                    this.encodedEmail = this.encodeEmail(this.currentUser.email);
                }
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    // Load available photos from photos module
    async loadAvailablePhotos() {
        try {
            if (window.photosModule && window.photosModule.photos) {
                this.availablePhotos = [...window.photosModule.photos];
                console.log(`Loaded ${this.availablePhotos.length} available photos for sharing`);
                return true;
            }
            this.availablePhotos = [];
            return false;
        } catch (error) {
            console.error('Error loading available photos:', error);
            this.availablePhotos = [];
            return false;
        }
    }

    // ========== ENCODING ==========
    encodeEmail(email) {
        if (!email) return '';
        return email.replace(/\./g, ',').replace(/@/g, '-at-');
    }

    decodeEmail(encodedEmail) {
        if (!encodedEmail) return '';
        return encodedEmail.replace(/-at-/g, '@').replace(/,/g, '.');
    }

    // ========== HASHING & ID GENERATION ==========
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    generateId() {
        return 'share_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ========== DATABASE OPERATIONS - ALL USE SHARE DATABASE ==========
    
    async loadUserLinks() {
        if (!this.encodedEmail || !this.shareDB) {
            console.warn('Cannot load links: No share database connection');
            return;
        }
        
        try {
            // Read from SHARE database
            const userLinksSnapshot = await this.shareDB.ref(`userLinks/${this.encodedEmail}`).once('value');
            const userLinkIds = userLinksSnapshot.val() || {};
            
            this.secureLinks = {};
            for (const linkId of Object.keys(userLinkIds)) {
                const linkSnapshot = await this.shareDB.ref(`shareLinks/${linkId}`).once('value');
                const linkData = linkSnapshot.val();
                if (linkData) {
                    this.secureLinks[linkId] = linkData;
                }
            }
            
            console.log(`Loaded ${Object.keys(this.secureLinks).length} links from share database`);
            
            // Delete expired links after loading
            await this.deleteExpiredLinks();
            
        } catch (error) {
            console.error('Error loading user links from share database:', error);
            this.secureLinks = {};
        }
    }

    async saveUserLinks() {
        if (!this.encodedEmail || !this.shareDB) {
            console.error('Cannot save: No share database connection');
            return false;
        }
        
        try {
            // Save to SHARE database
            for (const [linkId, linkData] of Object.entries(this.secureLinks)) {
                // Save the full link data under shareLinks/{linkId}
                await this.shareDB.ref(`shareLinks/${linkId}`).set(linkData);
                
                // Maintain user index for quick lookup
                await this.shareDB.ref(`userLinks/${this.encodedEmail}/${linkId}`).set(true);
            }
            
            console.log(`Saved ${Object.keys(this.secureLinks).length} links to share database`);
            return true;
        } catch (error) {
            console.error('Error saving to share database:', error);
            return false;
        }
    }

    async deleteLink(linkId) {
        if (!this.shareDB || !this.encodedEmail) return false;
        
        try {
            // Delete from share database
            await this.shareDB.ref(`shareLinks/${linkId}`).remove();
            await this.shareDB.ref(`userLinks/${this.encodedEmail}/${linkId}`).remove();
            
            // Remove from local object
            delete this.secureLinks[linkId];
            
            console.log(`Link ${linkId} deleted from share database`);
            return true;
        } catch (error) {
            console.error('Error deleting from share database:', error);
            return false;
        }
    }

    async updateLinkStatus(linkId, newStatus) {
        if (!this.shareDB || !this.encodedEmail) return false;
        
        try {
            const linkData = this.secureLinks[linkId];
            if (!linkData) {
                console.error('Link not found:', linkId);
                return false;
            }
            
            // Update status
            linkData.status = newStatus;
            this.secureLinks[linkId] = linkData;
            
            // Save to share database
            await this.shareDB.ref(`shareLinks/${linkId}`).update({ status: newStatus });
            
            console.log(`Link ${linkId} status updated to ${newStatus} in share database`);
            return true;
        } catch (error) {
            console.error('Error updating link status:', error);
            return false;
        }
    }

    async toggleLinkStatus(linkId) {
        const link = this.secureLinks[linkId];
        if (!link) return false;
        
        const newStatus = link.status === 'active' ? 'pending' : 'active';
        const success = await this.updateLinkStatus(linkId, newStatus);
        
        if (success) {
            const statusText = newStatus === 'active' ? 'activated' : 'paused';
            this.showSuccess(`Link ${statusText} successfully!`);
        }
        
        return success;
    }

    // Delete expired links automatically
    async deleteExpiredLinks() {
        if (!this.shareDB || !this.encodedEmail) return;
        
        const now = new Date();
        let deletedCount = 0;
        
        for (const [linkId, linkData] of Object.entries(this.secureLinks)) {
            if (linkData.expiration && new Date(linkData.expiration) < now) {
                console.log(`Deleting expired link: ${linkData.title} (${linkId})`);
                
                await this.shareDB.ref(`shareLinks/${linkId}`).remove();
                await this.shareDB.ref(`userLinks/${this.encodedEmail}/${linkId}`).remove();
                
                delete this.secureLinks[linkId];
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            console.log(`Deleted ${deletedCount} expired links from share database`);
            this.renderLinksList();
        }
        
        return deletedCount;
    }

    // Save password change
    async savePasswordChange(linkId) {
        const link = this.secureLinks[linkId];
        if (!link) {
            this.showError('Link not found');
            return;
        }
        
        const now = new Date();
        const isExpired = link.expiration && new Date(link.expiration) < now;
        if (link.isDestroyed || isExpired || link.status === 'pending') {
            this.showError('Cannot change password for expired, destroyed, or paused links');
            this.hidePasswordSection(linkId);
            return;
        }
        
        const passwordInput = document.getElementById(`password_${linkId}`);
        const removeCheckbox = document.getElementById(`removePassword_${linkId}`);
        
        const newPassword = passwordInput ? passwordInput.value : '';
        const removePassword = removeCheckbox ? removeCheckbox.checked : false;
        
        if (!removePassword && (!newPassword || newPassword.length < 4)) {
            this.showError('Password must be at least 4 characters');
            return;
        }
        
        try {
            if (!this.shareDB) {
                this.showError('Share database not available');
                return;
            }
            
            if (removePassword) {
                link.passwordHash = null;
                link.hasPassword = false;
            } else {
                link.passwordHash = await this.hashPassword(newPassword);
                link.hasPassword = true;
            }
            
            // Save to share database
            await this.shareDB.ref(`shareLinks/${linkId}`).update({
                passwordHash: link.passwordHash,
                hasPassword: link.hasPassword
            });
            
            this.secureLinks[linkId] = link;
            
            this.showSuccess(removePassword ? 'Password removed' : 'Password updated');
            this.hidePasswordSection(linkId);
            this.renderLinksList();
            
        } catch (error) {
            console.error('Error changing password:', error);
            this.showError('Failed to change password');
        }
    }

    // ========== CREATE TEXT LINK ==========
    async createTextLink(title, content, protectionType, password, expiration, viewOnce = false, viewOnceSeconds = 10, status = 'active') {
        const linkId = this.generateId();
        const now = new Date().toISOString();
        
        let passwordHash = null;
        let hasPassword = false;
        
        if (protectionType === 'password' && password) {
            passwordHash = await this.hashPassword(password);
            hasPassword = true;
        }
        
        const linkData = {
            id: linkId,
            title: title,
            type: 'text',
            content: content,
            passwordHash: passwordHash,
            hasPassword: hasPassword,
            createdAt: now,
            expiration: expiration || null,
            views: 0,
            ownerEmail: this.currentUser.email,
            ownerId: this.encodedEmail,
            viewOnce: viewOnce,
            viewOnceSeconds: viewOnce ? viewOnceSeconds : null,
            isDestroyed: false,
            status: status
        };
        
        this.secureLinks[linkId] = linkData;
        await this.saveUserLinks();  // This now saves to share database
        
        // Use dynamic site URL from database
        const secureUrl = `${this.getSiteUrlSync()}?id=${linkId}`;
        
        return { linkId, secureUrl, linkData };
    }

    // ========== CREATE PHOTO LINK ==========
    async createPhotoLink(title, photoIds, protectionType, password, expiration, viewOnce = false, viewOnceSeconds = 10, status = 'active') {
        const linkId = this.generateId();
        const now = new Date().toISOString();
        
        const photos = [];
        for (const photoId of photoIds) {
            const photo = this.availablePhotos.find(p => p.id === photoId);
            if (photo) {
                photos.push({
                    id: photo.id,
                    name: photo.name,
                    url: photo.url,
                    size: photo.size,
                    date: photo.date,
                    description: photo.description || ''
                });
            }
        }
        
        if (photos.length === 0) {
            throw new Error('No valid photos found');
        }
        
        let passwordHash = null;
        let hasPassword = false;
        
        if (protectionType === 'password' && password) {
            passwordHash = await this.hashPassword(password);
            hasPassword = true;
        }
        
        const linkData = {
            id: linkId,
            title: title,
            type: 'photos',
            photos: photos,
            photoCount: photos.length,
            passwordHash: passwordHash,
            hasPassword: hasPassword,
            createdAt: now,
            expiration: expiration || null,
            views: 0,
            ownerEmail: this.currentUser.email,
            ownerId: this.encodedEmail,
            viewOnce: viewOnce,
            viewOnceSeconds: viewOnce ? viewOnceSeconds : null,
            isDestroyed: false,
            status: status
        };
        
        this.secureLinks[linkId] = linkData;
        await this.saveUserLinks();  // This now saves to share database
        
        // Use dynamic site URL from database
        const secureUrl = `${this.getSiteUrlSync()}?id=${linkId}`;
        
        return { linkId, secureUrl, linkData };
    }

    // ========== STATISTICS ==========
    getStats() {
        const links = Object.values(this.secureLinks);
        const totalLinks = links.length;
        const totalViews = links.reduce((sum, link) => sum + (link.views || 0), 0);
        const totalPhotosShared = links
            .filter(link => link.type === 'photos')
            .reduce((sum, link) => sum + (link.photoCount || 0), 0);
        
        const now = new Date();
        const activeLinks = links.filter(link => {
            if (link.isDestroyed) return false;
            if (!link.expiration) return true;
            return new Date(link.expiration) > now;
        }).length;
        
        const expiredLinks = links.filter(link => {
            if (link.isDestroyed) return false;
            if (!link.expiration) return false;
            return new Date(link.expiration) <= now;
        }).length;
        
        const destroyedLinks = links.filter(link => link.isDestroyed).length;
        const viewOnceLinks = links.filter(link => link.viewOnce).length;
        const passwordProtected = links.filter(link => link.hasPassword).length;
        const openLinks = links.filter(link => !link.hasPassword).length;
        const textLinks = links.filter(link => link.type === 'text').length;
        const photoLinks = links.filter(link => link.type === 'photos').length;
        
        let mostViewedLink = null;
        let maxViews = 0;
        for (const link of links) {
            if ((link.views || 0) > maxViews) {
                maxViews = link.views || 0;
                mostViewedLink = link;
            }
        }
        
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentLinks = links.filter(link => new Date(link.createdAt) > sevenDaysAgo);
        
        return { 
            totalLinks, totalViews, totalPhotosShared, activeLinks, expiredLinks, 
            destroyedLinks, viewOnceLinks, passwordProtected, openLinks, textLinks, photoLinks,
            mostViewedLink, maxViews, recentLinksCount: recentLinks.length
        };
    }

    // Check if link is accessible (add to content.html helper)
    isLinkAccessible(linkData) {
        if (!linkData) return false;
        if (linkData.status === 'pending') return false;
        if (linkData.isDestroyed) return false;
        if (linkData.expiration && new Date(linkData.expiration) < new Date()) return false;
        return true;
    }

    // ========== PHOTO SELECTION ==========
    togglePhotoSelection(photoId) {
        if (this.selectedPhotoIds.has(photoId)) {
            this.selectedPhotoIds.delete(photoId);
        } else {
            if (this.selectedPhotoIds.size >= 1) {
                this.showError('Maximum 1 photo per share link');
                return false;
            }
            this.selectedPhotoIds.add(photoId);
        }
        this.updatePhotoUI();
        return true;
    }

    updatePhotoUI() {
        // Update checkboxes
        document.querySelectorAll('.share-photo-checkbox').forEach(checkbox => {
            const photoId = checkbox.getAttribute('data-photo-id');
            if (photoId) {
                checkbox.checked = this.selectedPhotoIds.has(photoId);
            }
        });
        
        // Update selected count
        const selectedCountEl = document.getElementById('selectedPhotoCount');
        if (selectedCountEl) {
            selectedCountEl.textContent = `${this.selectedPhotoIds.size}/1 photos selected`;
        }
        
        // Update preview
        this.updateSelectedPreviews();
        
        // Update create button
        const createBtn = document.getElementById('createLinkSubmitBtn');
        if (createBtn) {
            const contentType = document.querySelector('input[name="contentType"]:checked')?.value;
            createBtn.disabled = (contentType === 'photos' && this.selectedPhotoIds.size === 0);
        }
    }

    updateSelectedPreviews() {
        const previewContainer = document.getElementById('selectedPhotosPreview');
        if (!previewContainer) return;
        
        if (this.selectedPhotoIds.size === 0) {
            previewContainer.innerHTML = '<div class="no-photos-selected">No photos selected. Click on photos above to select them.</div>';
            return;
        }
        
        const selectedPhotos = this.availablePhotos.filter(p => this.selectedPhotoIds.has(p.id));
        previewContainer.innerHTML = `
            <div class="selected-photos-grid">
                ${selectedPhotos.map(photo => `
                    <div class="selected-photo-item">
                        <img src="${photo.url}" alt="${this.escapeHtml(photo.name)}">
                        <button type="button" class="remove-selected-photo" data-photo-id="${photo.id}">
                            <span class="material-icons">close</span>
                        </button>
                        <span class="selected-photo-name">${this.escapeHtml(photo.name.substring(0, 15))}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        previewContainer.querySelectorAll('.remove-selected-photo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const photoId = btn.getAttribute('data-photo-id');
                this.selectedPhotoIds.delete(photoId);
                this.updatePhotoUI();
                this.renderPhotoGrid();
            });
        });
    }

    renderPhotoGrid() {
        const container = document.getElementById('photoSelectionGrid');
        if (!container) return;
        
        if (this.availablePhotos.length === 0) {
            container.innerHTML = `
                <div class="no-photos-message">
                    <span class="material-icons">photo_library</span>
                    <p>No photos available. Upload some photos first in the Photos module.</p>
                    <button class="btn btn-primary" id="goToPhotosBtn">
                        Go to Photos
                    </button>
                </div>
            `;
            
            const goToPhotosBtn = document.getElementById('goToPhotosBtn');
            if (goToPhotosBtn) {
                goToPhotosBtn.addEventListener('click', () => {
                    const photosMenuItem = document.querySelector('.navbar-menu .menu-item[data-page="photos"]');
                    if (photosMenuItem) photosMenuItem.click();
                });
            }
            return;
        }
        
        const sortedPhotos = [...this.availablePhotos].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        container.innerHTML = `
            <div class="photo-count-info">
                <span>${this.availablePhotos.length} photos available (max 1 per share)</span>
            </div>
            <div class="photo-selection-grid">
                ${sortedPhotos.map(photo => `
                    <div class="share-photo-card ${this.selectedPhotoIds.has(photo.id) ? 'selected' : ''}" data-photo-id="${photo.id}">
                        <div class="share-photo-thumbnail">
                            <img src="${photo.url}" alt="${this.escapeHtml(photo.name)}" loading="lazy">
                            <div class="share-photo-overlay">
                                <input type="checkbox" 
                                    class="share-photo-checkbox" 
                                    data-photo-id="${photo.id}"
                                    ${this.selectedPhotoIds.has(photo.id) ? 'checked' : ''}>
                            </div>
                        </div>
                        <div class="share-photo-info">
                            <span class="share-photo-name">${this.escapeHtml(photo.name.substring(0, 20))}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Attach event listeners
        container.querySelectorAll('.share-photo-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.share-photo-checkbox')) return;
                const photoId = card.getAttribute('data-photo-id');
                this.togglePhotoSelection(photoId);
                this.renderPhotoGrid();
            });
        });
        
        container.querySelectorAll('.share-photo-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const photoId = checkbox.getAttribute('data-photo-id');
                if (checkbox.checked) {
                    if (this.selectedPhotoIds.size >= 1) {
                        checkbox.checked = false;
                        this.showError('Maximum 1 photo per share link');
                        return;
                    }
                    this.selectedPhotoIds.add(photoId);
                } else {
                    this.selectedPhotoIds.delete(photoId);
                }
                this.updatePhotoUI();
                this.renderPhotoGrid();
            });
        });
    }

    // ========== UI METHODS ==========
    
    async render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('Share container not found:', containerId);
            return;
        }

        console.log('Rendering share module');
        
        try {
            container.innerHTML = this.getShareHTML();
            this.setupEventListeners();
            this.showSection(this.currentSection);
            this.renderLinksList();
            this.renderPhotoGrid();
            await this.initShareModule();
            
        } catch (error) {
            console.error('Error rendering share module:', error);
            container.innerHTML = '<div class="share-card error"><p>Failed to load share module. Please refresh.</p></div>';
        }
    }

    getShareHTML() {
        const stats = this.getStats();

        return `
            <div class="share-container">
                <div class="module-card">
                    <div class="module-icon" style="color: var(--primary);">
                        <span class="material-icons">share</span>
                    </div>
                    <div class="module-info">
                        <div class="module-title">Secure Share</div>
                        <div class="module-description">Share text or photos with password protection</div>
                    </div>
                </div>

                <!-- Main Grid -->
                <div class="share-grid">
                    <div class="share-sidebar">
                        <div class="share-nav-item active" data-section="create">
                            <span class="material-icons">add_link</span>
                            <span>Create</span>
                        </div>
                        <div class="share-nav-item" data-section="links">
                            <span class="material-icons">link</span>
                            <span>My Links</span>
                        </div>
                        <div class="share-nav-item" data-section="about">
                            <span class="material-icons">info</span>
                            <span>About</span>
                        </div>
                    </div>

                    <div class="share-content">
                        <!-- Messages -->
                        <div id="shareSuccess" class="share-message success" style="display: none;">
                            <span class="material-icons">check_circle</span>
                            <span id="successMessage"></span>
                        </div>
                        <div id="shareError" class="share-message error" style="display: none;">
                            <span class="material-icons">error</span>
                            <span id="errorMessage"></span>
                        </div>

                        <!-- Create Section -->
                        <div class="share-section active" id="create-section">
                            <div class="section-header">
                                <h2>Create Share Link</h2>
                            </div>

                            <div class="share-card">
                                <form id="createLinkForm">
                                    <!-- Content Type -->
                                    <div class="form-group">
                                        <label class="form-label">Content Type</label>
                                        <div class="content-type-selector">
                                            <label class="content-type-option">
                                                <span class="material-icons">description</span>
                                                Text
                                                <input type="radio" name="contentType" value="text" checked>
                                            </label>
                                            <label class="content-type-option"> 
                                                <span class="material-icons">photo_library</span>
                                                Photos
                                                <input type="radio" name="contentType" value="photos">
                                            </label>
                                        </div>
                                    </div>
                                    
                                    <div class="form-group" style="margin-top: 8px;">
                                        <label class="form-label">Link Title *</label>
                                        <input type="text" id="linkTitle" class="form-input" placeholder="e.g., Vacation Photos, Secret Notes" required>
                                    </div>

                                    <!-- Text Content -->
                                    <div id="textContentArea" style="margin-top: 8px;">
                                        <div class="form-group">
                                            <label class="form-label">Content *</label>
                                            <textarea id="linkContent" class="form-textarea" rows="5" placeholder="Your content here..."></textarea>
                                        </div>
                                    </div>
                                    
                                    <!-- Photo Content -->
                                    <div id="photoContentArea" style="display: none; margin-top: 8px">
                                        <div class="form-group">
                                            <label class="form-label">Select Photos (Max 1)</label>
                                            <div id="photoSelectionGrid"></div>
                                            <div id="selectedPhotoCount" class="selected-count">0/1 photos selected</div>
                                            <div id="selectedPhotosPreview"></div>
                                        </div>
                                    </div>

                                    <!-- Security Options -->
                                    <div class="form-group" style="margin-top: 8px;">
                                        <label class="form-label">Security Options</label>
                                        
                                        <div class="security-option">
                                            <div class="security-option-header">
                                                <div class="security-option-title">Password Protection</div>
                                                <label class="toggle-switch">
                                                    <input type="checkbox" id="passwordProtectionToggle">
                                                    <span class="toggle-slider"></span>
                                                </label>
                                            </div>
                                            <div class="security-option-description">
                                                Require password to access shared content
                                            </div>
                                            
                                            <div class="form-group" id="passwordFieldGroup" style="display: none; margin-top: 8px;">
                                                <label class="form-label">Set Access Password</label>
                                                <div class="password-input-group">
                                                    <input type="password" 
                                                        class="form-input" 
                                                        id="linkPassword" 
                                                        placeholder="Enter password (min. 4 characters)"
                                                        minlength="4"
                                                        maxlength="50">
                                                    <button type="button" class="toggle-password-btn" data-target="linkPassword">
                                                        <span class="material-icons">visibility</span>
                                                    </button>
                                                </div>
                                                <div class="form-help">Recipients will need this password to access the shared content</div>
                                            </div>
                                        </div>
                                        
                                        <div class="security-option" style="margin-top: 8px;">
                                            <div class="security-option-header">
                                                <div class="security-option-title">View Once</div>
                                                <label class="toggle-switch">
                                                    <input type="checkbox" id="viewOnceToggle">
                                                    <span class="toggle-slider"></span>
                                                </label>
                                            </div>
                                            <div class="security-option-description">
                                                Content will be viewable for limited seconds, then permanently destroyed
                                            </div>
                                            
                                            <div id="viewOnceSecondsContainer" style="display: none; margin-top: 12px;">
                                                <label class="form-label">View Duration: <span id="secondsValueDisplay">3</span> seconds</label>
                                                <input type="range" 
                                                    id="viewOnceSecondsSlider" 
                                                    min="1" 
                                                    max="10" 
                                                    step="1" 
                                                    value="3"
                                                    class="form-range">
                                                <div class="form-help">Content will self-destruct after this many seconds (1-10 seconds)</div>
                                            </div>
                                            
                                            <div class="form-help view-once-help" id="viewOnceHelp" style="display: none;">
                                                When enabled, the content will self-destruct after the selected view duration
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div class="form-group" style="margin-top: 8px;">
                                        <label class="form-label">Expiration (Optional)</label>
                                        <input type="datetime-local" id="expirationDate" class="form-input">
                                        <div class="form-help">Leave empty for no expiration</div>
                                    </div>
                                    
                                    <div class="form-actions">
                                        <button type="submit" class="btn btn-primary" id="createLinkSubmitBtn">
                                            <i class="fas fa-link"></i> Create Link
                                        </button>
                                        <button type="button" class="btn btn-secondary" id="clearFormBtn">
                                            <i class="fas fa-broom"></i> Clear
                                        </button>
                                    </div>
                                </form>
                            </div>

                            <!-- LINK RESULT SECTION -->
                            <div id="linkResultSection" class="link-result-section" style="display: none;">
                                <div class="result-header">
                                    <span class="material-icons">link</span>
                                    <h3>Share Link Created</h3>
                                    <button class="close-result-btn" id="closeResultBtn">
                                        <span class="material-icons">close</span>
                                    </button>
                                </div>
                                <div class="result-body">
                                    <p>Share this link with others:</p>
                                    <div class="link-url-display" id="resultLinkUrl"></div>
                                    <div id="resultWarning" class="warning-text" style="display: none;">
                                        <strong>Important:</strong> Make sure to share the password separately from the link for security!
                                    </div>
                                    <div id="resultViewOnceWarning" class="warning-text" style="display: none;">
                                        <strong>View Once Mode Active:</strong> Content will be viewable for only <span id="resultSecondsValue">3</span> seconds, then permanently destroyed!
                                    </div>
                                    <div id="resultPhotoInfo" class="result-photo-info" style="display: none;"></div>
                                    <div class="info-text">
                                        This link contains only a unique ID - no personal information is exposed in the URL
                                    </div>
                                </div>
                                <div class="result-actions">
                                    <button class="btn btn-success" id="copyResultLinkBtn">
                                        <i class="fas fa-clone"></i> Copy Link
                                    </button>
                                    <button class="btn btn-secondary" id="closeResultActionBtn">Close</button>
                                </div>
                            </div>
                        </div>

                        <!-- My Links Section -->
                        <div class="share-section" id="links-section">
                            <div class="section-header">
                                <h2>My Share Links</h2>
                                <p>Manage and track your shared links</p>
                            </div>
                            
                            <div>
                                <div id="linksListContainer"></div>
                            </div>
                        </div>

                        <!-- About Section -->
                        <div class="share-section" id="about-section">
                            <div class="section-header">
                                <h2>About Secure Share</h2>
                                <p>Learn about security and features</p>
                            </div>
                            
                            <div class="share-card">
                                <div class="info-header">
                                    <span class="material-icons">security</span>
                                    <h3>Security Features</h3>
                                </div>
                                <div class="info-content">
                                    <ul>
                                        <li><strong>Password Protection:</strong> Optional password protection for sensitive content</li>
                                        <li><strong>Open Access:</strong> Easy sharing for non-sensitive content</li>
                                        <li><strong>View Once:</strong> Content is viewable for limited seconds, then permanently destroyed</li>
                                        <li><strong>Expiration Dates:</strong> Links automatically expire after a set date</li>
                                        <li><strong>View Tracking:</strong> See how many times each link has been viewed</li>
                                        <li><strong>Delete Anytime:</strong> Remove links when no longer needed</li>
                                        <li><strong>Photo Sharing:</strong> Share only 1 photo per link</li>
                                        <li><strong>Text Sharing:</strong> Share notes, messages, or any text securely</li>
                                        <li><strong>Clean URLs:</strong> Share links contain only the unique ID, no user information</li>
                                    </ul>
                                </div>
                            </div>
                            
                            <div class="share-card">
                                <div class="info-header">
                                    <span class="material-icons">privacy_tip</span>
                                    <h3>How It Works</h3>
                                </div>
                                <div class="info-content">
                                    <ol style="padding-left: 20px; margin: 0;">
                                        <li>Create a share link with your content (text or photos)</li>
                                        <li>Choose password protection or open access</li>
                                        <li>Enable "View Once" for self-destructing content</li>
                                        <li>Set an optional expiration date</li>
                                        <li>Share the generated link with others</li>
                                        <li>Recipients can view the content securely</li>
                                        <li>Track views and manage your links</li>
                                    </ol>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderLinksList() {
        const container = document.getElementById('linksListContainer');
        if (!container) return;
        
        const links = Object.values(this.secureLinks);
        
        if (links.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-icons">link_off</span>
                    <p>No share links created yet</p>
                    <button class="btn btn-primary" id="goToCreateBtn">
                        Create Your First Link
                    </button>
                </div>
            `;
            const goToCreateBtn = document.getElementById('goToCreateBtn');
            if (goToCreateBtn) {
                goToCreateBtn.addEventListener('click', () => this.showSection('create'));
            }
            return;
        }

        let html = '';
        const now = new Date();

        for (const link of links) {
            const isExpired = link.expiration && new Date(link.expiration) < now;
            const isDestroyed = link.isDestroyed === true;
            const isPending = link.status === 'pending';
            const isActive = link.status === 'active' || !link.status;
            // Use dynamic site URL from database
            const secureUrl = `${this.getSiteUrlSync()}?id=${link.id}`;
            
            // Format expiration date with time if it exists
            let expirationDisplay = '';
            if (link.expiration) {
                const expirationDate = new Date(link.expiration);
                const formattedDate = expirationDate.toLocaleDateString();
                const formattedTime = expirationDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                expirationDisplay = `<span>Expires: ${formattedDate} at ${formattedTime}</span>`;
            }
            
            html += `
                <div class="share-link-item ${isExpired || isDestroyed || isPending ? 'expired' : ''}" data-link-id="${link.id}">
                    <!-- TOP ROW -->
                    <div class="share-link-top-row">
                        <div class="share-title-section">
                            <div class="share-title">${this.escapeHtml(link.title)}</div>
                            <span class="share-type-badge">
                                ${link.type === 'photos' ? '<span class="material-icons">photo_library</span>' : '<span class="material-icons">description</span>'}
                            </span>
                        </div>
                        
                        <div class="share-actions-top-right">
                            <button class="btn-icon copy-link-btn" data-url="${secureUrl}" ${isPending ? 'disabled style="opacity:0.5;"' : ''} title="Copy Link">
                                <span class="material-icons">content_copy</span>
                            </button>
                            <button class="btn-icon change-password-btn" data-id="${link.id}" title="Change Password">
                                <span class="material-icons">lock</span>
                            </button>
                            <button class="btn-icon toggle-status-btn" data-id="${link.id}" data-status="${link.status || 'active'}" title="${isPending ? 'Activate Link' : 'Pause Link'}">
                                <span class="material-icons">${isPending ? 'play_arrow' : 'pause'}</span>
                            </button>
                            <button class="btn-icon delete-link-btn" data-id="${link.id}" title="Delete Link">
                                <span class="material-icons">delete</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- PASSWORD SECTION -->
                    <div class="share-password-section" id="passwordSection_${link.id}" style="display: none;">
                        ${link.hasPassword ? `
                            <div class="password-remove">
                                <label class="remove-password-label">
                                    <input type="checkbox" id="removePassword_${link.id}">
                                    <span>Remove password protection</span>
                                </label>
                            </div>
                        ` : ''}
                        
                        <div class="password-wrapper">
                            <div class="password-input-group">
                                <input type="text" 
                                    class="form-input password-input" 
                                    id="password_${link.id}" 
                                    placeholder="${link.hasPassword ? 'New password (min 4 chars)' : 'Set password (min 4 chars)'}" 
                                    autocomplete="off">
                                <div class="password-buttons">
                                    <button class="btn-sm btn-success save-password-btn" data-id="${link.id}" title="Save">
                                        <span class="material-icons">check</span>
                                    </button>
                                    <button class="btn-sm btn-secondary cancel-password-btn" data-id="${link.id}" title="Cancel">
                                        <span class="material-icons">close</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- DELETE CONFIRMATION SECTION -->
                    <div class="share-delete-section" id="deleteSection_${link.id}" style="display: none;">
                        <div class="delete-confirm">
                            <div class="warning-text" style="margin-bottom: 12px; font-size: 0.7rem; opacity: 0.8;">
                                <span>This action cannot be undone. The link will be permanently removed.</span>
                            </div>
                            <div class="delete-buttons" style="display: flex; gap: 10px; justify-content: flex-end;">
                                <button class="btn btn-secondary cancel-delete-btn" data-id="${link.id}" title="Cancel">
                                    Cancel
                                </button>
                                <button class="btn btn-danger confirm-delete-btn" data-id="${link.id}" title="Confirm Delete">
                                    <i class="fas fa-trash"></i> Delete Permanently
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- DETAILS SECTION -->
                    <div class="share-details-section">
                        <div class="share-details">
                            <div class="share-detail">
                                <span class="material-icons">calendar_today</span>
                                <span>Created ${new Date(link.createdAt).toLocaleDateString()}</span>
                            </div>
                            ${link.expiration && !isExpired ? `
                            <div class="share-detail">
                                <span class="material-icons">event_busy</span>
                                ${expirationDisplay}
                            </div>
                            ` : ''}
                            ${link.expiration && isExpired ? `
                            <div class="share-detail">
                                <span class="material-icons">event_busy</span>
                                <span>Expired: ${new Date(link.expiration).toLocaleDateString()} at ${new Date(link.expiration).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            ` : ''}
                            <div class="share-detail">
                                <span class="material-icons">visibility</span>
                                <span>${link.views || 0} views</span>
                            </div>
                            ${link.type === 'photos' ? `
                            <div class="share-detail">
                                <span class="material-icons">image</span>
                                <span>${link.photoCount} photo${link.photoCount !== 1 ? 's' : ''}</span>
                            </div>
                            ` : ''}
                        </div>
                        
                        <div class="link-badges">
                            ${link.hasPassword ? '<span class="link-badge badge-password"><span class="material-icons">lock</span> Protected</span>' : ''}
                            ${link.viewOnce ? '<span class="link-badge badge-viewonce"><span class="material-icons">visibility_off</span> View Once</span>' : ''}
                            ${isDestroyed ? '<span class="link-badge badge-destroyed"><span class="material-icons">delete_forever</span> Destroyed</span>' : ''}
                            ${isExpired ? '<span class="link-badge badge-expired"><span class="material-icons">schedule</span> Expired</span>' : ''}
                            ${isPending ? '<span class="link-badge badge-pending"><span class="material-icons">pause_circle</span> Pending</span>' : ''}
                            ${isActive && !isExpired && !isDestroyed && !isPending ? '<span class="link-badge badge-active"><span class="material-icons">check_circle</span> Active</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // Copy link buttons
        container.querySelectorAll('.copy-link-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = btn.getAttribute('data-url');
                await this.copyToClipboard(url);
                this.showSuccess('Link copied!');
            });
        });
        
        // Change password buttons
        container.querySelectorAll('.change-password-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                this.hideAllDeleteSections();
                this.togglePasswordSection(id);
            });
        });
        
        // Save password buttons
        container.querySelectorAll('.save-password-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                await this.savePasswordChange(id);
            });
        });
        
        // Cancel password buttons
        container.querySelectorAll('.cancel-password-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                this.hidePasswordSection(id);
            });
        });
        
        // Toggle status buttons
        container.querySelectorAll('.toggle-status-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                await this.toggleLinkStatus(id);
                this.renderLinksList();
            });
        });
        
        // Delete buttons
        container.querySelectorAll('.delete-link-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                this.hideAllPasswordSections();
                this.toggleDeleteSection(id);
            });
        });
        
        // Cancel delete buttons
        container.querySelectorAll('.cancel-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                this.hideDeleteSection(id);
            });
        });
        
        // Confirm delete buttons
        container.querySelectorAll('.confirm-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                await this.deleteLink(id);
                this.showSuccess('Link deleted');
                this.renderLinksList();
            });
        });
    }

    // Toggle delete section visibility
    toggleDeleteSection(linkId) {
        const section = document.getElementById(`deleteSection_${linkId}`);
        if (section) {
            document.querySelectorAll('.share-delete-section').forEach(s => {
                if (s.id !== `deleteSection_${linkId}`) {
                    s.style.display = 'none';
                }
            });
            section.style.display = section.style.display === 'none' ? 'block' : 'none';
        }
    }

    // Hide delete section
    hideDeleteSection(linkId) {
        const section = document.getElementById(`deleteSection_${linkId}`);
        if (section) {
            section.style.display = 'none';
        }
    }

    // Helper: Hide all password sections
    hideAllPasswordSections() {
        document.querySelectorAll('.share-password-section').forEach(section => {
            section.style.display = 'none';
        });
    }

    // Helper: Hide all delete sections
    hideAllDeleteSections() {
        document.querySelectorAll('.share-delete-section').forEach(section => {
            section.style.display = 'none';
        });
    }

    // Show result section 
    showResultSection(linkData, secureUrl, contentType, photoCount) {
        const resultSection = document.getElementById('linkResultSection');
        if (!resultSection) return;
        
        const linkUrlEl = document.getElementById('resultLinkUrl');
        const warningEl = document.getElementById('resultWarning');
        const viewOnceWarningEl = document.getElementById('resultViewOnceWarning');
        const photoInfoEl = document.getElementById('resultPhotoInfo');
        const secondsSpan = document.getElementById('resultSecondsValue');
        
        if (linkUrlEl) linkUrlEl.textContent = secureUrl;
        
        // Show password warning if needed
        if (warningEl) {
            warningEl.style.display = linkData.hasPassword ? 'block' : 'none';
        }
        
        // Show view once warning with custom seconds
        if (viewOnceWarningEl && linkData.viewOnce) {
            viewOnceWarningEl.style.display = 'block';
            if (secondsSpan) {
                secondsSpan.textContent = linkData.viewOnceSeconds || 3;
            }
        } else if (viewOnceWarningEl) {
            viewOnceWarningEl.style.display = 'none';
        }
        
        // Show photo info if photo share
        if (photoInfoEl && contentType === 'photos') {
            photoInfoEl.style.display = 'block';
            photoInfoEl.innerHTML = `
                <div class="photo-share-info">
                    <span class="material-icons">photo_library</span>
                    <span>${photoCount} photo${photoCount !== 1 ? 's' : ''} shared</span>
                </div>
            `;
        } else if (photoInfoEl) {
            photoInfoEl.style.display = 'none';
        }
        
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Hide result section
    hideResultSection() {
        const resultSection = document.getElementById('linkResultSection');
        if (resultSection) {
            resultSection.style.display = 'none';
        }
    }

    // Attach result section events
    attachResultEvents() {
        const closeResult = () => this.hideResultSection();
        
        const closeBtn = document.getElementById('closeResultBtn');
        const closeActionBtn = document.getElementById('closeResultActionBtn');
        const copyBtn = document.getElementById('copyResultLinkBtn');
        
        if (closeBtn) closeBtn.addEventListener('click', closeResult);
        if (closeActionBtn) closeActionBtn.addEventListener('click', closeResult);
        
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                const linkUrl = document.getElementById('resultLinkUrl')?.textContent;
                if (linkUrl) {
                    await this.copyToClipboard(linkUrl);
                    this.showSuccess('Link copied!');
                    setTimeout(() => this.hideResultSection(), 1500);
                }
            });
        }
    }

    // Toggle password section visibility
    togglePasswordSection(linkId) {
        const section = document.getElementById(`passwordSection_${linkId}`);
        if (section) {
            document.querySelectorAll('.share-password-section').forEach(s => {
                if (s.id !== `passwordSection_${linkId}`) {
                    s.style.display = 'none';
                }
            });
            section.style.display = section.style.display === 'none' ? 'block' : 'none';
            
            if (section.style.display === 'none') {
                const input = document.getElementById(`password_${linkId}`);
                if (input) input.value = '';
                const checkbox = document.getElementById(`removePassword_${linkId}`);
                if (checkbox) checkbox.checked = false;
            } else {
                const input = document.getElementById(`password_${linkId}`);
                if (input) input.focus();
            }
        }
    }

    // Hide password section
    hidePasswordSection(linkId) {
        const section = document.getElementById(`passwordSection_${linkId}`);
        if (section) {
            section.style.display = 'none';
            const input = document.getElementById(`password_${linkId}`);
            if (input) input.value = '';
            const checkbox = document.getElementById(`removePassword_${linkId}`);
            if (checkbox) checkbox.checked = false;
        }
    }

    // Toggle password field visibility
    togglePasswordField(show) {
        const passwordFieldGroup = document.getElementById('passwordFieldGroup');
        if (passwordFieldGroup) {
            passwordFieldGroup.style.display = show ? 'block' : 'none';
            if (show) {
                const passwordInput = document.getElementById('linkPassword');
                if (passwordInput) passwordInput.focus();
            } else {
                const passwordInput = document.getElementById('linkPassword');
                if (passwordInput) passwordInput.value = '';
            }
        }
    }

    // Update security settings
    updateSecuritySettings(setting, value) {
        this.shareSettings = this.shareSettings || {};
        this.shareSettings[setting] = value;
        
        if (setting === 'passwordProtection' && !value) {
            const passwordInput = document.getElementById('linkPassword');
            if (passwordInput) passwordInput.value = '';
        }
    }

    toggleViewOnceHelp(show) {
        const helpText = document.getElementById('viewOnceHelp');
        const secondsContainer = document.getElementById('viewOnceSecondsContainer');
        
        if (helpText) {
            helpText.style.display = show ? 'block' : 'none';
        }
        
        if (secondsContainer) {
            secondsContainer.style.display = show ? 'block' : 'none';
        }
    }

    updateSecondsDisplay() {
        const slider = document.getElementById('viewOnceSecondsSlider');
        const display = document.getElementById('secondsValueDisplay');
        if (slider && display) {
            display.textContent = slider.value;
        }
    }

    async handleCreateLink(e) {
        e.preventDefault();
        const title = document.getElementById('linkTitle')?.value.trim();
        const contentType = document.querySelector('input[name="contentType"]:checked')?.value;
        const passwordProtection = document.getElementById('passwordProtectionToggle')?.checked || false;
        const password = passwordProtection ? document.getElementById('linkPassword')?.value : '';
        let expiration = document.getElementById('expirationDate')?.value;
        const viewOnce = document.getElementById('viewOnceToggle')?.checked || false;
        
        let viewOnceSeconds = 3;
        if (viewOnce) {
            const secondsSlider = document.getElementById('viewOnceSecondsSlider');
            viewOnceSeconds = secondsSlider ? parseInt(secondsSlider.value) : 3;
        }
        
        const linkStatus = 'active';
        
        if (!expiration) {
            const defaultExpiration = new Date();
            defaultExpiration.setDate(defaultExpiration.getDate() + 7);
            expiration = defaultExpiration.toISOString().slice(0, 16);
        }
        
        if (!title) {
            this.showError('Please enter a title');
            return;
        }

        if (!title || title.length < 3) {
            this.showError('Title must be at least 3 characters');
            return;
        }

        if (title.length > 24) {
            this.showError('Title is too long (max 24 characters)');
            return;
        }
        
        if (passwordProtection && (!password || password.length < 4)) {
            this.showError('Please enter a password with at least 4 characters');
            return;
        }
        
        const submitBtn = document.getElementById('createLinkSubmitBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-hourglass"></i> Creating...';
        
        try {
            let result;
            
            if (contentType === 'text') {
                const content = document.getElementById('linkContent')?.value;
                if (!content) {
                    this.showError('Please enter content');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-link"></i> Create Link';
                    return;
                }

                if (content.length > 50000) {
                    this.showError(`Content is too long. Maximum 50000 characters allowed. Current: ${content.length.toLocaleString()}`);
                    return;
                }

                const protectionType = passwordProtection ? 'password' : 'nopassword';
                result = await this.createTextLink(title, content, protectionType, password, expiration, viewOnce, viewOnceSeconds, linkStatus);
            } else {
                if (this.selectedPhotoIds.size === 0) {
                    this.showError('Please select at least one photo');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="fas fa-link"></i> Create Link';
                    return;
                }
                const protectionType = passwordProtection ? 'password' : 'nopassword';
                result = await this.createPhotoLink(title, Array.from(this.selectedPhotoIds), protectionType, password, expiration, viewOnce, viewOnceSeconds, linkStatus);
            }
            
            this.hideResultSection();
            
            this.showResultSection(
                result.linkData, 
                result.secureUrl, 
                contentType, 
                contentType === 'photos' ? result.linkData.photoCount : 0
            );
            
            this.showSuccess('Share link created successfully!');
            this.clearForm();
            this.renderLinksList();
            
        } catch (error) {
            console.error('Create link error:', error);
            this.showError(error.message || 'Failed to create link');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-link"></i> Create Link';
        }
    }

    clearForm() {
        document.getElementById('linkTitle').value = '';
        document.getElementById('linkContent').value = '';
        document.getElementById('linkPassword').value = '';
        
        const defaultExpiration = new Date();
        defaultExpiration.setDate(defaultExpiration.getDate() + 7);
        document.getElementById('expirationDate').value = defaultExpiration.toISOString().slice(0, 16);
        
        const passwordToggle = document.getElementById('passwordProtectionToggle');
        if (passwordToggle) {
            passwordToggle.checked = false;
            this.togglePasswordField(false);
        }
        
        const viewOnceToggle = document.getElementById('viewOnceToggle');
        if (viewOnceToggle) {
            viewOnceToggle.checked = false;
            this.toggleViewOnceHelp(false);
        }
        
        const secondsSlider = document.getElementById('viewOnceSecondsSlider');
        if (secondsSlider) {
            secondsSlider.value = '3';
            this.updateSecondsDisplay();
        }
        
        const secondsContainer = document.getElementById('viewOnceSecondsContainer');
        if (secondsContainer) {
            secondsContainer.style.display = 'none';
        }
        
        document.querySelector('input[name="contentType"][value="text"]').checked = true;
        this.toggleContentType('text');
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.share-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.getAttribute('data-section');
                if (section) this.showSection(section);
            });
        });
        
        // Form submit
        document.getElementById('createLinkForm')?.addEventListener('submit', (e) => this.handleCreateLink(e));
        
        // Clear form
        document.getElementById('clearFormBtn')?.addEventListener('click', () => this.clearForm());
        
        this.attachResultEvents();

        // Password protection toggle
        document.getElementById('passwordProtectionToggle')?.addEventListener('change', (e) => {
            this.togglePasswordField(e.target.checked);
            this.updateSecuritySettings('passwordProtection', e.target.checked);
        });
        
        // View Once toggle
        document.getElementById('viewOnceToggle')?.addEventListener('change', (e) => {
            this.toggleViewOnceHelp(e.target.checked);
            this.updateSecuritySettings('viewOnce', e.target.checked);
            
            if (e.target.checked) {
                const expirationInput = document.getElementById('expirationDate');
                if (expirationInput && expirationInput.value) {
                    const expirationDate = new Date(expirationInput.value);
                    const daysUntilExpiry = (expirationDate - new Date()) / (1000 * 60 * 60 * 24);
                    if (daysUntilExpiry > 30) {
                        this.showWarning('View Once links will self-destruct after first view regardless of expiration date');
                    }
                }
            }
        });
        
        // Seconds slider event
        const secondsSlider = document.getElementById('viewOnceSecondsSlider');
        if (secondsSlider) {
            secondsSlider.addEventListener('input', () => this.updateSecondsDisplay());
        }
        
        // Content type change
        document.querySelectorAll('input[name="contentType"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.toggleContentType(e.target.value));
        });
        
        // Toggle password visibility
        document.querySelectorAll('.toggle-password-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.getAttribute('data-target');
                const input = document.getElementById(targetId);
                if (input) {
                    const type = input.type === 'password' ? 'text' : 'password';
                    input.type = type;
                    btn.querySelector('.material-icons').textContent = type === 'password' ? 'visibility' : 'visibility_off';
                }
            });
        });
        
        this.setupExpirationLimit();

        const defaultExpiration = new Date();
        defaultExpiration.setDate(defaultExpiration.getDate() + 7);
        const expirationInput = document.getElementById('expirationDate');
        if (expirationInput && !expirationInput.value) {
            expirationInput.value = defaultExpiration.toISOString().slice(0, 16);
        }
    }

    setupExpirationLimit() {
        const expirationInput = document.getElementById('expirationDate');
        if (!expirationInput) return;
        
        const maxDate = new Date();
        maxDate.setDate(maxDate.getDate() + 7);
        expirationInput.max = maxDate.toISOString().slice(0, 16);
        
        const minDate = new Date();
        minDate.setHours(0, 0, 0, 0);
        expirationInput.min = minDate.toISOString().slice(0, 16);
        
        if (!expirationInput.value) {
            expirationInput.value = maxDate.toISOString().slice(0, 16);
        }
    }

    showWarning(message) {
        console.warn(message);
        const warningEl = document.createElement('div');
        warningEl.className = 'share-message warning';
        warningEl.innerHTML = `<span class="material-icons">warning</span><span>${message}</span>`;
        const container = document.querySelector('.share-content');
        if (container) {
            container.insertBefore(warningEl, container.firstChild);
            setTimeout(() => warningEl.remove(), 5000);
        }
    }

    toggleContentType(type) {
        const textArea = document.getElementById('textContentArea');
        const photoArea = document.getElementById('photoContentArea');
        
        if (type === 'text') {
            textArea.style.display = 'block';
            photoArea.style.display = 'none';
        } else {
            textArea.style.display = 'none';
            photoArea.style.display = 'block';
            this.renderPhotoGrid();
        }
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            console.error('Copy failed:', error);
            return false;
        }
    }

    showSuccess(message) {
        const successEl = document.getElementById('shareSuccess');
        const messageEl = document.getElementById('successMessage');
        if (successEl && messageEl) {
            messageEl.textContent = message;
            successEl.style.display = 'flex';
            setTimeout(() => {
                successEl.style.display = 'none';
            }, 3000);
        }
    }

    showError(message) {
        const errorEl = document.getElementById('shareError');
        const messageEl = document.getElementById('errorMessage');
        if (errorEl && messageEl) {
            messageEl.textContent = message;
            errorEl.style.display = 'flex';
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 5000);
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showSection(section) {
        document.querySelectorAll('.share-nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const navItem = document.querySelector(`.share-nav-item[data-section="${section}"]`);
        if (navItem) navItem.classList.add('active');
        
        document.querySelectorAll('.share-section').forEach(el => {
            el.classList.remove('active');
        });
        const target = document.getElementById(`${section}-section`);
        if (target) target.classList.add('active');
        
        if (section === 'links') { 
            this.deleteExpiredLinks(); 
            this.renderLinksList();
        }
    }
}

// Initialize
const shareModule = new ShareModule();
window.shareModule = shareModule;

window.addEventListener('authSuccess', () => shareModule.initShareModule());
window.addEventListener('authReady', () => shareModule.initShareModule());