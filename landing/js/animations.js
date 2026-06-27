// Bellsy Scroll Progress, Scroll State Handler, and GSAP Animations

document.addEventListener('DOMContentLoaded', () => {
    // Navbar Scroll Progress & State Handler
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
    window.addEventListener('scroll', handleScroll, { passive: true });

    // GSAP Animations
    if (typeof gsap !== 'undefined') {
        // Register ScrollTrigger plugin
        gsap.registerPlugin(ScrollTrigger);

        // Hero stagger reveal upward
        gsap.from('.hero-animate', {
            y: 24,
            opacity: 0,
            duration: 0.7,
            stagger: 0.1,
            ease: "power2.out"
        });
    }

    // Typewriter: hero terminal second line
    const textToType = "bellsy-run claude";
    const typewriterElement = document.getElementById('typewriter-text');
    if (typewriterElement) {
        setTimeout(() => {
            let index = 0;
            const timer = setInterval(() => {
                if (index < textToType.length) {
                    typewriterElement.textContent += textToType.charAt(index);
                    index++;
                } else {
                    clearInterval(timer);
                }
            }, 40); // 40ms per character
        }, 1200); // 1.2s delay
    }
});
