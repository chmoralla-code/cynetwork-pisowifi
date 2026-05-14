const SUPABASE_URL = 'https://ppfelwqvolaxismdpjjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZmVsd3F2b2xheGlzbWRwampjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MDY4NTUsImV4cCI6MjA5MzI4Mjg1NX0.zT6SyMaEoMQaOSOmkFX_OfwZ4wkOfb__rRIjVtUoFGg';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginForm = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.style.display = 'none';

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        errorMsg.innerText = error.message;
        errorMsg.style.display = 'block';
    } else {
        // Redirect to admin dashboard
        window.location.href = '/admin/index.html';
    }
});

// Check if already logged in
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        window.location.href = '/admin/index.html';
    }
}

checkSession();
