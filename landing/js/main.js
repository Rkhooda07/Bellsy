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
});
