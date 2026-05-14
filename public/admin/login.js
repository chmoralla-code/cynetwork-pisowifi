// Hardcoded admin credentials
// username: admin | password: admin1234
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin1234';
const ADMIN_SESSION_KEY = 'cynetwork_admin_session';

const loginForm = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');
const loginBtn = loginForm.querySelector('button[type="submit"]');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';

    const username = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    // Simulate a brief delay for UX
    await new Promise(r => setTimeout(r, 600));

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        // Store session in localStorage
        const session = {
            username: ADMIN_USERNAME,
            loginTime: new Date().toISOString(),
            expires: Date.now() + (8 * 60 * 60 * 1000) // 8-hour session
        };
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
        window.location.href = '/admin/index.html';
    } else {
        errorMsg.innerText = 'Invalid username or password. Please try again.';
        errorMsg.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
    }
});

// Check if already logged in
function checkSession() {
    try {
        const raw = localStorage.getItem(ADMIN_SESSION_KEY);
        if (!raw) return;
        const session = JSON.parse(raw);
        if (session && session.expires > Date.now()) {
            window.location.href = '/admin/index.html';
        } else {
            localStorage.removeItem(ADMIN_SESSION_KEY);
        }
    } catch (e) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
    }
}

checkSession();
