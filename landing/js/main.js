// Bellsy Main Interactions

document.addEventListener('DOMContentLoaded', () => {
    // Mobile navigation drawer toggle
    const menuToggle = document.getElementById('menuToggle');
    const navLinksWrapper = document.getElementById('navLinksWrapper');
    const navLinks = document.querySelectorAll('.nav-links a, .nav-cta');

    if (menuToggle && navLinksWrapper) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('active');
            navLinksWrapper.classList.toggle('active');
            // Prevent body scroll when menu is active
            document.body.style.overflow = navLinksWrapper.classList.contains('active') ? 'hidden' : '';
        });

        // Close mobile menu when link is clicked
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                navLinksWrapper.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }

    // Video Tab Switching
    const tabBtns = document.querySelectorAll('.player-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const container = btn.closest('.demo-player-container');
            const target = btn.getAttribute('data-target');
            
            // Deactivate current tabs and items
            container.querySelectorAll('.player-tab-btn').forEach(b => b.classList.remove('active'));
            container.querySelectorAll('.video-item').forEach(item => {
                item.classList.remove('active');
                // Pause video when switching away
                const vid = item.querySelector('video');
                if (vid) vid.pause();
            });

            // Activate new tab and item
            btn.classList.add('active');
            const targetItem = container.querySelector(`.video-item[data-video="${target}"]`);
            if (targetItem) {
                targetItem.classList.add('active');
                const targetVid = targetItem.querySelector('video');
                if (targetVid) {
                    targetVid.currentTime = 0;
                    // Play if not failed
                    if (!targetItem.classList.contains('video-failed')) {
                        targetVid.play().catch(() => {
                            // Autoplay restriction check
                        });
                    }
                }
            }
        });
    });

    // Custom Video Controls (Play/Pause on hover overlay click)
    const videoItems = document.querySelectorAll('.video-item');
    videoItems.forEach(item => {
        const video = item.querySelector('video');
        const overlay = item.querySelector('.video-overlay');
        const playPauseBtn = item.querySelector('.play-pause-btn');
        const playIcon = item.querySelector('.play-icon');
        const pauseIcon = item.querySelector('.pause-icon');

        if (video && overlay) {
            const togglePlay = (e) => {
                e.stopPropagation();
                if (item.classList.contains('video-failed')) return;
                
                if (video.paused) {
                    video.play().then(() => {
                        if (playIcon) playIcon.style.display = 'none';
                        if (pauseIcon) pauseIcon.style.display = 'block';
                    }).catch(() => {});
                } else {
                    video.pause();
                    if (playIcon) playIcon.style.display = 'block';
                    if (pauseIcon) pauseIcon.style.display = 'none';
                }
            };

            overlay.addEventListener('click', togglePlay);
            if (playPauseBtn) {
                playPauseBtn.addEventListener('click', togglePlay);
            }

            video.addEventListener('play', () => {
                if (playIcon) playIcon.style.display = 'none';
                if (pauseIcon) pauseIcon.style.display = 'block';
            });

            video.addEventListener('pause', () => {
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
            });

            // Video error handling -> fallback placeholder
            video.addEventListener('error', () => {
                item.classList.add('video-failed');
            });

            const sources = video.querySelectorAll('source');
            sources.forEach(source => {
                source.addEventListener('error', () => {
                    item.classList.add('video-failed');
                });
            });

            // Fallback checking in case error event doesn't fire but state is error
            setTimeout(() => {
                if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
                    item.classList.add('video-failed');
                }
            }, 1000);
        }
    });
});
