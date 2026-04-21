import { relocateToLogin } from "../auth";

const login = async (email, password) => {
  try {
    const response = await fetch('http://127.0.0.1:10001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    
    if (response.ok && data.token) {
      document.cookie = `token=${data.token}; Path=/; SameSite=Strict;`;
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  const loginBtn = document.querySelector('.sign-in__input--submit');
  const emailInput = document.querySelector('.sign-in__input--email');
  const passwordInput = document.querySelector('.sign-in__input--password');

  loginBtn.addEventListener('click', async (evt) => {
    evt.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const success = await login(email, password);
    
    if (success) {
      relocateToLogin();
    }
  });
});