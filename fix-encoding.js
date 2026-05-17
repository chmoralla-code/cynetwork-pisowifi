const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace specific strings
    content = content.replace(/â† /g, '←');
    content = content.replace(/âœ–/g, '✖');
    content = content.replace(/\?\?/g, '📣');
    content = content.replace(/\?([0-9,]+)/g, '₱$1'); // e.g. ?7,500 -> ₱7,500
    content = content.replace(/<li>\? /g, '<li>✓ ');
    content = content.replace(/- \? /g, '- ✓ ');
    content = content.replace(/<span class="logo-icon">\?\?<\/span>/g, '<span class="logo-icon">🌐</span>');
    content = content.replace(/<span class="contact-icon">\?\?<\/span>/g, '<span class="contact-icon">📞</span>');
    content = content.replace(/<span class="upload-icon">\?\?<\/span>/g, '<span class="upload-icon">📸</span>');
    content = content.replace(/<div class="success-icon">\?<\/div>/g, '<div class="success-icon">✓</div>');
    content = content.replace(/<span class="logo-icon">📣<\/span>/g, '<span class="logo-icon">🌐</span>'); // fallback if ?? was already replaced
    content = content.replace(/<span class="contact-icon">📣<\/span>/g, '<span class="contact-icon">📞</span>');
    content = content.replace(/<span class="upload-icon">📣<\/span>/g, '<span class="upload-icon">📸</span>');
    content = content.replace(/<div class="downpayment-icon">📣<\/div>/g, '<div class="downpayment-icon">ℹ️</div>');
    content = content.replace(/>\?</g, '>✓<'); // Catch remaining ? inside tags if they are meant to be checkmarks

    // Also some stray ? in text
    content = content.replace(/Total Payment: \?0\.00/g, 'Total Payment: ₱0.00');

    // Special fix for the mobile menu toggle button ?
    content = content.replace(/>\s*\?\s*<\/button>/g, '>\n                ☰\n            </button>');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed', filePath);
}

function traverseDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            traverseDir(fullPath);
        } else if (fullPath.endsWith('.html') || fullPath.endsWith('.js') || fullPath.endsWith('.css')) {
            fixFile(fullPath);
        }
    }
}

traverseDir(publicDir);
