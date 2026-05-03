const fs = require('fs');
const filePath = 'c:\\Users\\Cyrhiel\\Documents\\GAME CODE PRACTICE\\pisowifi_website.html';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add Step 4 Indicator
content = content.replace(
    '<span id="step3Indicator">3</span>',
    '<span id="step3Indicator">3</span>\n                <span id="step4Indicator">4</span>'
);

// 2. Add Step 4 HTML and replace Step 3 Submit button with a Next button
const step4HTML = `<button type="button" class="btn-next" onclick="nextOrderStep()">Next: WiFi Setup</button>
                </div>

                <!-- Step 4: WiFi Configuration -->
                <div id="orderStep4" class="order-modal-step">
                    <div class="form-group">
                        <label>Preferred WiFi Name (SSID):</label>
                        <input type="text" id="wifiName" name="wifiName" placeholder="e.g. PisoWifi-YourName" required />
                    </div>
                    <div class="form-group">
                        <label>WiFi Rates Configuration:</label>
                        <p style="font-size: 12px; color: #888; margin-bottom: 5px;">Set your time rates (e.g. 10mins, 1 hour)</p>
                        <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                            <span style="min-width: 40px; font-weight: bold;">?1:</span>
                            <input type="text" id="rate1" name="rate1" placeholder="e.g. 10mins" style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid rgba(200, 50, 50, 0.3); background: rgba(0, 0, 0, 0.2); color: white;" required />
                        </div>
                        <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                            <span style="min-width: 40px; font-weight: bold;">?5:</span>
                            <input type="text" id="rate5" name="rate5" placeholder="e.g. 1 hour" style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid rgba(200, 50, 50, 0.3); background: rgba(0, 0, 0, 0.2); color: white;" required />
                        </div>
                        <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                            <span style="min-width: 40px; font-weight: bold;">?10:</span>
                            <input type="text" id="rate10" name="rate10" placeholder="e.g. 3 hours" style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid rgba(200, 50, 50, 0.3); background: rgba(0, 0, 0, 0.2); color: white;" required />
                        </div>
                        <div style="display: flex; gap: 10px; margin-bottom: 10px; align-items: center;">
                            <span style="min-width: 40px; font-weight: bold;">?20:</span>
                            <input type="text" id="rate20" name="rate20" placeholder="e.g. 8 hours" style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid rgba(200, 50, 50, 0.3); background: rgba(0, 0, 0, 0.2); color: white;" required />
                        </div>
                    </div>
                    <button type="button" class="btn-prev" onclick="prevOrderStep()">Back</button>
                    <button type="submit" class="btn-submit">Complete Order</button>
                </div>`;

content = content.replace(/<button type="submit" class="btn-submit">.*?Complete Order<\/button>\r?\n\s*<\/div>/, step4HTML);

// 3. Update nextOrderStep() logic to handle Step 3 to Step 4 transition
const newNextStep = `if (currentOrder.currentStep < 4) {
                if (currentOrder.currentStep === 2) { // Validate proof step
                    if (!proofInput.files[0] || !refNumberInput.value.trim()) {
                        alert('Please upload proof of payment and enter a reference number.');
                        return;
                    }
                    currentOrder.proofFile = proofInput.files[0];
                    currentOrder.refNumber = refNumberInput.value.trim();
                } else if (currentOrder.currentStep === 3) {
                    if (!fullNameInput.value.trim() || !contactNumberInput.value.trim() || !fullAddressInput.value.trim() || !contactEmailInput.value.trim()) {
                        alert('Please fill in all required shipping information.');
                        return;
                    }
                    if (!contactEmailInput.value.includes('@')) {
                        alert('Please enter a valid email address.');
                        return;
                    }
                }`;
content = content.replace(/if \(currentOrder\.currentStep < 3\) \{\s*if \(currentOrder\.currentStep === 2\) \{ \/\/ Validate proof step\s*if \(\!proofInput\.files\[0\] \|\| \!refNumberInput\.value\.trim\(\)\) \{\s*alert\('Please upload proof of payment and enter a reference number\.'\);\s*return;\s*\}\s*currentOrder\.proofFile = proofInput\.files\[0\];\s*currentOrder\.refNumber = refNumberInput\.value\.trim\(\);\s*\}/, newNextStep);

// 4. Update data collection on submit
content = content.replace(/const contactEmail = document\.getElementById\('contactEmail'\)\.value;/, `const contactEmail = document.getElementById('contactEmail').value;
            const wifiName = document.getElementById('wifiName').value;
            const rate1 = document.getElementById('rate1').value;
            const rate5 = document.getElementById('rate5').value;
            const rate10 = document.getElementById('rate10').value;
            const rate20 = document.getElementById('rate20').value;`);

// 5. Append new fields to FormData (when proof file is attached)
content = content.replace(/payload\.append\('contactEmail', contactEmail\); \/\/ Added/, `payload.append('contactEmail', contactEmail); // Added
                payload.append('wifiName', wifiName);
                payload.append('rate1', rate1);
                payload.append('rate5', rate5);
                payload.append('rate10', rate10);
                payload.append('rate20', rate20);`);

// 6. Add new fields to JSON payload (fallback when no proof file)
content = content.replace(/contactEmail: contactEmail \/\/ Added/, `contactEmail: contactEmail, // Added
                    wifiName: wifiName,
                    rate1: rate1,
                    rate5: rate5,
                    rate10: rate10,
                    rate20: rate20`);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated HTML');
