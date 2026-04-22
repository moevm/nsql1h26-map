function getCookie() {
  return document.cookie.split('; ').reduce((acc, item) => {
    const [name, value] = item.split('=');
    acc[name] = value;
    return acc;
  }, {})
}

function isAuthenticated() {
  const cookies = getCookie();
  return cookies.token;
}

export function relocateToLogin() {
  const isAuth = isAuthenticated();
  const currentLocation = window.location.pathname;

  if (!isAuth) {
    if (currentLocation === '/pages/login.html' || currentLocation === '/pages/registration.html') {
      return;
    }
    window.location.href = '/pages/login.html';
  }

  if (currentLocation === '/pages/login.html' || currentLocation === '/pages/registration.html' || currentLocation === '/index.html') {
    window.location.href = '/pages/profile.html';
  }

  return;
}
