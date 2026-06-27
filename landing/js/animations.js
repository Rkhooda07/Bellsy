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

        // Section reveals and staggered children reveals
        gsap.utils.toArray('.reveal').forEach(element => {
            if (element.classList.contains('stagger-children')) {
                // Animate child elements inside the staggered container
                // We filter only elements with actual height/visibility to avoid blank animations
                const children = Array.from(element.children).filter(child => {
                    return !child.classList.contains('steps-connector'); // exclude connector line
                });
                
                gsap.from(children, {
                    scrollTrigger: {
                        trigger: element,
                        start: "top 85%",
                        toggleActions: "play none none none"
                    },
                    y: 32,
                    opacity: 0,
                    duration: 0.6,
                    stagger: 0.12,
                    ease: "power2.out"
                });
            } else {
                gsap.from(element, {
                    scrollTrigger: {
                        trigger: element,
                        start: "top 85%",
                        toggleActions: "play none none none"
                    },
                    y: 32,
                    opacity: 0,
                    duration: 0.6,
                    ease: "power2.out"
                });
            }
        });
    }

    // Typewriter: hero terminal installation sequence
    const textToType = "npm install -g bellsy";
    const typewriterElement = document.getElementById('typewriter-text');
    const output1 = document.getElementById('terminal-output-1');
    const output2 = document.getElementById('terminal-output-2');
    const cursor = document.querySelector('.typewriter-cursor');

    if (typewriterElement) {
        setTimeout(() => {
            let index = 0;
            const timer = setInterval(() => {
                if (index < textToType.length) {
                    typewriterElement.textContent += textToType.charAt(index);
                    index++;
                } else {
                    clearInterval(timer);
                    
                    // Show line 2 after 500ms
                    setTimeout(() => {
                        if (output1) {
                            output1.style.display = 'block';
                            if (typeof gsap !== 'undefined') {
                                gsap.fromTo(output1, { opacity: 0 }, { opacity: 1, duration: 0.3 });
                            } else {
                                output1.style.opacity = '1';
                            }
                        }
                        
                        // Show line 3 after 400ms more
                        setTimeout(() => {
                            if (output2) {
                                output2.style.display = 'block';
                                if (typeof gsap !== 'undefined') {
                                    gsap.fromTo(output2, { opacity: 0 }, { opacity: 1, duration: 0.3 });
                                } else {
                                    output2.style.opacity = '1';
                                }
                            }
                            
                            // Clean up cursor blinking
                            if (cursor) {
                                cursor.style.animation = 'none';
                                cursor.style.opacity = '0';
                            }
                        }, 400);
                        
                    }, 500);
                }
            }, 40); // 40ms per character
        }, 1200); // 1.2s delay
    }
});
