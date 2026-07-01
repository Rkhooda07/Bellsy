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

    // Tab Slider Animation
    function updateTabSlider(tabsInner) {
        if (!tabsInner) return;
        const slider = tabsInner.querySelector('.tab-slider');
        const activeBtn = tabsInner.querySelector('.player-tab-btn.active');
        if (slider && activeBtn) {
            slider.style.width = `${activeBtn.offsetWidth}px`;
            // The 4px offset is accounted for by the wrapper's padding in CSS,
            // but offsetLeft is relative to the offsetParent (which is the .player-tabs-inner).
            slider.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
        }
    }

    // Initialize sliders and bind resize
    document.querySelectorAll('.player-tabs-inner').forEach(updateTabSlider);
    window.addEventListener('resize', () => {
        document.querySelectorAll('.player-tabs-inner').forEach(updateTabSlider);
    });

    // Video Tab Switching
    const tabBtns = document.querySelectorAll('.player-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const container = btn.closest('.demo-players-grid');
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
            updateTabSlider(btn.parentElement);
            const targetItem = container.querySelector(`.video-item[data-video="${target}"]`);
            if (targetItem) {
                targetItem.classList.add('active');
                const targetVid = targetItem.querySelector('video');
                if (targetVid) {
                    targetVid.currentTime = 0;
                    if (!targetItem.classList.contains('video-failed')) {
                        targetVid.play().catch(() => {});
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

            video.addEventListener('error', () => {
                item.classList.add('video-failed');
            });

            const sources = video.querySelectorAll('source');
            sources.forEach(source => {
                source.addEventListener('error', () => {
                    item.classList.add('video-failed');
                });
            });

            setTimeout(() => {
                if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
                    item.classList.add('video-failed');
                }
            }, 1000);
        }
    });

    // Install Tab Switcher
    const installTabBtns = document.querySelectorAll('.install-tab-btn');
    installTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Deactivate other tabs
            installTabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.install-tab-content').forEach(c => c.classList.remove('active'));

            // Activate current
            btn.classList.add('active');
            const targetContent = document.getElementById(targetTab);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // Vertical Scroll Indicator
    const scrollIndicator = document.getElementById('scrollIndicator');
    const indicatorItems = document.querySelectorAll('.scroll-indicator-item');
    const sections = ['hero', 'demo', 'how-it-works', 'features', 'install', 'config'];

    function updateScrollIndicator() {
        const scrollY = window.scrollY;
        const windowHeight = window.innerHeight;
        const docHeight = document.documentElement.scrollHeight;

        // Find active section
        let activeSection = 'hero';
        sections.forEach((sectionId, index) => {
            const section = document.getElementById(sectionId);
            if (section) {
                const rect = section.getBoundingClientRect();
                const sectionTop = rect.top + scrollY;
                const sectionHeight = rect.height;
                const sectionCenter = sectionTop + sectionHeight / 2;
                const viewportCenter = scrollY + windowHeight / 2;

                if (Math.abs(sectionCenter - viewportCenter) < windowHeight / 2) {
                    activeSection = sectionId;
                }
            }
        });

        // Update active item
        indicatorItems.forEach(item => {
            const itemSection = item.getAttribute('data-section');
            if (itemSection === activeSection) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Smooth scroll on indicator click
    indicatorItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Throttled scroll handler
    let scrollIndicatorTimeout;
    window.addEventListener('scroll', () => {
        if (!scrollIndicatorTimeout) {
            scrollIndicatorTimeout = setTimeout(() => {
                updateScrollIndicator();
                scrollIndicatorTimeout = null;
            }, 10);
        }
    }, { passive: true });

    // Initial check
    updateScrollIndicator();
});
