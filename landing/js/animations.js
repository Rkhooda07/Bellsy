// Bellsy Scroll Progress and Scroll State Handler

document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.getElementById('navbar');
    const scrollProgress = document.getElementById('scrollProgress');

    function handleScroll() {
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrollPercent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

        // Update progress bar
        if (scrollProgress) {
            scrollProgress.style.width = `${scrollPercent}%`;
        }

        // Toggle navbar scrolled state
        if (navbar) {
            if (scrollTop > 60) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }
    }

    // Initialize state on load
    handleScroll();

    // Listen to scroll events
    window.addEventListener('scroll', handleScroll, { passive: true });
});
