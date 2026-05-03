import { relocateToLogin } from "../auth";
import { Notify } from "../utils/notify";
import { userManager } from "../localManagers/userManager"

const login = async (email, password) => {
  if ([email, password].some(field => !field)) {
    throw new Error("Поля должны быть заполнены");
  }

  const response = await fetch('http://127.0.0.1:10001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).catch((error) => {
    throw new Error(`Ошибка сервера ${error}`);
  });

  const data = await response.json();

  if (response.ok && data.token) return data;

  throw new Error("Неверный логин или пароль");
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

    login(email, password)
      .then((data) => {
        document.cookie = `token=${data.token}; Path=/; SameSite=Strict; Max-Age=${30 * 24 * 60 * 60}`;
        userManager.save(JSON.stringify(data.user));
        Notify.success("Успешный вход");
        relocateToLogin();
      })
      .catch((error) => {
        Notify.error(error);
      })
  });
});