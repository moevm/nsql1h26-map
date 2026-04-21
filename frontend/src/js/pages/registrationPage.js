import { relocateToLogin } from "../auth";

const register = async (nickname, email, password) => {
  try {
    const response = await fetch('http://127.0.0.1:10001/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ "username": nickname, "email": email, "password": password }),
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

  const registerBtn = document.querySelector('.sign-up__input--submit');
  const nicknameInput = document.querySelector('.sign-up__input--nickname');
  const emailInput = document.querySelector('.sign-up__input--email');
  const passwordInput = document.querySelector('.sign-up__input--password');

  registerBtn.addEventListener('click', async (evt) => {
    evt.preventDefault();

    const nickname = nicknameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const success = await register(nickname, email, password);
    
    if (success) {
      relocateToLogin();
    }
  });
});