import { relocateToLogin } from "../auth";

const unlogin = () => {
  document.cookie = 'token=; Path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
}

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  const unloginBtn = document.querySelector('.profile-data__button');
  
  unloginBtn.addEventListener('click', () => {
    unlogin();
    relocateToLogin();
  })

})