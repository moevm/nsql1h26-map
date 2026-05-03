import { relocateToLogin } from "../auth";
import { Notify } from "../utils/notify";
import { userManager } from "../localManagers/userManager";

const register = async (nickname, email, password) => {

  if ([nickname, email, password].some(field => !field)) {
    throw new Error("Поля должны быть заполнены");
  }

  const response = await fetch('http://127.0.0.1:10001/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
       "username": nickname,
       "email": email,
       "password": password 
      }),
  }).catch((error) => {
    throw new Error("Ошибка сервера");
  });

  const data = await response.json();
  
  if (response.ok && data.token) return data;

  throw new Error("Не удалось зарегистрироваться");
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

    register(nickname, email, password)
    .then((data) => {
      document.cookie = `token=${data.token}; Path=/; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`;
      Notify.success("Успешный вход");
      userManager.save(JSON.stringify(data.user));
      relocateToLogin();
    })
    .catch((error) => {
      Notify.error(error);
    })
  });
});